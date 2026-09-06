# HWP5 기반 구현과 적대적 검증

2026-09-05. 범위: FileHeader → DocInfo/BodyText 압축 해제 → 레코드 경계 읽기.
본문 의미 해석·레이아웃·편집·HWP 저장·HWPX는 이번 구현 범위가 아닙니다.

본 제품은 한글과컴퓨터의 글 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다.

## 명세와 독립 기준

- 기준: 한컴 [HWP 5.0 revision 1.3 공식 PDF](https://cdn.hancom.com/link/docs/%ED%95%9C%EA%B8%80%EB%AC%B8%EC%84%9C%ED%8C%8C%EC%9D%BC%ED%98%95%EC%8B%9D_5.0_revision1.3.pdf), §3.1, §3.2.1, §4.1. 공식 PDF를 직접 내려받아 해당 표/설명을 대조했습니다. SHA-256: `1d1da9e6fe22563ae2c5285bbbfc6762974fb7f002278084cbc11e5266bdc782`.
- 저장소의 `legacy/rust/.claude/skills/hwp-spec/` 해당 파트와 `legacy/rust/documents/docs/spec/hwp-5.0.md`는 탐색용입니다. 보충 설명이나 수정 표시가 있으므로 공식 원문과 구분합니다.
- rhwp `e8800c8de`의 `src/parser/header.rs`, `record.rs`를 대조했습니다. 코드 이식은 하지 않았습니다. rhwp의 레코드 끝 1~3바이트 무시 동작은 채택하지 않았습니다.
- 기존 Rust `decompress.rs`, FileHeader 상수와 실제 fixture를 참고했습니다. 압축 바이트 oracle은 Node 24 zlib, 레코드 oracle은 테스트의 독립 정수 해석입니다. 제품에서 Rust/JS 파서를 호출하지 않습니다.
- raw DEFLATE 뒤의 CRC32/ISIZE와 5.1 framing 지원은 실제 파일 실측 근거입니다. 공식 5.0 명세가 모든 5.1 payload 필드까지 보장한다는 의미가 아닙니다.

## SSOT와 파일별 책임

| 책임 | 유일한 제품 소유자 |
|---|---|
| 경계 검사·LE 정수 읽기 | `src/binary/reader.zig` |
| 256바이트 헤더·플래그 위치·라이선스/국가/예약 원값 | `src/hwp5/file_header.zig` |
| 버전 바이트 해석·현재 framing 지원 범위 | `src/hwp5/version.zig` |
| 미지원 암호화/DRM/배포용 판단·압축 여부 | `src/hwp5/stream.zig` |
| HWP 압축 스트림의 선택적 CRC32/ISIZE trailer 검사 | `src/hwp5/compressed_stream.zig` |
| 출력 제한·할당 소유권·raw DEFLATE 소비 길이 | `src/compression/raw_deflate.zig` |
| DEFLATE 비트/Huffman 알고리즘·토큰 표 | `src/compression/flate/Decompress.zig`, `token.zig` |
| 태그/레벨/일반·확장 길이·원본 레코드 범위 | `src/hwp5/record.zig` |

헤더는 raw 256바이트만 소유하며 파생 bool/버전 필드를 중복 저장하지 않습니다. 테스트도 헤더·레코드·압축 책임별 파일로 분리했습니다. CFB에 HWP 규칙을 넣지 않았고, 코어에 파일시스템·Node·브라우저 의존성은 없습니다. `root.zig`는 공개 진입점만 조립합니다.

`tests/hwp5/probe.zig`는 테스트 전용 WASM bridge입니다. 실제 코어를 import해 실행하며 헤더/압축/레코드 규칙을 재구현하지 않습니다. JS의 별도 해석은 독립 검증 oracle일 뿐 제품 SSOT가 아닙니다. 기존 제품 ABI schema와 버전은 변경하지 않았습니다. **제품 `hwpjs.wasm`/JS 공개 API에는 아직 HWP 문서 파싱이 노출되지 않습니다.**

DEFLATE는 MIT인 Zig 0.16.0의 로컬 수정본을 사용합니다. 외부 구현 자체의 알고리즘은 불필요하게 재분할하지 않았습니다. 원본 대비 변경과 라이선스는 [제3자 고지](../THIRD_PARTY_NOTICES.md)에 기록합니다. 배포된 Zig에 포함되지 않은 외부 testdata에 의존하는 upstream 테스트 41개는 복제하지 않았으며, 자체 재현/독립 zlib 검증으로 대체합니다. 나머지 자체 포함 upstream 테스트는 실행합니다.

## API·소유권·거부 정책

```zig
const header = try hwpjs.hwp5.Header.parse(file_header_bytes);
const plain = try hwpjs.hwp5.stream.decode(allocator, &header, docinfo_bytes, 64 * 1024 * 1024);
defer allocator.free(plain);
var records = hwpjs.hwp5.record.Iterator.init(plain, .{});
while (try records.next()) |record| {
    // record.raw/payload는 plain을 빌립니다. plain보다 오래 보관하면 복사해야 합니다.
    _ = record;
}
```

- `Header.parse`는 정확히 256바이트와 signature+NUL 패딩을 검사합니다. 헤더 구조 읽기와 기능 지원 판단을 분리해 미지원 버전/알 수 없는 비트·예약 207바이트도 원값을 보존합니다.
- `stream.decode`는 5.0/5.1 계열 framing을 허용합니다. 다른 major/minor는 UnsupportedVersion입니다. patch/revision별 payload 의미 해석은 아직 없습니다.
- 암호 설정·인증서 암호화는 UnsupportedEncryption, DRM/인증서 DRM은 UnsupportedDrm, 배포용은 UnsupportedDistribution입니다. EncryptVersion 단독 값으로 암호화 여부를 추론하지 않습니다.
- `stream.decode`의 대상은 DocInfo와 BodyText section입니다. BinData는 레코드별 압축 설정이 있으므로 이 함수를 무조건 적용하면 안 됩니다. FileHeader/미리보기 등에도 적용하지 않습니다.
- 압축/비압축 모두 반환 버퍼를 호출자가 해제합니다. 출력 길이 한도는 압축 해제 도중 적용합니다. 내부 window/청크 및 배열 capacity 여유분은 별도 메모리를 사용하므로 한도는 전체 힙 사용량 한도가 아닙니다.
- raw `decode`는 정확히 한 스트림만 허용하며 임의 suffix는 TrailingData입니다. `decodePrefix`는 소비 길이를 반환하므로 상위 포맷이 trailer를 검증해야 합니다. HWP 계층은 suffix 없음 또는 정확히 8바이트 CRC32+ISIZE가 모두 맞는 경우만 허용합니다. gzip/zlib 헤더 fallback은 없습니다.
- 레코드는 기본 payload 64 MiB, 레코드 수 1,000,000 한도입니다. 빈 payload도 최소 4바이트를 소비합니다. 오류 시 cursor/count는 불변이므로 호출자는 오류 후 반복을 멈춰야 합니다.
- 일반 헤더의 size=4095는 확장 DWORD를 읽습니다. 비정규적인 작은 확장 size도 원본 표현을 보존합니다. 잘린 헤더/확장 DWORD/payload는 UnexpectedEnd이며 끝 1~3바이트를 버리지 않습니다.
- unknown tag와 level은 그대로 반환합니다. framing 리더는 계층의 의미나 태그별 필수 필드를 검증하지 않습니다. 원본 레코드 보존은 재저장 API 구현/무손실 저장 보장과 다릅니다.

## 구현 후 적대적 검증 5회

같은 테스트만 5번 반복한 것이 아니라 아래 순서로 공격 관점을 바꾸었습니다. 발견 사항을 수정하고 전체 5개 묶음을 다시 실행합니다. `checks`는 WASM probe 호출 수이며 네이티브 단위 테스트 수와 별개입니다.

| 회차 | 검증 | 최종 실측 |
|---|---|---|
| 1 | 명세 헤더 대조·256개 잘림·signature 변조·32개 플래그·버전/기능 게이트 | 329회 호출 통과 |
| 2 | stored/fixed/dynamic 36조합, 32 KiB window 경계, 한도−1/한도/한도+1, 잘림·wrapper·suffix | 282회 호출 통과 |
| 3 | tag/level 0~1023 전 범위, 4094/4095/4096 경계, 확장 크기, 잘림·레코드 수 제한 | 1,106회 호출 통과 |
| 4 | 실제 HWP → CFB → 헤더 → 압축 → 레코드와 독립 oracle 비교 | 235회 호출, 아래 실제 파일 결과 |
| 5 | 결정적 압축 변이 2,000개, 매번 정상 입력 복구, SSOT/책임/소유권 코드 재검토 | 4,000회 호출, 수용 478·거부 1,522·복구 2,000, 트랩 0 |

총 5,952회 호출. 수용한 변이는 Node zlib의 출력과 전 바이트 비교합니다. 거부는 InvalidDeflate/TrailingData/LimitExceeded만 허용하고 WASM trap이나 assertion 실패는 테스트 실패입니다. 이 변이 corpus가 모든 Huffman 입력/공격 공간을 포괄하지는 않습니다.

레코드 probe는 payload 한도를 wasm32 usize 최댓값으로 열어 둔 상태에서도 `0xffffffff` 확장 길이를 UnexpectedEnd로 거부하는지 확인합니다. 기본 한도에 먼저 막혀 오버플로 검사가 가려지는 것을 방지합니다.

### 발견·수정한 사항

1. 첫 구현의 표준 `allocRemaining(limit)` 사용은 정확히 한도만큼 출력한 정상 스트림까지 거부했습니다. 한도 도달 시 1바이트 EOF 확인을 하는 bounded loop로 수정했고 빈 출력/한도 0도 검사합니다.
2. Zig 0.16.0 `tossBitsShort`는 사용 가능한 비트에 이미 소비한 비트를 더해 검사했습니다. 잘린 dynamic 블록에서 EOF를 넘어 정렬하면서 WASM unreachable이 재현됐습니다. 올바른 `available >= requested + consumed` 검사로 수정했습니다. 재현: 길이 32767, 바이트 `(i*17+(i>>7))&255`, Node deflateRaw level=9, 압축 바이트 1384개로 잘라 회차 2 실행. 직접 비트 경계 네이티브 회귀도 추가했습니다.
3. EncryptVersion=4를 암호화로 취급하던 첫 정책이 정상 파일을 거부했습니다. 실제 플래그가 기준이고 이 값은 원본 메타데이터로 남기도록 수정했습니다.
4. 순수 raw DEFLATE만 허용하던 첫 HWP 정책은 실제 파일의 8바이트 trailer를 거부했습니다. CRC32/ISIZE를 검증하는 HWP 전용 계층을 추가했습니다. 각 CRC/길이 바이트 변조, 잘린/늘어난 trailer, trailer 없는 raw, 오류 경로 할당 실패를 네이티브 테스트합니다.
5. 처음의 5.0 전용 게이트는 실제 5.1 fixture를 거부했습니다. 5.1의 압축/framing은 실제 바이트 비교 후 허용하되, 향후 payload 필드의 5.0 동일성은 가정하지 않습니다.

초기 signature 길이 오타는 컴파일 단계에서 수정했습니다. 할당 실패 주입 helper가 예상된 OutOfMemory까지 assertion으로 바꾸던 테스트 오류도 수정했습니다. 위 제품 결함과 테스트 작성 오류를 구분합니다.

회귀 테스트의 탐지력도 확인했습니다. 비트 경계 수정만 임시로 원복하면 아래 테스트가 `expected error.EndOfStream, found void`로 실패하며 수정 복원 후 통과합니다. 루트 모듈에서 이름 필터만 걸면 Zig의 지연 분석 때문에 대상 테스트가 수집되지 않으므로 파일을 직접 지정합니다.

```sh
zig test src/compression/flate/Decompress.zig -O Debug --test-filter 'short-bit EOF'
```

### 실제 파일 결과

- 48개 FileHeader 해석. 관측 버전: 5.0.1.7, 5.0.3.0, 5.0.5.0, 5.1.0.1, 5.1.1.0.
- 지원 가능한 45개 파일의 92개 DocInfo/section 스트림, 10,425개 레코드, 압축 해제 데이터 470,675바이트가 독립 기준과 일치했습니다.
- `password-12345.hwp`는 UnsupportedEncryption, `distribution.hwp`·`viewtext.hwp`는 UnsupportedDistribution을 확인했습니다. 이 3개를 본문 해석 성공으로 세지 않습니다.
- 실제 한글 프로그램을 실행한 화면/본문 의미 검증은 하지 않았습니다. CFB 기존 48개 v3/v4 재저장 검증과 이 HWP framing 검증은 별개입니다.

## 재현 명령과 남은 범위

```sh
zig build hwp5-audit -Doptimize=ReleaseSafe --summary all
zig build audit -Doptimize=Debug --summary all
zig build audit -Doptimize=ReleaseSafe --summary all
zig build audit -Doptimize=ReleaseFast --summary all
zig fmt --check build.zig src tests/hwp5/probe.zig
```

전체 audit는 기존 CFB 차등 비교·손상 변이·Node 계약과 신규 HWP5 검증을 함께 실행합니다. 네이티브 테스트에는 할당 실패 전수 주입과 오류 후 정리를 포함합니다. 테스트 전용 WASM은 외부 import 0개입니다.

기반 구현 당시 전체 테스트 수는 네이티브 44개, 기존 Node/WASM 계약 47개입니다. HWP5의 5,952회 호출은 별도 audit 집계입니다. 후속 DocInfo 결과는 아래에 구분합니다.

다음 단계는 DocInfo 문서 속성·ID 매핑과 BodyText 문단 레코드의 의미 해석입니다. 그때 버전별 필드 존재 조건, 공통 문서 모델, 제품 JS/WASM ABI를 별도로 설계·검증해야 합니다. 암호/배포용 복호화, BinData 개별 압축, 문서 전체 합산 자원 제한과 재저장, 렌더링은 이번 완료 주장에 포함하지 않습니다.

## 후속 구현: DocInfo 문서 속성·ID 매핑

2026-09-05. 위 기반 단계 이후 `hwp5.docinfo.Iterator`를 추가했습니다. **DocInfo 전체 의미 해석 완료가 아니라 태그 16·17만 해석하는 단계**입니다. 제품 JS ABI는 여전히 CFB만 제공합니다.

### 근거와 실측 차이

- 공식 PDF §4.2.1 표 14: 문서 속성은 u16 7개와 u32 3개, 총 26바이트입니다. 시작번호/캐럿 위치의 설명 행은 추가 필드가 아닙니다. 로컬 분할 명세의 표 행을 그대로 필드로 세면 길이가 틀리므로 공식 원문으로 확인했습니다.
- 공식 §4.2.2 표 16: ID 매핑은 기본 15개, 5.0.2.1부터 메모 모양까지 16개, 5.0.3.2부터 변경추적/작성자까지 18개입니다.
- 실제 45개 정상 fixture의 문서 속성은 모두 26바이트입니다. ID 매핑은 5.0.1.7 11개 파일에서 64바이트, 5.0.3.0 1개에서 64바이트, 5.1.0.1 32개와 5.1.1.0 1개에서 72바이트입니다. **5.0.1.7에서도 16번째 슬롯이 실제로 존재**하므로 버전만으로 잘라 버리지 않습니다.
- rhwp `doc_info.rs`는 짧은 문서 속성을 1/0으로, 누락된 ID 매핑을 0으로 채우는 경로가 있습니다. 우리는 필수 문서 속성 26바이트와 기본 매핑 60바이트 잘림을 오류로 반환하고, 후속 슬롯의 부재는 null로 구분합니다. 기존 구현의 관대한 처리가 이 라이브러리의 정답이라는 가정은 하지 않았습니다.

### API와 책임

| 파일 | 책임 |
|---|---|
| `src/hwp5/docinfo/properties.zig` | 구역 수·6개 시작번호·3개 캐럿 값, 26바이트 뒤 확장 데이터 보존 |
| `src/hwp5/docinfo/id_mappings.zig` | 18개 필드 인덱스·도입 버전·실제 슬롯 수·선택적 signed 값 |
| `src/hwp5/docinfo/reader.zig` | 기존 framing Iterator로 읽고 알려진 태그만 해석, raw 보존·실패 원자성 |
| `tests/hwp5/docinfo-probe.zig`, `docinfo.mjs` | 실제 WASM 코어 실행·독립 바이트 기준과 비교하는 테스트 전용 어댑터 |

```zig
var it = try hwpjs.hwp5.docinfo.Iterator.init(plain_docinfo, header.version(), .{});
while (try it.next()) |record| {
    switch (record.value) {
        .properties => |p| { _ = p.section_count; },
        .id_mappings => |m| {
            const actual = m.count();
            const expected = m.expectedCount();
            const memo: ?i32 = m.get(.memo_shape);
            _ = actual; _ = expected; _ = memo;
        },
        .bin_data, .face_name, .tab_def, .numbering, .bullet, .style,
        .border_fill, .char_shape, .para_shape, .unknown => {},
    }
}
```

실제 count와 기대 count의 차이는 호출자가 확인할 수 있으며 오류로 강제하지 않습니다. 필드가 있으면 0도 실제 값으로 반환하고 없으면 null입니다. 명세의 INT32를 유지하므로 음수도 보존합니다. 음수를 유효한 리소스 개수로 인정하거나 이 값으로 할당하는 것은 아닙니다. 리소스 개수/참조 유효성 검증은 후속 조립 계층의 책임입니다.

기본 60바이트 미만은 UnexpectedEnd, 4바이트 비정렬 매핑은 InvalidMappingSize입니다. 18번째 뒤의 미해석 슬롯은 extra()에 남습니다. 알려진 태그의 level은 0이어야 합니다. 그 외 태그는 전체 raw/header/payload를 보존하며, 해석 실패 시 framing cursor/count가 전진하지 않습니다. 반환 raw/extra/매핑 값의 backing bytes는 입력을 빌립니다.

이 Iterator는 필수 태그 존재·중복·순서·구역 수와 실제 section 수·매핑 개수와 실제 리소스 수를 검증하는 완성된 문서 조립기가 아닙니다. 빈 스트림도 빈 Iterator로 끝납니다. 기존 framing 한도를 재사용하며 별도 무제한 파서는 만들지 않았습니다.

### 검증 기록

- 네이티브 3개 회귀 추가: 문서 속성 모든 잘림/확장, 버전 경계와 실제 매핑 길이 조합/음수/0/null, 알려진 level 오류와 cursor 불변/unknown 보존.
- WASM 합성 199회 추가: 동일 경계, 명세 필드 순서 전 값 비교, malformed 이후 복구.
- 실제 45개 DocInfo 스트림의 문서 속성 10개 필드·모든 ID 매핑 슬롯·미지원 레코드 raw를 독립 JS oracle과 전 바이트 비교합니다. 기존 HWP5 5개 공격 관점 검증도 다시 실행합니다.
- 합계: 네이티브 47개, 기존 Node/WASM 계약 47개, HWP5 probe 6,196회(기존 5,952 + 합성 199 + 실제 DocInfo 45). 기존 기반 단계 수치와 구분합니다.
- SSOT 점검: 태그 dispatch는 docinfo/reader, 필드 배치는 각 payload 파일, 버전별 매핑 개수는 id_mappings 한곳입니다. CFB·압축·JS 제품 코드에 DocInfo 필드 규칙을 넣지 않았습니다.

다음 구현 대상은 BinData·글꼴 등 DocInfo 리소스 레코드와 문단 헤더입니다. 문서 조립·본문/표 해석·편집·렌더링·제품 JS API 연결은 아직 남아 있습니다.

## 후속 구현: BinData·FaceName·개수/글꼴 ID 검증

2026-09-06. 앞 절의 다음 작업 중 BinData·FaceName과 해당 리소스 검증을 구현했습니다. **DocInfo 전체·이미지 표시·OLE 실행·전체 문서 참조 검증을 완료했다는 뜻은 아닙니다.**

### 명세 대조와 보존 정책

공식 PDF §3.2.5, §4.2.3 표 17~18, §4.2.4 표 19~22를 직접 대조했습니다. 표의 가변 전체 길이는 모든 선택 필드가 존재할 때의 표현이므로 고정 필수 길이로 적용하지 않습니다. 저장소 hwp-spec의 보충 설명 중 압축 오류 시 원본으로 fallback하는 제안은 채택하지 않았습니다.

- BinData: LINK의 절대/상대 경로, EMBEDDING의 ID/확장자, STORAGE의 ID를 유형에 맞춰 해석합니다. 원본 속성 u16에 예약 비트·access 상태가 보존됩니다. 미지정 유형 3~15는 unknown payload로 보존하고 사용하려 할 때 UnsupportedBinDataType입니다.
- 압축 0=기본 설정, 1=강제 압축, 2=강제 비압축, 3=UnsupportedCompression입니다. `bin_data_stream.decode`는 헤더 기본 플래그와 개별 설정을 조합하고 기존 bounded 압축 해제·CRC/길이 검사를 재사용합니다. 실패하면 원본 바이트를 압축 해제 성공처럼 반환하지 않습니다.
- FaceName: 속성 0x80/0x40/0x20에 따라 대체 글꼴 유형/이름, 10바이트 글꼴 유형 정보, 기본 글꼴을 각각 읽습니다. 부재(null)와 존재하지만 빈 이름을 구분합니다. 알려지지 않은 대체 유형과 낮은 속성 비트도 원값을 보존합니다.
- 두 레코드의 길이 접두 문자열은 `utf16_string.zig` 한곳에서 읽습니다. UTF-16LE 바이트를 빌리며 NUL·BOM·단독 surrogate를 손실 변환하지 않습니다. 화면 표시 시 Unicode 오류 정책은 별도로 정해야 합니다.
- 알려진 BinData/FaceName은 level 1, 기존 속성/ID 매핑은 level 0을 검사합니다. 선택 필드가 있다고 표시됐지만 잘렸으면 오류이며, Iterator의 cursor/count가 성공 전까지 전진하지 않는 원칙을 유지합니다. payload 해석 뒤 남은 bytes는 extra로 보존합니다.

### SSOT와 경계

| 파일 | 책임 |
|---|---|
| `src/hwp5/utf16_string.zig` | 길이 접두 UTF-16LE 문자열 경계·실패 원자성 |
| `src/hwp5/docinfo/bin_data.zig` | 유형별 payload·속성·압축 override 결정 |
| `src/hwp5/docinfo/face_name.zig` | 글꼴 선택 필드와 원본/확장 보존 |
| `src/hwp5/docinfo/resources.zig` | 실제 BinData/글꼴 개수 집계·ID 매핑 비교·언어별 fontOrdinal |
| `src/hwp5/bin_data_stream.zig` | 호출자가 제공한 내부 스트림의 개별 압축 처리 |

보안/버전 게이트는 `stream.requireSupported`로 공유합니다. 암호/인증서/DRM/배포용 오류를 리소스 디코더에 복제하지 않았습니다. CFB 파일 읽기, 외부 LINK 경로 접근, 폰트 로딩·OLE 실행을 코어에 넣지 않습니다.

`resources.inspect(plain_docinfo, version, options)`는 mapping과 실제 개수를 가진 report를 반환합니다. ID 매핑이 없거나 둘 이상이면 MissingIdMappings/DuplicateIdMappings입니다. `report.validate()`는 BinData 개수와 7개 언어 글꼴 수 합계를 실제 레코드 수와 비교합니다. 음수는 NegativeMappingCount, 불일치는 ResourceCountMismatch입니다. 선언 개수로 메모리를 할당하지 않고 합산은 u64로 계산합니다.

`report.fontOrdinal(language, id)`는 언어 내 0-based ID를 FACE_NAME 목록의 0-based 순번으로 바꿉니다. 먼저 총 개수가 검증되어야 하며 범위 밖은 null입니다. 언어는 한글/영어/한자/일어/기타/기호/사용자 순서입니다. 개별 FACE_NAME에는 언어 값이 없으므로 ID 매핑의 묶음 순서를 사용하는 것입니다. 같은 합계를 유지한 채 언어별 개수가 잘못 적혔는지까지 이 검사로 증명할 수는 없습니다.

`bin_data_stream.decode(allocator, header, item, bytes, limit)`는 소유한 출력 바이트를 반환하며 호출자가 free합니다. LINK는 ExternalLink를 반환하고 외부 파일을 읽지 않습니다. 스트림 선택은 호출자가 담당합니다. 이번 실측의 `/BinData/BINxxxx.extension` 경로 조립은 테스트에서만 수행했으며, 임의 basename fallback이나 자동 탐색을 제품 기능으로 추가하지 않았습니다.

### 실측·적대적 회귀

- 정상 문서 45개에서 BinData 13개·FaceName 861개를 typed 필드로 해석하고 테스트 전용 재구성 결과를 원본 바이트와 비교했습니다. 기존 속성/매핑/unknown 보존 비교도 유지합니다.
- 45개 모두 ID 매핑과 실제 BinData/글꼴 개수가 일치했습니다. BinData 내부 스트림 13개 모두 찾았으며, 개별 압축 설정을 적용한 출력이 Node zlib/원본 byte oracle과 일치했습니다. 누락·개수 불일치는 0입니다. 테스트가 이 숫자와 빈 오류 목록을 assert합니다.
- 합성 WASM 229회 추가: 8개 글꼴 선택 조합과 모든 잘림, LINK/EMBEDDING/STORAGE·unknown 유형, 잘못된 level, mapping 부재/중복/음수/불일치, 압축 기본/override/예약 값과 출력 한도를 검사합니다.
- 네이티브 5개 추가: 위 payload 조건, UTF-16 최대 길이 잘림과 cursor 불변, 7개 언어 ID 경계·거대 선언 개수, LINK/unknown 거부, 압축/비압축의 할당 실패 전수 주입과 정리.
- 전체 네이티브 52개, 기존 Node/WASM 계약 47개, HWP5 probe 6,483회. 기존 5개 공격 관점의 audit를 함께 반복 실행합니다. 새 WASM 호출은 합성 229 + 실제 개수 검증 45 + BinData 해제 13 = 287회입니다.

후속 작업: 테두리/배경·글자 모양 등 나머지 DocInfo 리소스, 문단 헤더·본문, 전체 참조/문서 조립 및 제품 JS/WASM API 연결. 현재 count 검증은 BinData/글꼴에 한정하며 본문에서 참조하는 개별 BinData ID의 유효성·CFB 연결 자동화는 별도 작업입니다.

## 후속 구현: 탭 정의·문단 번호·글머리표·스타일

2026-09-06. `hwp-spec` 스킬의 4.2.7/8/9/11절, 공식 revision 1.3 원문, 참고 구현과 실제 바이트를 대조했습니다. 분할 문서의 잘못된 크기 합계를 그대로 옮기지 않았습니다. 외부 코드·의존성을 추가하거나 레거시를 수정하지 않았습니다.

### 구조 및 명세 불일치 처리

| 책임 소유자 | 구현 및 확인 사항 |
|---|---|
| `tab_def.zig` | 속성 u32 + 개수 u32 + 8바이트 탭 배열. 표의 INT16 개수와 달리 실제 고정 머리는 8바이트입니다. 입력 개수를 남은 크기로 검사하고 할당/조용한 개수 축소 없이 borrowed 배열을 제공합니다. 위치·종류·채움·예약 값을 보존합니다. |
| `paragraph_head.zig` | Numbering/Bullet이 공유하는 12바이트 머리 정보. 속성 u32, 너비/거리 i16, 글자 모양 ID u32. 표의 합계 8바이트는 필드 합과 맞지 않습니다. `0xffffffff` ID와 알 수 없는 속성도 보존합니다. |
| `numbering.zig` | 7개 머리+UTF-16 형식, 전체 시작 번호 u16, 선택적 7개 시작 번호 u32, 선택적 확장 3개 머리+형식 및 3개 시작 번호. 실제 확장 수준에도 12바이트 머리가 있으며 문자열만 있는 구조가 아닙니다. |
| `bullet.zig` | 14바이트 기본부, 선택적 9바이트 이미지 그룹, 선택적 체크 문자 u16. 이미지 그룹은 ID/여부 i32 + 명암 i8 + 밝기 i8 + 효과 u8 + BinData ID u16입니다. 그림 정보는 4가 아닌 5바이트입니다. |
| `style.zig` | 로컬/영문 길이 포함 UTF-16, 속성·다음 스타일·언어·문단 모양·글자 모양 ID. 실제 스타일 700개에서 공통으로 나타난 마지막 `0000`은 의미를 추측하지 않고 extra로 보존합니다. |
| `reader.zig` | 태그 22/23/24/26 dispatch와 level 1 검사. 실패 시 framing cursor/count 불변. |

그림 정보의 명암→밝기→효과→ID 순서는 [hwplib ForFillInfo](https://github.com/neolord0/hwplib/blob/master/src/main/java/kr/dogfoot/hwplib/reader/docinfo/borderfill/ForFillInfo.java), 선택 그룹과 확장 수준 구조는 [ForBullet](https://github.com/neolord0/hwplib/blob/master/src/main/java/kr/dogfoot/hwplib/reader/docinfo/ForBullet.java)·[ForNumbering](https://github.com/neolord0/hwplib/blob/master/src/main/java/kr/dogfoot/hwplib/reader/docinfo/ForNumbering.java)도 대조했습니다. 링크는 조회 시점의 master로 고정 커밋 링크는 아닙니다. 실제 Bullet의 이미지 값은 모두 0이므로 비영(非零) 이미지 ID/명암/밝기/체크 문자는 합성 입력으로 따로 검증합니다.

### 버전·소유권·범위

- Numbering의 수준별 시작 번호는 5.0.2.5 이상에서, 확장 수준은 5.1.0.0 이상에서 뒤에 바이트가 있을 때 읽습니다. 그룹 경계 EOF는 부재(null)이고, 그룹 중간 잘림은 UnexpectedEnd입니다. 구버전의 후속 바이트는 임의로 신버전 필드라 추정하지 않고 extra로 보존합니다. 실제 5.0.1.7은 기본부, 5.0.3.0은 7개 시작 번호까지, 5.1 계열은 확장 수준까지 관찰했습니다. 이는 버전/바이트 기반의 보수적 해석 정책이며 모든 비표준 생산자의 변형을 판별하는 규칙은 아닙니다.
- Bullet은 실제 14/23/25바이트 변형에 맞춰 레코드 끝으로 선택 그룹을 구분합니다. 이미지 여부 값이 0이어도 존재하는 이미지 속성 바이트를 버리지 않습니다. 해석 가능한 그룹 뒤의 extra를 보존합니다.
- 모든 문자열·탭 배열·extra는 입력 버퍼를 빌립니다. 호출자는 입력 수명을 유지해야 합니다. 잘못된 surrogate, NUL, 알 수 없는 비트도 정규화하지 않습니다. Numbering의 수준 배열은 고정 크기이며 새 파서는 동적 할당을 하지 않습니다.
- 공통 바이너리 경계 검사는 Reader, 문자열 길이는 utf16_string, 번호/글머리표 머리는 paragraph_head, 태그별 선택 정책은 각 payload 파일이 소유합니다. 테스트용 필드 재구성은 `tests/hwp5/formatting-probe.zig`에만 두며 제품 writer나 JS 파서를 추가하지 않았습니다.
- 새 리소스의 ID 매핑 개수/참조 유효성, 스타일 상속·번호 표시·이미지 표시, 문서 전체의 의미 해석/저장은 아직 미구현입니다. 미지원 태그도 계속 raw로 보존합니다.

### 검증 기록

1. 명세 크기 산술과 실제 레코드 끝 위치 대조: 탭 138개, 번호 50개, 글머리표 25개, 스타일 700개로 총 913개. 지원 문서 45개 전체를 typed 필드로 재구성해 원본 payload와 비교했고 불일치 0입니다. 암호/배포 미지원 3개는 명시적 오류로 제외했습니다. 바이트 일치는 렌더링 일치나 전체 의미 정확성의 증명은 아닙니다.
2. 모든 기본 필드/선택 그룹 중간 잘림, 거대 탭 개수, 비정상 level 및 실패 후 재호출을 검사합니다. 네이티브에서 공통 머리와 Iterator의 실패 원자성도 확인합니다.
3. 부호 경계·sentinel·빈 문자열/비정상 UTF-16·예약 필드·미지의 꼬리, 5.0.2.5/5.1.0.0 경계와 10개 수준의 서로 다른 머리/형식을 검증합니다.
4. 새 네 레코드에 결정적 변형 1,000개: 수용 843 / 오류 157, 정상 입력 복구 1,000회. 수용된 입력은 typed 재구성으로 다시 바이트 비교합니다. 기존 HWP5 변형 2,000개 및 CFB 변형 12,000개도 유지합니다.
5. Debug·ReleaseSafe·ReleaseFast 전체 audit: 네이티브 58개, Node/WASM 계약 47개, CFB 비교 60컨테이너/483스트림/5,496검색, HWP5 probe 9,581회. 기존 5관점 audit에 새 레코드 경계/변형 검사를 포함합니다. 동일 테스트 반복 횟수를 독립적인 추가 보증으로 계산하지 않습니다.

다음 구현은 **테두리/배경·글자 모양·문단 모양**입니다. 이 리소스들을 해석한 뒤 DocInfo 참조 검증과 본문 문단 해석으로 연결합니다.

### 후속 회귀: 변형 위치 편향 방지

기존 난수 1,000회는 레코드 선택 주기와 LCG 하위 비트가 겹쳐 탭의 16바이트 중 4곳, 스타일의 14바이트 중 7곳만 변형했습니다. 이 검사는 유지하되 위치 커버리지의 근거로 사용하지 않습니다.

`tests/hwp5/formatting.mjs`의 정규 `formattingMutations`에 네 합성 payload의 모든 위치 × 8비트 전수 검사를 추가했습니다. 탭 128 / 문단 번호 1,456 / 글머리표 200 / 스타일 112로 총 1,896개입니다. 각 위치의 검사 비트 마스크가 `0xff`인지 및 레코드별 위치/변형 수를 assert하므로 일부 위치나 비트가 빠지면 실패합니다. 난수 검사와 전수 검사는 오류 판정·typed 재구성·정상 입력 복구 함수를 공유합니다.

전수 검사 결과 수용 1,675 / UnexpectedEnd 221, 정상 입력 복구 1,896회이며 수용된 입력은 원본 바이트와 일치했습니다. 네 합성 payload의 단일 비트 변형을 모두 검사한 것이지 임의 길이·다중 비트 조합·전체 문서 의미를 전수 검증했다는 뜻은 아닙니다. HWP5 probe 호출은 기존 9,581회에서 15,048회로 늘었습니다.

## 후속 구현: 테두리/배경·글자 모양·문단 모양

2026-09-06. `hwp-spec` 4.2.5/6/10절과 공식 revision 1.3 PDF, hwplib·rhwp 참고 코드 및 실제 파일을 대조했습니다. 명세 표의 크기/배치 불일치는 아래와 같이 처리했습니다. 참고 소스를 제품에 복사하거나 새 의존성을 추가하지 않았습니다.

| 소유자 | 지원 필드·정책 |
|---|---|
| `border_fill.zig` | 속성 u16 + 왼쪽/오른쪽/위/아래/대각선 각 6바이트(종류 u8·굵기 u8·색상 u32). 종류 배열→굵기 배열→색상 배열이 아니라 선별 interleaved 구조입니다. |
| `fill.zig` | flags의 단색/패턴(1), 이미지(2), 그라데이션(4) 조합을 동시에 유지합니다. 패턴→그라데이션→이미지 순서입니다. 알 수 없는 비트가 있으면 flags 이후 전체를 unknown으로 보존하며 알려진 비트만 강제로 해석하지 않습니다. |
| `fill.Gradient` | 종류 u8, 각도/중심 X/Y/번짐/색 수 각각 u32. 표의 INT16 크기와 다릅니다. 색 수가 2 초과일 때 i32 위치 배열, 이어 u32 색 배열을 읽습니다. 선언 수를 남은 바이트와 먼저 비교하고 입력 크기에 따른 할당은 하지 않습니다. `color`/`position` 범위 밖은 null입니다. |
| `fill.Known` | DWORD 길이 + 추가 바이트를 보존합니다. 그라데이션이고 길이 1일 때 `blurCenter()`를 제공합니다. 이후 꼬리는 extra로 보존합니다. 명세에 중복 기재된 추가 길이를 무조건 두 번 읽지 않습니다. 실제 신버전 패턴/그라데이션의 마지막 1바이트도 버리지 않으며 의미를 추정하지 않습니다. |
| `picture_info.zig` | 이미지 채우기와 기존 Bullet이 공유하는 5바이트 파서. i8 조정값 두 개·효과 u8·BinData ID u16을 정규화 없이 유지합니다. Bullet의 기존 필드/API는 유지했습니다. |
| `char_shape.zig` | 7개 언어의 글꼴 ID·장평·자간·상대 크기·위치, 크기·속성·그림자 간격·4개 색상. 기본부는 68바이트이며 선택적 테두리 ID(+2)·취소선 색(+4)까지 74바이트입니다. 명세의 합계 72와 다릅니다. |
| `para_shape.zig` | 속성·여백·단일 signed 들여쓰기·문단 앞뒤 간격·기존 줄 간격·탭/머리/테두리 ID·4개 테두리 간격. 기본부 42바이트, 속성2(+4), 속성3/새 줄 간격(+8), 관찰된 확장 수준(+4)을 별도로 유지합니다. 구/신 줄 간격을 임의로 하나로 덮어쓰지 않습니다. |

선 배치는 [hwplib ForBorderFill](https://github.com/neolord0/hwplib/blob/master/src/main/java/kr/dogfoot/hwplib/reader/docinfo/ForBorderFill.java), 채우기 필드 크기는 [ForFillInfo](https://github.com/neolord0/hwplib/blob/master/src/main/java/kr/dogfoot/hwplib/reader/docinfo/borderfill/ForFillInfo.java)를 대조했습니다. 링크는 조회 시점 master입니다. 그림 정보는 공식 표가 밝기→명암으로 이름 붙인 반면 hwplib는 명암→밝기로 읽습니다. 이번 코어는 기존 Bullet과 hwplib의 명명을 유지했습니다. 로컬 rhwp도 HWPX 속성을 역매핑하는 처리가 있습니다. 그러나 우리 실제 fixture의 이미지 채우기 조정값은 0이므로, **합성 입력으로 순서/부호 보존은 확인했지만 한글 UI의 비영(非零) 밝기·명암 효과까지 독립 실측한 것은 아닙니다.** 렌더링 단계에서 실제 편집본/PDF 대조가 필요합니다.

### 선택 필드와 범위

- 글자 모양: 테두리 ID는 5.0.2.1 이상, 취소선 색은 5.0.3.0 이상에서 후속 바이트가 있으면 해석합니다.
- 문단 모양: 속성2는 5.0.1.7 이상, 속성3/새 줄 간격은 5.0.2.5 이상, 추가 수준은 관찰된 5.1 이상에서 해석합니다. 마지막 수준의 도입 버전은 공식 명세 보장이 아닌 현재 보수적 정책입니다.
- 그룹 경계 EOF는 null, 그룹 중간 잘림은 UnexpectedEnd입니다. 해당 버전 이전의 후속 바이트는 extra로 보존합니다. 이를 모든 생산자의 비표준 변형을 판별하는 규칙으로 주장하지 않습니다.
- 각 payload는 level 1 검사를 받으며 실패 시 framing cursor/count가 전진하지 않습니다. 코어는 할당하지 않으며 gradient/추가/unknown/extra 버퍼는 입력을 빌립니다. 호출자는 입력 수명을 유지해야 합니다.
- 속성 비트·범위를 벗어난 값은 원값으로 유지합니다. 렌더링용 정규화, 새 리소스의 ID 매핑 개수·상호 참조 검증, 전체 DocInfo/본문 조립·편집·저장 및 제품 JS API는 별도 단계입니다.

### 실측 및 적대적 검증

1. 지원 HWP 45개에서 테두리/배경 247, 글자 모양 525, 문단 모양 792로 총 1,564개를 typed 필드로 재구성해 원본 바이트와 비교했습니다. 이 개수를 정규 audit가 assert하며 불일치 0입니다. 기존 913개 formatting 레코드 및 BinData/FaceName 비교도 유지합니다.
2. 실제 레코드 크기는 글자 모양 68/74, 문단 모양 46/54/58바이트입니다. 테두리/배경은 채우기 flags 0/1/2/3/4/6을 관찰했습니다. 실제에 없는 조합 5/7은 합성 입력으로 검증했습니다.
3. 합성 채우기 8조합 × 색 수 0/1/2/3, 각 입력의 모든 잘림, 거대 색 수/추가 길이, 미지 비트, extra·signed 필드·선별 서로 다른 색상과 언어별 값을 검사합니다. 8개 버전에서 글자/문단 모양 길이 조합도 검사합니다. 네이티브 4개 테스트를 추가해 필드 값과 실패 원자성을 직접 확인했습니다.
4. 10개 합성 payload(채우기 8조합·글자·문단)의 모든 위치 × 8비트 변형 5,664개: 수용 5,260 / 오류 404, 정상 복구 5,664회, 바이트 불일치/트랩 0. 각 위치의 비트 마스크가 0xff인지 검사해 위치 편향을 방지합니다. 수용 판단은 형태의 파싱 가능성이지 의미 유효성 검증이 아닙니다.
5. Debug·ReleaseSafe·ReleaseFast 전체 audit 통과. 네이티브 62개, Node/WASM 계약 47개, HWP5 probe 34,941회, 기존 CFB 12,000개 변형과 독립 비교를 유지했습니다. 파일 분리·공통 그림 정보 SSOT·문서 예제의 enum 분기도 함께 확인했습니다.

다음 작업: **DocInfo 주요 리소스의 ID 매핑 개수·참조 검증**을 추가한 뒤 본문 문단 헤더·텍스트 해석으로 연결합니다. 호환성/변경 추적 등 아직 해석하지 않는 DocInfo 태그는 raw 보존 상태입니다.
