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

## 후속 구현: 주요 리소스 개수·활성 참조 검증

2026-09-06. `hwp-spec`의 ID 매핑/각 참조 필드, 로컬 rhwp의 ID 조회 및 개요 번호 fallback을 대조하고, 실제 fixture와 독립 JS oracle로 검증했습니다. 파서는 그대로 원본을 보존하며, 아래 의미 검증은 호출자가 별도로 선택합니다. 제품 JS ABI에 추가된 기능은 아닙니다.

### API와 책임

- `resources.inspect(bytes, version, options)`는 BinData·글꼴과 테두리/배경·글자 모양·탭·번호·글머리표·문단 모양·스타일의 실제 개수를 집계합니다. `report.count(kind)`와 `report.validateKnownCounts()`를 추가했습니다. 기존 `validate()`와 `fontOrdinal()`의 BinData/글꼴 검증 계약은 유지합니다. 알려진 매핑 값이 음수면 NegativeMappingCount, 개수가 다르면 ResourceCountMismatch입니다. ID 매핑 자체의 부재/중복 오류도 유지합니다. 메모/변경추적 등 선택 슬롯의 개수는 검증 범위 밖입니다.
- `reference_rules.zig`는 0/1 기반 ID를 순번으로 바꾸는 경계 검사 및 부재 sentinel을 소유합니다. `references.zig`는 어떤 필드가 활성인지 판단하고 이 규칙을 호출합니다. 입력을 수정하거나 ID를 자동 보정하지 않습니다.
- `hwp5.references.inspect(bytes, version, options)`는 개수 검증 후 두 번째 순회로 참조 report를 반환합니다. 각 순회에 record limit이 적용되며, 선언 개수 기반 할당·참조 체인 추적·재귀는 없습니다. 참조 대상이 소스보다 뒤에 있거나 ID 매핑이 뒤에 있어도 동작합니다.
- report의 `checked`는 활성 참조 검사 수(오류 포함), `invalid`는 범위 밖 참조 수, `deferred`는 본문 문맥/미지원 유형으로 검증을 보류한 항목 수, `unknown_records`는 의미를 해석하지 않은 레코드 수입니다. `first_issue`에는 원본 DocInfo 레코드 offset·tag·field·언어/수준 slot·문제 ID를 담습니다. 모든 오류의 목록을 할당하지는 않습니다.
- `report.validateKnown()`은 invalid가 있으면 InvalidResourceReference를 반환합니다. deferred/unknown이 있어도 알려진 참조가 유효하면 성공하므로 **전체 DocInfo·전체 문서 검증 완료를 뜻하지 않습니다.** 알 수 없는 extra 내부, 빈 optional 슬롯, BinData 스트림의 존재/유형/중복 storage ID, 메모/변경추적 참조도 이 결과로 보장하지 않습니다.

### 참조 규칙

| 참조 | 현재 적용 규칙 |
|---|---|
| 글자 모양 → 7개 언어 글꼴 | 언어별 목록의 0-based ID. 총 FACE_NAME 수만으로 검사하지 않습니다. |
| 글자/문단 모양 → 테두리/배경 | 1-based, 0은 참조 없음. 선택 필드 자체의 부재도 유지합니다. |
| 번호 1~10수준/글머리표 → 글자 모양 | 0-based, `0xffffffff`는 상속/명시 참조 없음으로 구분합니다. 0은 첫 글자 모양입니다. |
| 이미지 채우기/활성 이미지 글머리표 → BinData | 1-based **BinData 레코드 순번**입니다. BinData payload의 CFB storage ID와 혼동하지 않습니다. 활성 이미지에서 0은 오류입니다. |
| 문단 모양 → 탭 | 0-based ID. |
| 문단 머리 종류 2/3 → 번호/글머리표 | 각 목록의 1-based ID. 종류 0의 저장된 ID는 비활성 값이므로 검사하지 않습니다. |
| 개요(종류 1) → 번호 | ID가 있으면 1-based 검사. 0이면 구역의 개요 번호 정의가 필요하므로 deferred입니다. |
| 문단 스타일 → 다음 스타일/문단 모양/글자 모양 | 각각 0-based. 다음 스타일의 자기 참조는 정상이며 체인 순환을 오류로 보지 않습니다. |
| 글자 스타일 → 글자 모양 | 0-based. 다음 스타일/문단 모양은 비활성 필드로 취급합니다. 미지원 스타일 종류는 deferred입니다. |

Bullet 이미지 여부 0은 비활성, 1은 활성, 다른 값은 deferred입니다. 알 수 없는 Fill 타입 비트도 deferred입니다. 미지 유형을 자동으로 정상/오류로 단정하지 않습니다. 개요 ID 0의 구역 fallback은 로컬 `reference/rhwp/src/renderer/layout/utils.rs`의 `resolve_numbering_id`와 대조했으며 우리 코어에서 본문 문맥을 추측해 채우지는 않습니다.

### 실측·적대적 검증

1. 지원 문서 45개에서 주요 리소스 선언/실제 개수가 모두 일치했습니다. 활성 참조 7,881건 중 범위 밖 0건, 구역 개요 번호를 기다리는 보류 316건, 미해석 레코드 138개입니다. 실제 수치를 정규 audit에서 assert합니다.
2. 테스트 전용 WASM mode 7과 `tests/hwp5/references.mjs`의 독립 payload 오프셋/ID oracle로 report 전체를 비교합니다. first_issue의 필드·slot·ID·원본 offset까지 비교하며 제품 파서를 JS에 복제하지 않습니다.
3. 합성 문서의 각 활성 ID에 0/1/2/최대값을 넣는 경계 108개, 매핑 15슬롯의 음수/부족/초과 45개, 매핑 부재/중복·레코드 제한을 검사했습니다. 비활성 값·미지원 타입·개요 보류·원본 순서 변경도 검사합니다. 오류 후 정상 문서 재검사와 기존 바이트 보존 검증을 유지합니다.
4. 네이티브 4개 테스트 추가: ID 규칙/sentinel, 7종 개수와 순서 독립성, 언어별 오류 위치, 활성/비활성/보류 및 자기 참조를 직접 검증합니다. 기존 사용자 변경과 제품 ABI는 변경하지 않았습니다.
5. Debug·ReleaseSafe·ReleaseFast 전체 audit: 네이티브 66개, Node/WASM 계약 47개, HWP5 probe 35,261회. 기존 단일 비트 전수 검사·CFB 변형·독립 byte 비교를 함께 실행합니다.

다음은 **본문 문단 헤더·텍스트 해석**입니다. 이후 구역 정의를 연결해야 보류된 개요 번호 참조도 검증할 수 있습니다.

## 후속 구현: 본문 문단 헤더·텍스트 토큰

2026-09-06. `hwp-spec`의 3.2.3/4.3/4.3.1/4.3.2절과 공식 revision 1.3 PDF 표 6/58/60을 대조했습니다. 분할 문서 표 6에서 빠진 코드 0~3은 공식 PDF로 확인했습니다. rhwp의 `src/parser/body_text.rs`도 참고했으나 UTF-8 출력/대체문자/생략 정책은 그대로 옮기지 않았습니다.

### 책임과 API

| 소유자 | 구현 |
|---|---|
| `body/paragraph_header.zig` | 22바이트 기본부: 문자 수 원값·control mask·문단 모양/스타일 ID·나누기 플래그·글자 모양/range/line 정보 수·instance ID. 5.0.3.2 이상에서 후속 바이트가 있으면 merge_tracking u16을 읽습니다. 그룹 부재는 null, 중간 잘림은 오류, 뒤의 extra는 보존합니다. |
| `body/control.zig` | 제어코드 0~31의 character/inline/extended 종류와 1/8 UTF-16 단위 너비를 정의하는 SSOT. 예약 코드도 명세 너비대로 읽습니다. |
| `body/text.zig` | 일반 텍스트 연속 구간과 제어문자 토큰. 토큰은 start_unit·raw 및 text 또는 control(code/kind/12바이트 data/closing_code)을 제공합니다. 임의 포인터 접근·UTF-8 변환·문자 정규화·컨트롤 생략은 하지 않습니다. |
| `body/reader.zig` | 태그 66/67을 해석하고 나머지는 unknown/raw로 보존합니다. 알려진 payload 해석 실패 시 framing cursor/count가 전진하지 않습니다. |

```zig
var it = try hwp5.body.Iterator.init(plain_section, version, .{});
while (try it.next()) |record| {
    switch (record.value) {
        .header => |h| { _ = h.characterUnits(); },
        .text => |text| {
            var tokens = text.tokens();
            while (try tokens.next()) |token| { _ = token.start_unit; }
        },
        .unknown => {},
        .char_runs, .line_segments, .range_tags => {},
        .control_header, .list_header => {},
        .page_definition, .page_border => {},
        .note_shape => {},
    }
}
```

입력은 헤더/보안 정책·압축 해제를 거친 평문 Section 바이트입니다. 모든 가변 데이터는 입력을 빌리며 코어 파서는 동적 할당하지 않습니다. 호출자는 입력 수명을 유지해야 합니다. 각 토큰은 최소 2바이트를 소비하고 제어문자 부가정보는 길이 검사 후 한 덩어리로 소비합니다. iterator 오류 후 같은 입력으로 재시도하면 동일 오류이며, 호출자는 종료하거나 입력을 바꿔야 합니다.

### 정확성 경계

- `Header.characterUnits()`는 원래 문자 수의 상위 비트를 마스킹합니다. `chars_raw`와 `countHighBit()`로 상위 비트도 보존하며 이를 단독으로 문단 트리의 소유권/마지막 문단 판정에 사용하지 않습니다. 나누기 플래그 역시 조합을 보존하며 실제 페이지 수를 추정하지 않습니다.
- 위치와 길이는 **UTF-16 코드 단위**입니다. surrogate pair는 2단위이고 inline/extended 컨트롤은 8단위입니다. 일반 텍스트의 잘못된 surrogate·BOM도 원본 그대로 유지합니다. 문자 컨트롤 0과 예약 코드도 버리지 않습니다.
- 텍스트의 홀수 바이트 길이는 InvalidTextSize, 잘린 16바이트 컨트롤은 UnexpectedEnd, 시작/끝 코드 불일치는 InvalidControlTerminator입니다. 이것은 경계 해석 정책이며 손상된 입력을 자동 복구하지 않습니다. 컨트롤 data의 값·ID·필드 시작/끝 짝·실제 CTRL_HEADER 연결은 아직 검증하지 않습니다.
- `Text.validateCount(header)`는 호출자가 이미 올바르게 짝지은 헤더의 단위 수와 비교합니다. 파서가 level만 보고 문단 소유권을 추측하지 않습니다. 중첩 문단 때문에 헤더를 level 0, 텍스트를 level 1로 고정하지도 않습니다. orphan·중복 텍스트·리스트/표/각주 계층 유효성은 후속 조립 단계입니다.
- 텍스트 레코드 부재를 자동 문단 끝 문자로 바꾸지 않습니다. 빈 텍스트 payload도 그대로 구분합니다. 문단 텍스트의 마지막 코드 13 강제, DocInfo 참조 연결, 글자 모양/줄/range 개수 대조, 제어문자에서 실제 탭 폭·필드 의미·개체를 해석하는 단계는 별도입니다.

### 실측·적대적 검증

1. 지원 HWP 45개·47개 Section에서 문단 헤더 1,481개(22바이트 378개 / 24바이트 1,103개), 텍스트 1,076개·23,570 UTF-16 단위를 읽었습니다. 일반 텍스트 구간 1,040개, 문자 컨트롤 1,076개, inline 50개, extended 313개입니다. 테스트 전용 WASM mode 8에서 필드/토큰으로 재구성한 원본 바이트 및 토큰의 위치·너비·종류·코드를 독립 JS 기준과 비교했고 불일치 0입니다.
2. 실제 텍스트가 있는 문단은 헤더 선언 단위 수와 모두 일치했습니다. 테스트의 level 기반 pairing으로 텍스트가 없는 헤더 405개도 별도 집계합니다. 이 측정은 전체 본문 트리 조립을 구현했다는 뜻이 아닙니다. 수치는 정규 audit에서 assert합니다.
3. 코드 0~31 전부, 16바이트 컨트롤의 모든 중간 잘림·잘못된 끝 코드, 부가정보 안의 제어코드처럼 보이는 값, 정상/비정상 surrogate·BOM, 빈 텍스트·홀수 길이, 일반/확장 framing 및 131,072바이트 텍스트를 검사합니다. 헤더 버전 경계·모든 잘림·상위 비트/추가 필드와 token/framing 실패 원자성을 네이티브에서도 확인합니다.
4. 헤더와 32개 제어코드를 모두 포함한 합성 텍스트의 모든 위치 × 8비트 변형 3,152개: 수용 2,448 / 오류 704 / 정상 복구 3,152회. 각 위치의 커버리지 마스크 0xff를 assert하며, 수용된 입력의 바이트/토큰도 독립 기준과 비교합니다. UTF-16 손실·트랩은 발견되지 않았습니다.
5. Debug·ReleaseSafe·ReleaseFast 전체 audit: 네이티브 70개, Node/WASM 계약 47개, HWP5 probe 44,567회. 기존 DocInfo·CFB 테스트도 유지하며 제품 JS ABI와 레거시 코드는 변경하지 않았습니다.

다음 작업은 **본문 글자 모양 구간·줄 레이아웃·영역 태그** 해석과 헤더 개수/텍스트 위치 경계 대조입니다. 구역 정의·컨트롤 연결·문단 트리를 조립해야 이전의 개요 번호 보류도 해소할 수 있습니다.

## 후속 구현: 문단 메타데이터 (4.3.3~4.3.5)

2026-09-06. 위 기록은 각 시점의 완료 범위이며 이번 파트가 글자 모양/줄/range 개수 대조를 추가합니다.

- 태그 68: 8바이트 행(start u32, char_shape_id u32), 69: 36바이트 행(start u32, signed 위치/크기 7개, flags u32), 70: 12바이트 행(start/end/tag u32)을 명세 필드 순서대로 읽습니다. range 종류 상위 8비트·데이터 하위 24비트, 미지 값과 줄 캐시 플래그를 그대로 보존합니다.
- `Runs`·`Segments`·`Ranges`는 입력을 빌리며 `count()`/`get(index)`를 제공합니다. 행 중간 잘림은 InvalidRecordArraySize, 범위 밖 인덱스는 null입니다. 공통 배열 경계는 `binary/record_array.zig`, 각 행 배치는 별도 파일, 교차 검증은 `body/metadata.zig`에 둡니다.
- `Metadata.validate(header, char_shape_count)`는 호출자가 이미 연결한 문단만 검사합니다. 선언 개수 일치, 첫 글자 모양 위치 0·이후 비감소 순서, 글자 모양 ID의 0 기반 범위, 위치가 헤더 UTF-16 단위 수 이내인지 검사합니다. range는 start ≤ end를 검사하고 중첩을 허용합니다. 누락/빈 배열은 구조상 구분되지만 개수 비교에서는 모두 0입니다.
- 위치의 상한과 같은 값은 허용하는 보수적 경계 검사입니다. range 끝의 포함/제외 의미, 컨트롤 토큰 내부 위치, 페이지 나누기, 계층 소유권·개체 연결은 아직 검증하지 않습니다. 성공을 전체 문서 유효성으로 해석하지 않습니다.

### 구현 후 적대적 검증

1. 세 배열의 두 행 전체에 대해 모든 잘림 위치와 896개 단일 비트 변이를 검사합니다. typed 필드로 재인코딩한 바이트를 원본과 대조하고 매 변이 뒤 정상 입력을 다시 읽습니다. 서로 다른 음수 줄 필드는 네이티브 테스트로 필드 순서/부호도 확인합니다.
2. 잘못된 첫 위치·상한 초과·역순 run·범위 밖 ID·역전 range·누락/중복 레코드·레코드 수 제한을 검사합니다. 겹침·같은 위치·빈 메타데이터는 별도 성공 사례입니다. 실패한 dispatch를 반복해도 cursor/count가 이동하지 않는지 확인합니다.
3. 실제 지원 파일 45개, Section 47개의 문단 1,481개를 테스트용 독립 계층 연결로 대조했습니다. 글자 모양 구간 1,740개·줄 정보 1,729개의 선언 개수/참조/위치 불일치가 없고 typed 재인코딩이 원본과 일치합니다. **실제 영역 태그는 0개**이므로 이 유형은 합성 데이터로만 검증했습니다. 배포용/암호 파일 3개는 기존대로 미지원입니다.
4. 빈 성공 결과를 반환하는 새 검증 경로에서 테스트 WASM 브리지의 0길이 할당 포인터가 JS의 -1 오프셋으로 전달되는 문제를 재현했습니다. `result_ptr()`가 빈 결과에 0을 반환하도록 수정하고 빈 문단 검증을 회귀 테스트로 남겼습니다. 제품 ABI 변경은 아닙니다.
5. SSOT 재검토에서 글자 모양 ID의 0 기반 범위 판정을 기존 `docinfo/reference_rules.zig`의 `resolve(.zero_based, ...)`로 통일했습니다. 행 해석·문단 교차 검증·테스트 전용 계층 연결의 책임은 분리했습니다.

최종 `zig build audit -Doptimize=Debug|ReleaseSafe|ReleaseFast --summary all`을 모드별로 실행해 모두 통과했습니다. 각 모드 네이티브 74/74, Node 47/47, HWP5 WASM 47,983회 검사, CFB 12,000회 변이(트랩 0), 독립 CFB 비교 60개 컨테이너/483개 스트림/5,496개 검색입니다. 포맷 검사와 `git diff --check`도 통과했습니다.

다음 작업은 **컨트롤 헤더·문단 리스트 헤더**와 문단/컨트롤 계층 조립입니다. 전체 문서 검증·제품 HWP API·렌더링 완료를 뜻하지 않습니다.

## 후속 구현: 컨트롤/리스트 헤더 (4.3.6~4.3.7)

2026-09-06. 공식 PDF 표 64~65와 MAKE_4CHID 정의, hwp-spec 해당 절, rhwp `parser/control.rs`의 `parse_cell` 및 `body_text.rs` 리스트 읽기를 대조했습니다.

- `control_header.zig`: UINT32 ID와 뒤의 개별 속성 바이트를 분리합니다. `name()`은 MAKE_4CHID 순서의 **4바이트**를 반환하며 문자열 변환·공백/NUL 제거를 하지 않습니다.
- `list_header.zig`: 최소 6바이트를 검사하고 `count_raw`/`tail`을 보존합니다. 공식 INT16 문단 수는 `signedCount()`로 조회합니다. `view(.spec6)`는 offset 2의 속성, `view(.observed8)`는 offset 2의 미지 u16과 offset 4의 속성을 읽습니다. 호출자가 명시적으로 선택하며 길이/버전만으로 자동 판단하지 않습니다. 뒤의 셀/텍스트박스 속성은 `extra`로 보존합니다.
- rhwp는 셀의 u16 count + u32 attr + u16 width_ref를 읽고 attr의 상위 16비트에서 정렬을 추출합니다. 이를 공식 배치와 동일하다고 단정하지 않았습니다. observed8의 미지 속성 비트에 의미를 임의로 부여하지 않습니다.
- 태그 71/72 dispatch는 기본 경계/원본 보존까지만 책임집니다. 리스트 배치 선택·문단 수 대조·소유권·컨트롤별 속성·텍스트 토큰 연결은 후속 조립 과제입니다. CTRL_DATA의 Parameter Set도 미해석입니다.

### 구현 후 적대적 검증

1. ID의 `tbl ` 공백·비ASCII/NUL, 리스트 signed count -1/raw 65535, 배치별 속성/미지 필드/extra를 네이티브 테스트로 확인했습니다. observed8은 6/7바이트 입력에서 실패하고 spec6은 이를 보존합니다.
2. 두 레코드의 모든 길이 0~13과 208개 전 위치 단일 비트 변이/정상 입력 재검증을 WASM에서 실행합니다. 타입 필드 재인코딩을 독립 원본과 비교하고, 잘린 payload의 반복 실패 후 cursor/count 불변도 검사합니다.
3. 실제 지원 45개 파일의 컨트롤 헤더 313개·리스트 헤더 643개가 재인코딩 바이트와 일치합니다. 개수는 정규 audit에서 assert합니다. 별도 실측 리스트 길이 분포: 16(4), 20(17), 22(23), 30(8), 33(9), 34(4), 38(71), 47(507). 모두 offset 2~3은 0이며, 이 관찰만으로 모든 버전의 배치 선택 규칙을 확정하지 않습니다.

다음은 문단/컨트롤 계층 조립과 구역 정의입니다. **헤더 파싱 성공은 리스트/컨트롤 의미 검증 완료가 아닙니다.**

최종 Debug·ReleaseSafe·ReleaseFast의 `zig build audit --summary all` 모두 통과: 모드별 네이티브 77/77, Node 47/47, HWP5 WASM 48,427회 검사. 기존 CFB 비교/12,000회 변이도 통과했습니다. SSOT 검토: 프레이밍·정수 읽기는 기존 코어 재사용, ID와 리스트 배치는 별도 파일, 문맥 없는 배치 추정은 추가하지 않았습니다.

## 후속 구현: 레코드 계층과 문단 연결

2026-09-06. hwp-spec 4.1의 level 정의를 기준으로 전체 Section 레코드 인덱스를 추가했습니다.

- `body_tree.Tree.parse(allocator, bytes, version, options)`는 부모 인덱스와 exclusive `subtree_end`를 만듭니다. root level 0, 이후 최대 한 단계 증가를 요구하고 건너뛴 깊이는 InvalidRecordHierarchy입니다. 전체 Section용 API이며 중간 subtree만 잘라 입력하는 API는 아닙니다.
- `Tree.deinit(allocator)`는 노드 배열만 해제합니다. payload/raw는 원래 입력을 빌리므로 트리 사용 중 입력 수명을 유지해야 합니다. 비재귀 스택 1,024칸, 생성 O(레코드 수), 노드 메모리 O(레코드 수)입니다. max_records/max_payload_bytes는 기존 framing 옵션을 재사용하고 할당 실패를 전파합니다.
- `paragraphs.inspect(tree, .{ .char_shapes, .para_shapes, .styles })`는 파서가 만든 변경하지 않은 트리를 받습니다. 문단의 직접 자식만 연결하므로 개체 안 중첩 문단의 텍스트를 바깥 문단에 붙이지 않습니다. 텍스트/메타데이터 중복·고아를 거부하고 기존 `Metadata.validate`, `Text.validateCount`, `reference_rules.resolve`를 재사용합니다.
- 실제 6,846개 Section 레코드에는 level 건너뛰기가 없었습니다. 문단 부모는 root 689개, 태그 71 765개, 태그 76 27개입니다. 리스트 헤더 부모는 태그 71 617개, 태그 76 26개입니다. **리스트 헤더와 뒤 문단이 형제인 배치**이므로 리스트를 가짜 계층 부모로 만들지 않았습니다. 논리적 리스트 묶음/개수는 후속 문맥 검증입니다.
- 보고서는 paragraphs/texts/missing_texts/controls_pending/lists_pending/unknown_records를 구분합니다. 누락 텍스트 405개를 자동 보충하지 않습니다. 컨트롤 속성·텍스트 제어코드 연결·리스트 소유권·미지원 태그는 검사 완료가 아닙니다. 이 보고서에 전체 문서 `valid=true` 같은 판정을 제공하지 않습니다.

### 구현 후 적대적 검증

1. 최대 level 1,023을 네이티브/WASM에서 검사하고 모든 할당 실패 지점의 해제 경로를 `checkAllAllocationFailures`로 확인했습니다. 다중 root·형제 전환·여러 단계 복귀·잘린 레코드·레코드 제한·깊이 건너뛰기를 검사합니다.
2. JS 독립 역방향 부모 검색/정방향 서브트리 탐색으로 모든 노드의 parent/end를 대조합니다. 8개 위치 × 10개 level 비트의 80개 변이와 매번 정상 재검증을 실행합니다. O(n²) 독립 oracle은 테스트에만 있고 제품은 선형 스택 방식입니다.
3. 중첩 문단의 텍스트가 외부 문단에 섞이지 않는 사례, 중복 텍스트/세 메타데이터, 고아 텍스트, 문단 모양/스타일 참조 초과, 선언 문자/메타데이터 개수 불일치를 검사합니다.
4. 실제 지원 45개 파일/47개 Section에서 `[1481, 1076, 405, 313, 643, 476]` 보고서 합계를 고정 assert합니다. 마지막 세 값은 컨트롤 보류·리스트 보류·본문 미해석 레코드이며 0으로 숨기지 않습니다. 이번 검증의 성공은 전체 HWP 지원 완료를 뜻하지 않습니다.

다음은 구역 정의와 컨트롤/텍스트 연결, 리스트 문맥 및 개체별 속성 검증입니다.

최종 Debug·ReleaseSafe·ReleaseFast `zig build audit --summary all` 전부 통과했습니다. 각 모드 네이티브 79/79, Node 47/47, HWP5 WASM 48,657회 검사이며 기존 CFB 비교·12,000회 변이도 통과했습니다. SSOT 재검토에서 새 코드가 기존 framing/태그 dispatch/메타데이터/ID 규칙을 중복 구현하지 않는지 확인했습니다. 포맷·diff 공백 검사도 통과했습니다.

## 후속 구현: 구역 정의·용지·쪽 테두리

2026-09-06. 공식 PDF §4.3.10.1, 표 129~136과 자료형 표를 대조했습니다. 구역 정의 본체와 하위 레코드를 합쳐 140바이트 고정 payload로 취급하지 않습니다.

- `section_def.zig`: `secd` 컨트롤의 properties 24바이트 기본부(속성·signed 단 간격/줄맞춤·기본 탭·번호 ID·쪽/그림/표/수식 시작 번호), 5.0.1.5 이상은 대표 language u16을 필수로 읽습니다. 이전 버전은 null이며 실제 0과 구분합니다. 후속 extra는 보존합니다. 일반 `ControlHeader`는 여전히 ID/properties를 제공하며 구역 의미 해석은 별도 호출입니다.
- `page_def.zig`: 태그 73의 40바이트 용지/여백/속성과 extra를 읽습니다. 원본 HWPUNIT는 u32이며 없는 값에 A4/기본 여백을 자동 삽입하지 않습니다.
- `page_border.zig`: 태그 75의 속성 u32 + signed 간격 4개 + ID u16 = **14바이트**를 읽습니다. 표 135의 전체 길이 12는 필드 합과 모순되며 실제 141개도 모두 14바이트였습니다. 상위 속성 비트/extra를 보존하고 화면상의 기준을 추정하지 않습니다.
- `section_validation.inspect(tree, version, numbering_count, border_count)`는 구역 정의가 root 문단의 자식인지, Section당 하나인지, 용지/테두리/각주 레코드의 직접 부모가 그 구역 정의인지 검사합니다. 용지는 하나를 요구하고 누락/중복을 거부합니다. 구역 번호 ID는 1 기반, 테두리 ID는 1 기반/0 부재로 기존 reference_rules를 호출합니다. 번호 ID 0은 의미를 확정하지 않고 numbering_deferred에 기록합니다.
- 보고서 `[definitions, pages, borders, numbering_deferred, notes_pending]`는 실제 파일에서 `[47,47,141,1,94]`이며 정규 audit에서 고정 assert합니다. 용지/테두리 해석 추가로 본문 unknown_records는 476→288입니다. 이 숫자 감소가 컨트롤 전체 의미 검증 완료를 뜻하지 않습니다.

### 구현 후 적대적 검증

1. 구역 버전 5.0.1.4/5.0.1.5 경계, 기본/언어 필드 모든 잘림 위치, signed 간격·u32 상한, null/0, extra 보존을 검사했습니다. 세 payload의 전 바이트 단일 비트 변이 712개와 매번 정상 재검증을 실행합니다.
2. 구역/용지 누락·중복, 잘못된 하위 레코드 부모, 번호/테두리 ID 상한 초과를 검사합니다. 기본 payload는 typed 필드로 재인코딩하여 원본과 대조합니다. 잘린 용지/테두리 payload의 반복 실패 후 cursor가 그대로인지도 확인했습니다.
3. 실제 지원 45개 파일의 구역 47개(properties 길이 32/34/43), 용지 47개(40바이트), 쪽 테두리 141개(14바이트)를 검사했습니다. 각주/미주 94개는 공식 표 26바이트와 다르게 모두 28바이트이며 **아직 payload 의미 해석은 보류**합니다. rhwp는 추가 u16을 읽지만, 실제 추가/확장 필드의 정확한 의미와 배치는 추가 대조가 필요합니다.

남은 과제: 각주/미주 배치, 컨트롤-텍스트 연결, 리스트 문맥, 구역 번호 ID 0 및 DocInfo 개요 fallback 316건의 연결 검증. 전체 문서 완료 판정은 아직 제공하지 않습니다.

최종 Debug·ReleaseSafe·ReleaseFast `zig build audit --summary all` 모두 통과: 네이티브 81/81, Node 47/47, HWP5 WASM 50,419회 검사. 기존 CFB 비교·12,000회 변이(트랩 0)도 통과했습니다. SSOT 검토에서 payload별 파일/구역 교차 검증을 분리하고 기존 framing·tree·ID 규칙을 재사용하는지 확인했습니다.

## 후속 구현: 각주/미주 모양의 28바이트 배치

2026-09-06. 공식 표 133의 26바이트 배치, rhwp 및 레거시 Rust, 독립 [node-hwp 포맷 정의](https://github.com/123jimin/node-hwp/blob/master/format/record.format#L937-L965), 같은 이름의 HWP/HWPX fixture를 대조했습니다. 외부 코드 이식이나 신규 제품 의존성 추가는 없습니다.

### 필드 차이와 실측

구분선 길이는 offset 12에서 **signed i32**로 읽어야 paired HWPX의 length와 이후 여백이 일치합니다. 16비트 길이 뒤 마지막에 미지 u16을 덧붙이는 rhwp 배치를 채택하지 않았습니다.

| `footnote-endnote` 구역 항목 | HWP 32비트 길이/위/아래/사이 | paired HWPX | 로컬 rhwp 방식의 길이/위/아래/사이 |
|---|---|---|---|
| 각주 | -1 / 850 / 567 / 283 | 동일 | -1 / -1 / 850 / 567 |
| 미주 | 14692344 / 850 / 567 / 0 | 동일 | 12280 / 224 / 850 / 567 |

이는 저장소의 paired fixture 비교이며 이번 작업에서 한글 프로그램을 직접 실행한 결과는 아닙니다. 미주 길이 14692344를 비현실적으로 보인다는 이유로 자르거나 기본값으로 바꾸지 않습니다.

### 구현과 검증 범위

- `note_shape.zig`가 공통 모양 payload를 소유합니다. 기본 `Shape.parse`는 28바이트 관측 배치이며 26/27바이트 입력을 잘린 데이터로 거부합니다. `parseLayout(..., .spec26)`은 공식 표 기반 데이터를 위한 명시적 별도 경로이고 길이나 버전으로 자동 전환하지 않습니다. 선택한 layout과 extra를 보존합니다.
- 속성·WCHAR 원값·시작 번호·signed 구분선 길이/여백·선 종류/굵기·COLORREF를 보존합니다. 번호 모양/배치/번호매김 비트 조회는 미지 값을 기본 enum으로 치환하지 않습니다. 주석의 실제 번호 생성·레이아웃·fn/en 컨트롤 연결은 후속 작업입니다.
- 태그 74를 typed dispatch에 추가하고 구역 직접 자식 검증을 적용했습니다. 같은 구역에 모양이 3개 이상이면 ExcessNoteShapes입니다. 0/1개를 자동 복제하지 않으며 `note_shapes` 개수로 호출자가 부재를 확인할 수 있습니다. 보고서의 이전 `notes_pending` 필드는 `note_shapes`로 바뀌었습니다.
- 실제 94개 모양은 typed 재인코딩 바이트가 원본과 일치하고 본문 unknown_records는 288→194입니다. `note-pair.mjs`는 기존 MIT 레거시 ZIP reader를 **테스트 전용**으로 써 HWPX XML 값을 읽고 WASM의 이름 있는 네 필드 결과와 비교합니다. ZIP/XML 지원을 제품 HWPX 구현 완료로 세지 않습니다.

### 구현 후 적대적 검증

1. 26/28바이트 모든 잘림 위치, i32 길이의 16비트 초과 값·-1, signed 여백·원본 WCHAR·미지 속성·extra·명시적 spec26 차이를 검사했습니다.
2. 각주 payload의 모든 31개 위치(28 기본+3 extra) × 8비트 = 248개 변이와 정상 재검증을 추가했습니다. 구역 관련 합계는 960개입니다. typed 재인코딩에만 의존하지 않고 네이티브의 서로 다른 필드 값 및 paired HWPX/WASM 결과도 검사합니다.
3. 2개 모양 정상, 3개 초과 및 잘못된 부모를 회귀 테스트로 추가했습니다. 모양만 읽고 컨트롤/문단 연결을 완료로 오인하지 않도록 문서와 보고서 의미도 재검토했습니다.

다음은 컨트롤-텍스트 연결과 단/리스트 문맥 검증입니다. 번호 ID 0, DocInfo 개요 fallback, 개체별 의미와 전체 문서 조립은 여전히 남아 있습니다.

최종 Debug·ReleaseSafe·ReleaseFast `zig build audit --summary all` 모두 통과: 네이티브 83/83, Node 47/47, HWP5 WASM 51,016회 검사. 기존 CFB 비교·12,000회 변이도 통과했습니다. 포맷/diff 검사와 SSOT 검토에서 모양 필드 배치와 구역 소유권, 테스트 전용 ZIP/HWPX 비교 책임을 분리한 것을 확인했습니다.

## 후속 구현: 텍스트 확장 컨트롤 연결

2026-09-06. hwp-spec §3.2.3/§4.3.2/§4.3.6 및 공식 제어문자 표와 실제 파일을 대조했습니다. 확장 제어문자의 12바이트 부가정보 중 앞 4바이트를 LE 컨트롤 ID로 읽고, 같은 문단의 CTRL_HEADER ID 순서와 비교합니다. 나머지 부가정보를 메모리 주소로 역참조하거나 임의 instance ID로 해석하지 않습니다.

- `control_links.Links.build(allocator, tree)`는 문단/텍스트/컨트롤 노드 인덱스, 원본 UTF-16 start_unit, 제어코드, ID를 반환합니다. `deinit`으로 링크 배열을 해제합니다. 원본 트리 인덱스가 유효하도록 트리를 변경하지 않아야 합니다.
- 같은 문단의 직접 자식만 대응하며 중첩 문단은 독립 처리합니다. 반복되는 같은 ID를 전역 map으로 합치지 않고 발생 순서로 연결합니다. 인라인/문자 컨트롤은 별도 헤더 연결 대상이 아닙니다. 레코드 수+텍스트 단위 수에 선형인 순회이며 메모리는 링크 수에 비례합니다.
- MissingControlToken/MissingControlHeader/ControlIdMismatch/OrphanControlHeader를 구분합니다. 고아 텍스트·중복 텍스트도 검사합니다. payload 참조·헤더/텍스트 길이 검사는 기존 paragraphs/section 검증과 함께 사용해야 합니다.
- `paragraph_children.zig`는 직접 자식 수집/중복 검사의 SSOT입니다. 기존 `paragraphs.zig`와 새 링크 코드가 공유하며 메타데이터 개수/리소스 검증은 기존 파일에서 계속 담당합니다.

### 구현 후 적대적 검증

1. 실제 45개 지원 파일/47개 Section에서 **313개** 링크의 문단·텍스트·컨트롤 노드와 UTF-16 위치/코드/ID를 JS 독립 연결 oracle과 대조했습니다. 모든 문단에서 확장 토큰 ID와 헤더 ID의 순서가 일치했습니다. 링크 수를 정규 audit에서 assert합니다.
2. 헤더/토큰 누락, 다른 ID·순서 뒤집힘, 고아 텍스트/컨트롤, 중복 텍스트, 중첩 문단, 같은 ID 반복, 인라인 탭 건너뛰기, 빈 스트림을 검사했습니다. ID의 32비트를 각각 바꿔 불일치를 거부하고 양쪽을 같이 바꾸면 알 수 없는 ID도 무손실 연결하는지 확인합니다.
3. 네이티브에서 모든 할당 실패 지점을 검사했고 두 번째 링크에서 ID 오류가 발생해도 앞서 만든 배열이 해제되는지 확인했습니다. 재검토에서 연결 API 단독 호출의 고아 텍스트 누락 가능성을 보강하고 자식 수집 중복 코드를 공통 모듈로 정리했습니다.

**연결 성공은 컨트롤 의미 검증 완료가 아닙니다.** 제어코드 종류와 ID 종류의 호환성, 각 컨트롤 payload의 속성/리소스, 필드 시작/끝 쌍, 단/리스트 문맥은 별도 과제입니다. `paragraphs.Report.controls_pending`는 여전히 컨트롤 의미 검증 대상을 세며 새 `linkedControls=313`을 빼서 완료 처리하지 않습니다. 다음은 단 정의와 리스트 문맥, 컨트롤별 코드/ID 규칙입니다.

최종 Debug·ReleaseSafe·ReleaseFast `zig build audit --summary all` 전부 통과: 네이티브 85/85, Node 47/47, HWP5 WASM 51,179회 검사. 기존 CFB 비교·12,000회 변이도 통과했습니다. 포맷/diff 검사와 책임/SSOT 재검토까지 마쳤습니다.

## 후속 구현: 단 정의의 너비/간격 분기

2026-09-06. 공식 표 138~139, hwp-spec §4.3.10.2, rhwp 및 [hwplib의 단 정의 reader](https://github.com/neolord0/hwplib/blob/master/src/main/java/kr/dogfoot/hwplib/reader/bodytext/paragraph/control/ForControlColumnDefine.java)를 대조했습니다. 외부 코드는 이식하지 않았습니다.

- `column_def.Definition.parse(properties)`는 cold 컨트롤 properties를 읽습니다. count는 하위 속성 bit 2~9이며 0은 InvalidColumnCount입니다. 단 종류/방향/미지 비트는 원값으로 유지합니다.
- count 1 또는 동일 너비: 하위 속성 u16 → 공통 간격 i16 → 상위 속성 u16 → 선 종류 u8/굵기 u8/색상 u32, 총 12바이트입니다. count 1에서는 sameWidth가 false여도 이 배치를 사용하며 합성 테스트로 명시했습니다.
- count ≥2이고 서로 다른 너비: 하위/상위 속성 u16 두 개 → count개의 너비 u16/간격 u16 쌍 → 선 정보 6바이트, 총 10+4×count입니다. 공식 표의 단순 너비 배열/필드 순서와 다르며 실제 paired HWPX 및 독립 reader와 대조했습니다.
- 공통 `spacing`과 개별 `columns`는 서로 배타적인 nullable 값입니다. 없는 공통 간격을 0으로 만들지 않습니다. 배열은 기존 `binary/record_array.zig`를 공유하며 extra를 보존합니다. 너비/간격의 합을 강제로 32768로 맞추거나 절대 단위로 변환하지 않습니다.
- `section_validation`에서 단 정의가 문단의 직접 자식인지 검사하고 payload 파서를 호출합니다. 중첩 문단의 단 정의도 허용합니다. 보고서 마지막에 columns 수가 추가되어 실측 합은 `[47,47,141,1,94,68]`입니다. 일반 control header raw API와 의미 파서는 별도입니다.

### 구현 후 적대적 검증

1. 실제 단 정의 68개: 동일 너비 1단 57개/2단 7개/3단 2개, 가변 너비 2단 1개/3단 1개입니다. 각 typed 재인코딩 바이트가 원본과 일치합니다.
2. `multicolumns-widths`의 HWP/HWPX 세 단 설정을 WASM 필드 출력과 비교합니다. 가변 2단은 `(15291,1744),(15733,0)`, 3단은 `(10336,870),(10336,434),(10792,0)`으로 일치합니다. 이번에 한글 프로그램을 직접 실행한 결과는 아닙니다.
3. count 1/2/3/255 × sameWidth true/false의 모든 잘림 위치, count 0 거부, null/0·signed 공통 간격·u16 쌍 상한·get 범위 밖·extra를 검사합니다. 3단+extra의 전 25바이트×8비트 변이 200개는 194개 원본 보존 통과/6개 정상 오류이며 매번 정상 입력으로 복구합니다.
4. 단 정의의 문단 부모/고아/잘못된 개수를 section 검사 경로에서도 확인했습니다. `fixture-xml.mjs`로 각주/단 테스트의 ZIP/XML 로딩을 공통화했습니다. 제품 ZIP/HWPX 파서는 아니며 테스트 의존성을 제품에 넣지 않습니다.

다음은 컨트롤 코드/ID 종류 규칙과 논리적 리스트 문맥입니다. 단 설정의 실제 페이지 폭/레이아웃 효과, 각 개체 payload, 구역 ID 0과 개요 fallback을 포함한 전체 문서 의미 검증은 여전히 진행 중입니다.

최종 Debug·ReleaseSafe·ReleaseFast `zig build audit --summary all` 모두 통과: 네이티브 86/86, Node 47/47, HWP5 WASM 52,740회 검사. 기존 CFB 비교·12,000회 변이도 통과했습니다. 포맷/diff 검사와 SSOT/파일 책임 분리 재검토까지 마쳤습니다.

## 후속 구현: 논리적 리스트 그룹과 문단 수

2026-09-06. hwp-spec §3.2.3의 리스트 헤더 뒤 문단 직렬화 설명, §4.3.7의 문단 수 및 실제 레코드 계층을 대조했습니다.

- `list_groups.Groups.build(allocator, tree)`는 동일 부모 아래 LIST_HEADER부터 다음 형제 LIST_HEADER 또는 부모 끝까지를 논리적 그룹으로 표시합니다. 원래 Tree의 부모를 바꾸지 않습니다. 그룹 안의 직접 문단만 세며 중첩 문단은 자체 리스트에 속합니다.
- `Group`은 header_node/parent_node/begin/end/paragraph_count/intervening_records를 가집니다. begin/end는 원본 노드 범위이며 중간 표/개체 레코드도 포함하므로 연속 문단 배열로 해석하지 않습니다. items 순서는 부모 노드 순서, 같은 부모 안에서는 헤더 순서입니다. 그룹 배열만 할당/해제하고 원래 Tree는 바꾸지 않습니다.
- 이 단계는 관측 unsigned 16비트 `count_raw`와 실제 문단 수를 대조합니다. 기존 signedCount 접근자와 6/8바이트 속성 view는 그대로 유지합니다. 속성 배치나 셀/캡션/텍스트박스 의미를 추측해 count를 보정하지 않습니다.
- root LIST_HEADER는 OrphanListHeader, 앞선 형제 LIST_HEADER가 없는 중첩 문단은 OrphanListParagraph, 선언/실제 수 불일치는 ListParagraphCountMismatch입니다. root 문단은 리스트 헤더를 요구하지 않습니다. 빈 리스트를 문단 1개로 자동 생성하지 않습니다.

### 구현 후 적대적 검증

1. 실제 643개 리스트에 중첩 문단 792개가 대응하며 선언 수가 모두 일치합니다. 문단 사이에 낀 직접 형제 레코드는 57개(태그 76:2, 77:29, 79:26)입니다. 문단이 아닌 레코드를 만나면 즉시 그룹을 닫는 방식은 채택하지 않았습니다.
2. JS 독립 부모 탐색/그룹 범위 계산으로 각 그룹의 모든 인덱스·문단 수·중간 레코드 수를 대조했습니다. `[643,792,57]`은 정규 audit의 고정 assert입니다.
3. 빈 그룹/스트림, root 문단, 누락·중복 리스트, 잘못된 깊이, 중첩 개체 안 별도 리스트, count 16개 비트 변이를 검사했습니다. 변이 후 정상 입력을 다시 읽습니다. 네이티브에서는 모든 할당 실패와 마지막 리스트의 count 65535 오류 시 부분 결과 해제를 검사했습니다.

이 검사는 **그룹 범위와 수**에 대한 것이며 각 리스트가 표 셀인지 캡션인지, 해당 속성의 참조·크기·행/열 관계가 유효한지는 아직 검사하지 않습니다. `paragraphs.Report.lists_pending`도 개체별 의미 검증 대상으로 유지합니다. 다음은 컨트롤 코드/ID 규칙 및 표/개체 속성 검증입니다.

최종 Debug·ReleaseSafe·ReleaseFast `zig build audit --summary all` 모두 통과: 네이티브 88/88, Node 47/47, HWP5 WASM 52,835회 검사. 기존 CFB 비교·12,000회 변이도 통과했습니다. 포맷/diff 검사와 SSOT/파일 책임 검토를 완료했습니다.

## 후속 구현: 컨트롤 코드와 ID 종류 검증

2026-09-06. 공식 PDF의 표 6(제어코드), 127(컨트롤 ID), 128(필드 ID)을 기준으로 53개 알려진 ID를 매핑했습니다. 실제 수식 eqed의 코드 11도 확인했습니다. 저장소의 요약 skill 문서에 있는 autn/newn/bkmk/%crf/%fml 같은 표기와 공식 원문의 atno/nwno/bokm/%xrf/%fmu가 다른 점을 확인하여, 요약의 표기를 임의 별칭으로 등록하지 않았습니다.

- `control_rules.zig`는 MAKE_4CHID·구역/단 ID 상수·ID별 기대 제어코드만 소유합니다. 섹션/단 파서가 이 상수를 재사용합니다. 공간/대소문자와 4바이트 전체를 비교하며 `%` 접두사만으로 모든 ID를 필드로 간주하지 않습니다.
- `control_type_validation.inspect(links)`는 기존 Links.build 결과에 대해 known ID의 code를 검사합니다. 다르면 ControlCodeMismatch, 알려지지 않은 ID면 deferred입니다. report는 checked/deferred를 구분하며 오류나 미래 확장을 임의로 보정하지 않습니다.
- 대응 범주: 2 구역/단, 3 명시된 필드 ID, 11 표/그리기/수식, 15 숨은 설명, 16 머리말/꼬리말, 17 각주/미주, 18 자동번호, 21 페이지 관련, 22 책갈피/찾아보기, 23 겹침/덧말입니다.
- 연결 검사와 종류 검사와 payload 의미 검사는 별도 API/책임입니다. 테스트의 링크 WASM 경로는 연결 후 종류 검사도 호출합니다. checked는 개별 컨트롤 속성이나 필드 종료 쌍을 검증했다는 뜻이 아닙니다.

### 구현 후 적대적 검증

1. 실제 연결 313개를 검사해 `[checked=313,deferred=0]`을 정규 audit에서 고정 assert했습니다.
2. 53개 ID 각각에 13개 확장 코드 중 다른 코드 12개를 적용한 636개 오조합을 WASM에서 거부하고 매 오류 뒤 정상 입력으로 복구합니다. 네이티브에서는 코드 0~31 모두를 검사하여 ID마다 하나의 기대 코드만 통과하는지 확인합니다.
3. 미등록/요약 문서 별칭/대소문자 차이 8개는 deferred이며 알 수 없는 ID를 전부 Invalid로 판정하지 않습니다. `%zzz`를 필드로 자동 추정하지 않는 회귀 사례를 포함합니다. 빈 링크·혼합 known/unknown 집계와 규칙 ID 중복 부재도 검사합니다.
4. SSOT 재검토에서 순수 대응표와 링크 순회를 분리해 파일 책임을 유지하고 기존 section/column ID 중복 상수를 없앴습니다.

다음은 표·그리기 개체 공통 속성 및 표의 셀/캡션 의미 검증입니다. 전체 문서 검증은 아직 진행 중이며 `controls_pending` 등의 미완료 집계를 이번 종류 검사만으로 0으로 만들지 않습니다.

최종 Debug·ReleaseSafe·ReleaseFast `zig build audit --summary all` 모두 통과: 네이티브 90/90, Node 47/47, HWP5 WASM 54,215회 검사. 기존 CFB 비교·12,000회 변이도 통과했습니다. 포맷/diff 검사와 SSOT/파일 책임 검토를 완료했습니다.

## 개체 공통 속성: 위치·크기·여백·선택 설명

2026-09-06. 공식 revision 1.3 PDF 표 69와 로컬 4.3.9 절, 실제 HWP CTRL_HEADER를 대조했습니다. `object_common.Properties.parse`는 ID를 제외한 속성을 읽습니다. 표 tbl / 그리기 gso / 수식 eqed만 supports로 분류하며 `$pic`·`$rec` 등 자식 도형 ID를 컨트롤 헤더로 추정하지 않습니다.

- 필수 40바이트: flags u32, y/x i32, width/height u32, z-order i32, 여백 i16[4], instance ID u32, 쪽나눔 방지 i32. 이후 설명은 u16 길이와 UTF-16LE 원문, 그 이후 바이트는 extra로 보존합니다. 플래그와 쪽나눔 값은 미지 값을 임의 bool/enum 기본값으로 치환하지 않습니다.
- 40바이트면 description=null, 42바이트와 길이 0이면 빈 설명입니다. 41바이트 또는 선언 길이에 못 미치는 문자열은 UnexpectedEnd입니다. 짧은 필수 필드를 기본값으로 채우지 않습니다. 확정되지 않은 버전 경계로 설명 존재 여부를 강제하지 않습니다.
- 지원 fixture 45개/Section 47개에서 표 60, 그리기 53, 수식 20, 합계 133개를 실측했습니다. 설명 부재 42, 빈 설명 82, 비어 있지 않은 설명 9개이며, 모든 필드를 테스트 WASM에서 각각 재직렬화해 원본과 대조합니다. 실제 샘플에는 설명 이후 extra가 없으므로 합성 입력으로 별도 검사합니다.
- 부재 42개는 관측상 5.0.1.7, 설명 존재는 5.0.3.0/5.1.0.1/5.1.1.0에서 확인했습니다. 이것을 전체 버전 명세로 일반화하지 않습니다. 설명 없는 필수 40바이트 형식은 현대 버전에서도 파싱 가능하도록 테스트합니다.
- 위치 상위 비트가 켜진 개체 5개: aligns 2개, noori, sample-5017-pics, table2 각 1개. i32 해석은 -2835, -140, -23207 등을 보존합니다. 공식 표에는 HWPUNIT(unsigned)로 되어 있고, aligns.hwpx에도 4294964461 같은 unsigned 표기가 있습니다. signed API 표현을 선택하되 비트 패턴은 그대로 보존하며, HWPX의 signed 표기로 독립 입증했다고 주장하지 않습니다. 요약 문서의 `0xFFFFF9ED = -835` 예시는 산술 오류라 채택하지 않았습니다.

### 구현 후 적대적 검증

1. 필수 필드 모든 잘림 위치, 선택 길이의 1바이트 잘림, 문자열 중간 잘림을 거부합니다. 설명 부재와 빈 설명을 구분하고, 최대 65,535 UTF-16 단위와 마지막 바이트 잘림을 WASM에서 검사합니다.
2. 서로 다른 signed 위치·z-order·여백과 unsigned 크기/ID 극값을 네이티브에서 직접 assert합니다. 원문 설명의 NUL·고립 surrogate·BOM과 borrowed slice/extra 경계를 검사합니다. 바이트 왕복만으로 signed 의미까지 검증했다고 간주하지 않습니다.
3. 세 개 ID의 51바이트 합성 payload 전체 비트 변이 1,224개: 정상 경계 1,182개 원본 왕복, 잘못된 설명 길이 42개 거부, 각 변이 뒤 정상 입력으로 1,224회 복구합니다. 긴 레코드는 확장 길이 framing도 통과합니다.
4. 기존 일반 CTRL_HEADER 테스트가 13바이트짜리 tbl payload를 정상으로 사용하던 문제를 새 검사에서 발견했습니다. 일반 unknown 보존 시험은 zzzz ID로 분리하고, 알려진 세 ID의 짧은 payload 거부는 objects.mjs에서 검사합니다. 제품의 일반 ControlHeader.parse는 여전히 ID/원본 보존만 책임지며 알려진 속성 검사와 구분됩니다.
5. SSOT/책임 재검토: ID는 control_rules 상수, 문자열 경계는 기존 utf16_string.read를 재사용합니다. core의 해석, 테스트 전용 직렬화, 변이/fixture 집계를 별도 파일로 분리했습니다. unknown 자식 도형 ID를 supports에 등록하거나 리스트를 공통 속성 꼬리로 소비하지 않습니다.

이 단계는 개체 공통 payload 읽기입니다. 셀·캡션·개별 도형·표 내부 참조·레이아웃·전체 문서 통합 검사와 제품 HWP JS API는 아직 남아 있습니다. controls_pending를 완료로 바꾸지 않습니다.

최종 Debug·ReleaseSafe·ReleaseFast `zig build audit --summary all` 모두 통과: 네이티브 93/93, Node 47/47, HWP5 WASM 56,849회 검사(모드별). CFB 60컨테이너/483스트림/5,496검색 비교 및 12,000회 변이도 통과했습니다. `zig fmt --check build.zig src tests/hwp5`, 변경 JS 포맷과 `git diff --check`도 확인했습니다.

## 표 본체·셀·캡션과 구조 경계 검증

2026-09-06. 공식 revision 1.3 PDF 표 72/75~80과 로컬 4.3.9.1 절을 대조하고, 지원 실제 문서의 표 60개를 추가 해석했습니다.

- `table.zig`: 태그 77의 flags, 행/열 수, signed 간격/안쪽 여백, 행별 Row Size, 테두리 ID를 읽습니다. 5.0.1.0 이전은 zones=null, 이후는 u16 count가 필수이며 count=0은 빈 배열입니다. 알려지지 않은 꼬리는 extra로 보존하고, 버전 경계를 길이 fallback으로 대체하지 않습니다. Row Size/zone은 기존 record_array의 borrowed 배열입니다.
- `table_zone.zig`: 공식 표 78은 열-행 순서지만 `borderfill.hwp`의 3행×1열 영역 바이트는 행-열 순서입니다. 원시 4좌표를 보존하고 spec_column_first/observed_row_first view를 명시적으로 선택합니다. 테스트 WASM에서 해석한 `[startRow,startCol,endRow,endCol]=[0,0,2,0]`을 짝 `borderfill.hwpx`의 cellzone과 대조했습니다. 변환 시 테두리 리소스 번호는 다를 수 있어 HWPX 테두리 ID까지 동일하다고 주장하지 않습니다.
- `table_cell.zig`는 리스트 view 뒤 26바이트(주소·병합 수·크기·signed 여백·테두리 ID), `caption.zig`는 14바이트(flags·폭·signed 간격·최대 텍스트 폭)를 해석합니다. 공식 표 71의 요약 길이 12와 표 72의 필드 합 14가 충돌하여 표 72/실제 바이트 기준을 사용했습니다. 셀/캡션 뒤 확장 바이트는 보존하되 의미를 추정하지 않습니다.
- `table_lists.Iterator`는 표 컨트롤의 직접 자식 TABLE 마커를 정확히 하나 요구하고, 마커 이전 직접 리스트는 캡션, 이후는 셀로 분류합니다. 길이로 구분하지 않고, 중첩 표는 해당 부모에게 남기며 미지 레코드가 있다고 마커를 바꾸지 않습니다.
- `table_validation.inspect`는 호출자가 list_layout/zone_layout/border_count를 지정합니다. 표 컨트롤의 문단 부모, TABLE 소유권/누락/중복, 0이 아닌 행열 수, 영역 순서/경계, 셀의 0이 아닌 병합 수와 표 안 경계, Row Size 총합과 실제 셀 수를 검사합니다. 테두리 ID는 기존 optional_one_based 규칙을 공유해 0을 부재로 허용하고 nonzero 범위를 확인합니다. 문단 수/링크 검증은 기존 별도 검증기를 유지합니다.

실측: 표 60, 셀 578, 캡션 29, 영역 2. 정규 audit에서 집계를 고정 assert하고, 표의 각 필드와 선택된 셀/캡션의 모든 기본 필드·꼬리를 각각 재직렬화해 원본과 비교했습니다. 명세 6바이트와 관측 8바이트 리스트 view는 서로 다른 주소를 읽는 합성 사례로 명시적 선택을 검증하며 실제 fixture에는 observed8을 사용합니다. 태그 77의 60개가 unknown에서 빠져 문단 보고서 unknown_records는 194→134입니다. controls_pending/lists_pending를 전체 의미 검증 완료로 간주해 줄이지 않았습니다.

### 구현 후 적대적 검증

1. 구/신 버전의 모든 payload 잘림 위치, 필수 zone count와 65,535행/65,535영역의 최대 배열 및 마지막 바이트 잘림을 검사했습니다. 기본 길이와 곱셈은 usize로 승격한 u16 개수로 계산하며 WASM에서도 확장 framing을 사용합니다.
2. 표 합성 payload 전체 비트 변이 288개 중 258개 원본 왕복, 길이 초과 30개 거부, 매 변이 뒤 288회 정상 복구를 확인했습니다. 문자열/좌표를 추정 보정하지 않습니다.
3. 부모 없는 표 컨트롤/TABLE, TABLE 누락/중복, 총 셀 수 불일치, 0/최대 span, 영역 시작-끝 역전/범위 초과, 표·셀·영역 테두리 참조 초과를 거부했습니다. 표/셀/캡션의 signed 극값·서로 다른 필드 위치·borrowed 꼬리를 네이티브에서 검사했습니다.
4. 캡션을 셀과 같은 긴 길이로 만들어도 역할은 마커 순서로 유지되며, 미지 형제와 중첩 표를 삽입해도 외부 표의 마커/개수에 섞이지 않습니다. Tree 생성의 모든 할당 실패와 해석 후 늦은 span 오류의 정리도 네이티브에서 확인했습니다.
5. SSOT 재검토: 역할 선택은 table_lists에서 validation/probe가 공유하고, 배열 경계·컨트롤 ID·참조 규칙은 기존 공통 모듈을 재사용합니다. 일반 리스트 테스트가 사용하던 빈 태그 77은 이제 잘못된 알려진 TABLE이므로 미지 태그 900으로 바꿨고, 실제 TABLE 중간 형제의 리스트 보존은 실제 fixture audit에서 계속 검사합니다.

남은 범위: 셀 간 겹침·전체 격자 채움·행별 Row Size 분포, 셀/캡션 확장 꼬리 필드, 그리기/수식 소유 캡션, 개별 도형·표 레이아웃과 전체 문서/제품 API 통합입니다. 이 검증 성공은 완전한 표 또는 전체 HWP 유효성 판정이 아닙니다. 다음 파트는 셀 격자/행별 분포와 확장 필드의 명세·실제 값 대조입니다.

최종 Debug·ReleaseSafe·ReleaseFast `zig build audit --summary all` 모두 통과: 네이티브 98/98, Node 47/47, HWP5 WASM 57,621회 검사(모드별). 기존 CFB 비교 60컨테이너/483스트림/5,496검색과 12,000회 변이도 통과했습니다. Zig/JS 포맷·diff 검사, 파일 책임/SSOT 검토를 완료했습니다.

## 표 논리 격자: 비중첩·완전 채움·행별 분포

2026-09-06. 실제 표 60개/셀 578개를 별도의 칸별 점유 검사로 먼저 조사했습니다. 모든 표에서 셀 겹침 0, 빈칸 0, Row Size와 해당 행에서 시작하는 셀 수의 불일치 0이었습니다. 병합으로 아래 행을 덮는 셀은 시작 행에서만 셉니다. 이 실측을 정규 audit의 독립 dense oracle과 WASM 검사로 옮겼습니다.

- `table_grid.Rectangle.validate`가 셀 병합 경계 검사의 SSOT입니다. 기존 table_validation의 직접 조건문을 제거하고 이 규칙을 재사용합니다. 행/열 수와 Row Size 배열 개수가 맞는지, 행별 시작 셀 수가 정확한지 검사합니다. 총 셀 수만 같은 잘못된 행 배분은 TableRowCellCountMismatch입니다.
- 비중첩은 행 시작/끝 이벤트와 열 구간 점유로 검사합니다. 같은 행 경계에서 제거를 추가보다 먼저 처리하고, 구간은 반열림 `[start,end)`으로 취급하여 정상적인 인접 셀을 겹침으로 오인하지 않습니다. 열 기준 range-add/range-sum Fenwick 배열 2개를 사용하며 겹침이면 OverlappingTableCells입니다.
- 모든 셀이 범위 안이며 겹치지 않음을 확인한 뒤, u64 넓이 합이 행×열과 같은지 확인합니다. 다르면 IncompleteTableGrid입니다. 넓이 합만 같지만 겹침과 빈칸이 상쇄되는 입력도 거부합니다. event_count 곱과 area 합은 checked 연산입니다.
- 초기화/행 검사를 포함한 시간은 `O(rows + columns + cells log cells + cells log columns)`, 임시 메모리는 `O(cells + rows + columns)`입니다. 최대 65,535×65,535=4,294,836,225칸을 칸별 할당하지 않습니다. `table_validation.inspect`는 이제 allocator를 명시적으로 받고, 표별 Rectangle 수집·검사·해제를 수행합니다. 외부 테이블/입력 버퍼는 소유하지 않습니다.

### 구현 후 적대적 검증

1. 2×2 격자의 가능한 사각형 9개에서 모든 부분집합 512개를 정순/역순으로 검사했습니다. 네이티브 1,024회와 WASM 1,024회 각각 독립 칸별 oracle과 일치했습니다. 겹침·빈칸·공유 경계·완전 병합/분할·빈 셀 집합이 포함됩니다.
2. 고정 seed의 무작위 정상 분할 32종을 순서까지 섞어 검사했습니다. 모든 셀 위치의 네 필드 각각 16비트 변이, 합계 13,440개는 독립 oracle과 같은 오류로 거부했습니다. 매 변이 뒤 정상 입력으로 13,440회 복구했습니다. 총수는 같지만 행별 분포만 다른 변이도 별도 검사합니다.
3. 최대 논리 격자(전체 병합 셀 1개), 한 행에 셀 65,535개, 한 열의 연속 행 65,535개를 WASM에서 통과시켰습니다. 큰 넓이, u16 행별 count 최댓값, 역순 셀, 대량의 같은 행 경계 제거/추가를 검증합니다. 잘린 probe 입력도 거부 후 정상 복구합니다.
4. 네이티브에서는 모든 격자 할당 지점의 OutOfMemory, 늦은 겹침 오류, 표 조립 후 늦은 span 오류의 메모리 정리를 검사했습니다. 표 검증에 할당이 추가되어 기존 실패 주입 테스트가 OutOfMemory를 그대로 전파하도록 보강했습니다.
5. SSOT/책임 재검토: grid는 Tree/CFB를 모르고 숫자/사각형만 검증합니다. 표에서 사각형을 수집하는 책임은 table_validation에 남겼으며 별도 probe와 독립 dense oracle은 테스트 전용입니다. 실제 60개 표 모두 정규 audit에서 두 경로로 검사하고 표/셀/캡션의 이전 원본 왕복 검증도 유지했습니다.

이제 table_validation은 논리 격자의 완전성을 검사하지만, 확장 꼬리 필드·그리기/수식 캡션·시각적 레이아웃·다른 컨트롤/전체 문서 통합까지 완료한 것은 아닙니다. 다음 파트는 셀/캡션 확장 필드의 명세·레퍼런스·실제 값 대조입니다.

최종 검토에서 초기화 비용을 복잡도 설명에 포함하고, 늦은 빈칸 오류의 할당 정리 테스트를 추가했습니다. 중복 셀 카운터도 제거해 실제 Rectangle 배열 길이로 총수/보고서를 계산합니다. Debug·ReleaseSafe·ReleaseFast `zig build audit --summary all` 모두 통과: 네이티브 102/102, Node 47/47, HWP5 WASM 85,667회 검사(모드별). 기존 CFB 비교와 12,000회 변이, Zig/JS 포맷·diff 검사도 통과했습니다.

## 셀 확장 속성·꼬리 선두 필드와 미검증 ParameterSet

2026-09-06. 공개 hwplib의 [셀 속성 비트](https://github.com/neolord0/hwplib/blob/4dc9673942bb8d977405122c3fed758af104cccd/src/main/java/kr/dogfoot/hwplib/object/bodytext/control/table/ListHeaderPropertyForCell.java), [셀 리더](https://github.com/neolord0/hwplib/blob/4dc9673942bb8d977405122c3fed758af104cccd/src/main/java/kr/dogfoot/hwplib/reader/bodytext/paragraph/control/tbl/ForCell.java), [캡션 리더](https://github.com/neolord0/hwplib/blob/4dc9673942bb8d977405122c3fed758af104cccd/src/main/java/kr/dogfoot/hwplib/reader/bodytext/paragraph/control/gso/part/ForCaption.java)를 참고하여 필드 배치를 대조했습니다. 외부 소스는 해석 레퍼런스이며 제품 의존성/코드 이식은 추가하지 않았습니다.

- `CellAttributes`는 선택된 ListHeader.View.attributes의 bit 16 여백 지정, 17 보호, 18 제목 셀, 19 양식모드 편집 가능을 노출합니다. raw 전체 32비트를 보존하고 기존 공통 direction/wrapping/alignment와 분리합니다. 여백 지정이 꺼져 있어도 저장된 셀 여백 값을 덮어쓰지 않습니다.
- `CellExtension.parse(cell.extra)`는 관측 형식을 명시적으로 선택한 별도 뷰입니다. 부재는 text_width=null, 4바이트면 u32 폭만, 이후 1바이트 marker와 나머지 원문을 반환합니다. 1~3바이트만 있으면 UnexpectedEnd입니다. 폭 0과 부재, marker 0과 부재를 구분합니다. 기본 Cell.parse는 임의 꼬리를 그대로 보존하며 이 뷰를 자동 선택하지 않습니다.
- hwplib는 marker 0xff 이후를 공통 ParameterSet으로 읽고 특정 set/item ID의 문자열을 찾습니다. Rhwp는 셀 꼬리의 고정 offset 15/17에서 이름 길이/UTF-16을 읽지만, 이를 일반 규칙으로 도입하지 않았습니다. `parameterSetMarked()`는 표시 유무만 보고하며 remaining을 검증하지 않습니다. 0xff 바로 뒤에 데이터가 없어도 이 선두 필드 뷰 자체는 성공할 수 있으므로 전체 확장 유효성으로 사용하면 안 됩니다.
- 캡션의 추가 바이트는 hwplib도 버전별 미지 꼬리로 건너뜁니다. 의미를 0 패딩으로 단정하거나 제거하지 않고 기존 Caption.extra를 유지했습니다.

실측 및 정규 audit: 셀 578개의 꼬리는 4바이트 71개, 13바이트 507개입니다. 0xff 표시는 0개입니다. 모든 셀의 raw flags·텍스트 폭·marker·remaining을 WASM에서 독립 바이트 oracle과 대조합니다. 짝 HWP/HWPX 11쌍의 셀 532개는 XML의 hasMargin/protect/header/editable과 일치했습니다. 참 값은 여백 지정 96개뿐이고 나머지 세 플래그는 모두 거짓입니다. 따라서 보호/제목/편집 가능의 참 값이나 실제 이름 ParameterSet까지 fixture로 입증했다고 주장하지 않습니다.

### 구현 후 적대적 검증

1. 네이티브 one-hot 32비트로 각 getter가 정확히 해당 비트에만 반응하는지 검사했습니다. 상위 미지 비트와 하위 공통 속성을 함께 넣고 원본과 명시적 spec6/observed8 선택을 확인했습니다.
2. WASM에서 네 속성의 모든 조합 16개와 전체 47바이트 셀의 비트 변이 376개를 대조하고, 376회 정상 복구했습니다. 셀의 모든 위치를 변이시키며 꼬리만 검사하지 않습니다.
3. 기본 헤더/셀의 모든 잘림, 관측 폭의 1~3바이트 잘림을 거부합니다. 부재·빈 값·u32 최댓값·미지 marker·0xff 뒤 빈/불명 바이트를 구분하고 원본 remaining의 borrowed slice를 네이티브에서 확인했습니다.
4. 실제 양성 사례의 부족과 0xff 미관측을 audit 집계에 고정했습니다. 참 값 검증의 근거는 공개 배치와 합성 테스트, 실제 짝 파일의 근거는 위 관측 범위로 분리합니다.
5. SSOT/책임 검토: 리스트 공통 배치를 다시 파싱하지 않고 View를 재사용합니다. 속성 비트와 확장 바이트 해석은 별도 파일이며, field-name을 고정 오프셋/문자열 휴리스틱으로 추가하지 않습니다. 기존 표 격자·원본 왕복 검사를 유지합니다.

다음은 공통 ParameterSet 파서와 이를 사용하는 셀 필드명/컨트롤 임의 데이터입니다. 캡션 미지 꼬리, 관측 8바이트 리스트의 상위 문단 count 슬롯 의미, 그리기/수식 캡션과 전체 문서 조립도 남아 있습니다.

최종 Debug·ReleaseSafe·ReleaseFast `zig build audit --summary all` 모두 통과: 네이티브 104/104, Node 47/47, HWP5 WASM 87,593회 검사(모드별). 기존 CFB 비교·12,000회 변이도 통과했습니다. Zig/JS 포맷·diff 검사와 SSOT/파일 책임 검토를 완료했습니다.

## 공통 ParameterSet 파서와 셀 필드명 소비자

2026-09-06. 공식 표 50~52, DocData/ControlData 절과 [hwplib의 ParameterSet 리더](https://github.com/neolord0/hwplib/blob/4dc9673942bb8d977405122c3fed758af104cccd/src/main/java/kr/dogfoot/hwplib/reader/bodytext/paragraph/control/bookmark/ForParameterSet.java)를 대조했습니다. 외부 코드를 이식하거나 의존성으로 추가하지 않았습니다.

- `parameters/types.zig`는 헤더 배치(spec4/observed6), NULL 배치(spec_u32/observed_empty), 노드/값/제한을 정의합니다. 관측 헤더의 추가 u16은 reserved 원값으로 보존하며 0으로 강제하지 않습니다. Set/array 개수는 명세의 signed i16 기준으로 읽어 음수를 거부합니다. 추가 슬롯을 대형 count의 상위 비트로 확정한 것은 아닙니다.
- 정수 타입 2~9는 타입에 관계없이 4바이트 wire storage를 보존합니다. 작은 논리 정수형이라는 이유로 1/2바이트만 읽거나 상위 비트를 버리지 않습니다. 문자열은 기존 utf16_string의 u16 길이/UTF-16 원문 경계를 재사용하고, Bindata는 u16을 읽습니다. NULL은 선택한 0/4바이트 배치를 따릅니다.
- Set은 중첩하고 배열은 관측 `i16 count + (비어 있지 않으면 공유 item ID u16) + 반복(type u16,value)` 형식입니다. 배열 안의 item ID는 상속되며 ID를 매번 읽지 않습니다. 명세의 ParameterArray 설명만으로 별도 배열 배치를 확정하지 않았습니다. 헤더/NULL 선택이 전체 명세 배열 형식 지원을 뜻하지 않습니다.
- `Document.parse`는 한 Set의 prefix를 파싱해 consumed/extra와 전위 노드 배열을 반환합니다. 노드에는 parent/subtree_end, item ID/wire type/ID의 wire 존재 여부, raw와 typed 값이 있습니다. 노드 배열만 소유하고 raw·문자열·extra는 입력을 빌립니다. 재귀 append 뒤에는 인덱스로 다시 접근해 재할당 전 포인터를 보관하지 않습니다.
- 기본 깊이 32, 허용 상한 64와 기본 노드 100,000개 제한을 적용합니다. 음수 count, 깊이/노드 초과, 잘림, 미지 타입을 명시적 오류로 반환합니다. 미지 타입의 길이를 추정할 수 없으므로 UnsupportedParameterType으로 중단하며 호출자가 가진 원본을 삭제하지 않습니다. prefix 성공은 extra까지 검증했다는 뜻이 아닙니다.
- `cell_field.inspect`는 marker 0xff인 경우 이 공통 파서를 호출합니다. root Set 0x021b의 직접 item 0x4000을 문자열로 요구하며, 비문자열/중복은 오류입니다. 앞에 다른 항목이 있어도 이름을 찾고 중첩 Set의 동명 항목은 선택하지 않습니다. 빈 UTF-16 이름과 누락을 구분합니다. 다른 root Set은 recognized_set=false로 반환하며 임시 노드는 성공/실패 모두 해제합니다.

실제 fixture의 DocData는 noori.hwp와 table-bug.hwp의 80바이트 레코드 2개였습니다. 노드 20개(Set 4, 정수 16)를 해석하고 소비 길이/원본 재직렬화를 정규 audit에서 대조했습니다. 실제 ControlData(tag 87), ParameterArray, BSTR, BinData 및 marker 0xff 셀 이름 사례는 이 fixture 집합에 없습니다. 해당 타입의 근거는 공개 배치와 합성 검증이며 실문서 완성도를 과장하지 않습니다. 현재 flat DocInfo/Body dispatch는 이 할당형 트리를 자동 생성하지 않아 기존 unknown 집계는 그대로입니다.

### 구현 후 적대적 검증

1. 두 헤더/NULL 선택에서 모든 타입과 중첩 배열/Set을 구성하고 모든 prefix 잘림을 거부했습니다. 전체 비트 변이 2,032개 중 1,386개는 선택 배치로 왕복, 646개는 경계/타입/count 오류로 거부, 매 변이 뒤 2,032회 정상 복구했습니다. 꼬리는 원본 보존하므로 선언 개수가 줄어든 입력은 prefix 뒤 extra로 남을 수 있습니다.
2. WASM 최대 배열 32,767항목, 최대 문자열 65,535 UTF-16 단위, 기본 깊이 32 통과/33 거부, 노드 제한을 검사했습니다. 네이티브에서는 상한 깊이 64 통과/63 설정 초과 거부와 허용 상한 밖 옵션 거부를 확인했습니다.
3. item ID와 Set ID, 배열 shared ID, parent/subtree_end 및 원시 signed/unsigned 정수 storage를 네이티브에서 assert했습니다. NUL·고립 surrogate를 포함한 UTF-16과 nonzero reserved를 보존합니다.
4. 모든 할당 실패와 여러 번의 노드 재할당 뒤 미지 타입 오류, 셀 필드명 타입 오류에서 메모리 정리를 검사합니다. 잘린/누락된 marker 0xff Set은 이제 명시적 cell_field 검사에서 거부됩니다. 기본 Extension 뷰와 이 검사를 혼동하지 않습니다.
5. 이름 앞에 다른 항목 추가, 중복 이름, 잘못된 타입, 빈 이름, 다른 root, 중첩 동명 항목, 뒤 8바이트 보존을 검사했습니다. 고정 offset 15/17의 문자열 추출을 사용하지 않습니다. 모델/파서/소비자/probe를 분리하고 기존 UTF-16 읽기를 공유해 SSOT를 유지합니다.

남은 작업은 DocData/ControlData/셀 확장의 문서 조립 호출과 참조/unknown 집계, 더 다양한 실제 파라미터 샘플, 캡션 꼬리 및 나머지 컨트롤입니다. table_validation은 아직 별도 cell_field 호출을 자동 포함하지 않습니다. 전체 문서 검증은 계속 진행 중입니다.

마지막 검토에서 배열 안의 배열/서로 다른 shared ID 사례를 추가했습니다. 실제 80바이트 샘플 2개는 동일한 payload라 두 종류의 형식을 입증한 것은 아닙니다. 최종 Debug·ReleaseSafe·ReleaseFast `zig build audit --summary all` 모두 통과: 네이티브 110/110, Node 47/47, HWP5 WASM 91,934회 검사(모드별). 기존 CFB 비교·12,000회 변이, Zig/JS 포맷·diff 검사도 통과했습니다.

## ParameterSet 소스 연결·바이너리 참조·보류 집계

2026-09-06. `parameter_sources.inspectDocInfo`는 DocData(tag 27), `inspectBody`는 ControlData(tag 87)와 표의 셀 확장을 검사하도록 연결했습니다. 본문은 검증된 Tree와 명시적인 list layout, 관측 셀 확장 prefix를 사용합니다. CFB/파일 I/O를 코어에 추가하지 않았습니다.

- `parameters/references.zig`는 모든 중첩 Set/array 노드의 PIT_BINDATA를 기존 one_based 규칙으로 검사합니다. 0과 DocInfo BinData 리소스 개수 밖 ID는 InvalidResourceReference입니다. 개수는 CFB 스트림 수가 아니라 호출자가 확인한 BinData 리소스 수입니다.
- `cell_field.fromDocument`를 분리해 기존 명시적 셀 이름 API와 소스 검사기가 같은 파싱 결과/이름 규칙을 공유합니다. 소스 검사기는 참조→이름 검사를 수행한 뒤 노드 배열을 해제합니다. 원문과 extra는 변경하지 않습니다.
- 소스별 payload 수, parsed, unsupported 및 그 전체 바이트 수, 노드/참조 수, 이름 수, 미등록 셀 Set 수, opaque 셀 확장 수, trailing payload/바이트 수를 별도 축으로 보고합니다. 빈 이름도 존재하는 이름으로 셉니다. 이 수들을 합쳐 전체 완료 수로 해석하지 않습니다.
- 미지 타입은 개별 길이를 알 수 없어 전체 소스를 unsupported로 남기고 다음 소스를 검사합니다. 해당 소스의 부분 노드/참조를 완료로 세지 않습니다. 잘림·음수 count·한도·OutOfMemory·잘못된 참조/셀 이름은 보류로 바꾸지 않고 오류로 전파합니다.
- 0xff 셀은 ParameterSet/참조/이름 검사에 연결합니다. 다른 marker 또는 남은 미지 바이트는 opaque 셀 확장으로 집계합니다. 알려진 Set 뒤의 extra도 보존하고 trailing으로 남깁니다. 8바이트가 모두 0이라고 검증 완료로 지우지 않습니다.
- 파라미터 옵션 검증을 `Options.validate`로 모아 파서와 소스 검사기가 공유합니다. payload가 없는 입력에서도 잘못된 한도 설정을 놓치지 않습니다.

실제 45개 지원 파일/92개 DocInfo·Section 스트림에 검사기를 적용했습니다. `[doc=2,control=0,cell=0,parsed=2,unsupported=0,unsupported_bytes=0,nodes=20,binary_refs=0,cell_names=0,unknown_cell_sets=0,opaque_cells=507,trailing_payloads=0,trailing_bytes=0]`을 정규 audit에 고정했습니다. 실제 PIT_BINDATA/표시된 셀 이름/ControlData 사례는 여전히 없어 해당 경로는 합성 검증입니다. flat 리소스 참조 검사기의 기존 unknown 집계는 다른 검사 범위이므로 임의로 2를 빼거나 이 보고서에 합산하지 않았습니다.

### 구현 후 적대적 검증

1. DocData와 중첩 Set/array의 참조 ID 0·개수 초과·65535, 최대 유효 ID, 16비트 one-hot 변이를 검사했습니다. 같은 참조 검증이 셀 ParameterSet에도 적용되는지 확인했습니다.
2. 미지 payload→정상 payload→trailing payload를 한 스트림에 넣어 보류 후 정상 검사가 계속되는지 검사했습니다. 미지 payload 뒤의 잘린/참조 오류 소스는 여전히 실패합니다. 미지 타입을 잘림/OutOfMemory와 혼동하지 않습니다.
3. ControlData, 표시된 셀 이름, 빈 이름, 중복/잘못된 이름 타입, 다른 root Set, 0xff 뒤 누락, 미지 marker와 8바이트 꼬리를 소스 경로에서 검사했습니다. ControlData를 읽었다고 부모/컨트롤별 의미까지 검증한 것으로 간주하지 않습니다.
4. 네이티브에서 성공·참조 실패·미지 타입 보류의 모든 할당 실패를 주입했습니다. empty 입력의 잘못된 옵션과 레코드 framing의 모든 잘림 위치도 검사했습니다. 파싱 결과를 두 번 소유하거나 재해석하지 않습니다.
5. SSOT/책임 재검토: 소스 라우팅과 참조 규칙, 셀 이름 의미를 분리하고 기존 reference_rules·Options.validate·cell_field.fromDocument를 공유합니다. 처음 연결 과정에서 optional 결과의 오류 union 변환 문제를 컴파일러가 잡았고 명시적 try로 수정한 뒤 검증했습니다.

이 단계는 파라미터 관련 검증 경로 연결입니다. 전체 문서 검사 진입점, 구역 개수/전역 참조 조립, ControlData 소유권과 컨트롤별 의미, 미지 꼬리 및 나머지 본문 컨트롤은 아직 남아 있습니다.

최종 Debug·ReleaseSafe·ReleaseFast `zig build audit --summary all` 모두 통과: 네이티브 113/113, Node 47/47, HWP5 WASM 92,098회 검사(모드별). 기존 CFB 비교·12,000회 변이, Zig/JS 포맷·diff 검사도 통과했습니다. 실제 opaque 셀 확장 507개는 검증 완료로 바꾸지 않고 남겼습니다.

## 압축 해제된 문서 검증 진입점

2026-09-06. `hwp5.document_validation.inspectDecoded(allocator, input, options)`를 추가했습니다. 입력은 256바이트 FileHeader, **이미 압축 해제된** DocInfo, `{index: u16, bytes}` 구역 배열입니다. 원본 헤더의 compressed 비트가 있어도 다시 압축 해제하지 않습니다. 암호화·배포용·DRM 헤더는 기존 지원 정책으로 거부합니다.

공식 revision 1.3 PDF의 3.2.3(BodyText/Section 번호와 문서 속성 구역 수), 4.2.1 표 14를 로컬 원문과 대조했습니다. 표 14는 첫 u16이 구역 수이며 전체 기본 길이는 26바이트입니다. 로컬 요약의 ‘문서 내 각종 시작번호에 대한 정보’는 별도 u16 필드가 아니라 그룹 설명이므로 새로운 필드로 추가하지 않았습니다.

- `document/types.zig`: 입력·명시적 배치·한도·보고서와 소유권 계약.
- `document/docinfo.zig`: 문서 속성 정확히 하나, 주요 리소스 개수/활성 참조, 파라미터 소스 검사 연결.
- `document/section.zig`: Tree 한 번 생성 후 문단·구역 정의·컨트롤 링크/종류·리스트·개체 공통 속성·표 격자·파라미터 검사 연결. DocInfo에서 확인한 리소스 개수를 사용합니다.
- `document/validation.zig`: 헤더 지원 정책, 선언/실제 구역 수 대조, 인덱스 중복·범위 검사, 전역 한도와 보고서 수명. 입력 배열 순서와 무관하게 보고서는 0부터 구역 인덱스 순서입니다.

기본 한도는 구역 4,096개, 헤더+decoded DocInfo+모든 구역 바이트 합 64 MiB, 물리 레코드 합 1,000,000개입니다. 레코드 합은 검사기 반복 순회 횟수가 아니라 실제 입력 레코드를 한 번씩 셉니다. 스트림별 framing 한도도 함께 적용합니다. ParameterSet 노드/깊이 한도는 각 payload에 적용되는 별도 제한입니다. 총 입력 바이트 한도는 최대 힙 사용량 보장을 뜻하지 않습니다.

선언된 구역 수와 supplied 배열 길이를 대조한 뒤 실제 배열 길이만큼 인덱스 맵을 할당합니다. 개수 일치+범위 내 유일 인덱스로 구역 누락도 거부합니다. 선언과 입력 모두 0인 경우는 허용하지만 이것이 실제 빈 HWP 파일의 완전한 유효성 증명은 아닙니다. CFB 저장소/필수 스트림 존재 여부는 이 함수가 검사하지 않습니다.

```zig
var report = try hwp5.document_validation.inspectDecoded(allocator, .{
    .header = header_bytes,
    .doc_info = decoded_doc_info,
    .sections = decoded_sections,
}, .{
    .list_layout = .observed8,
    .zone_layout = .observed_row_first,
    .parameters = .{ .header_layout = .observed6, .null_layout = .observed_empty },
});
defer report.deinit(allocator);
// report.doc_info의 borrowed 속성/매핑을 사용하는 동안 decoded_doc_info 유지.
// report.sections[i]는 구역 i의 진단이며 보류/미지 항목을 포함할 수 있음.
```

Report는 구역 보고서 배열만 소유합니다. 헤더는 값 복사, DocInfo의 extra/매핑 raw는 입력을 빌리며, 구역 보고서는 임시 Tree 인덱스나 해제된 payload 포인터를 포함하지 않습니다. 실패 시 부분 보고서는 반환하지 않고 모든 임시 할당을 정리합니다.

### 구현 후 적대적 검증

1. **조립/SSOT**: 45개 실제 지원 파일·47개 구역의 통합 보고서를 개별 검사기 결과와 모든 필드 대조했습니다. 역순 구역 입력도 정규 인덱스 결과와 같습니다. 이 비교는 검사기 연결 일치 검증이지 한컴 프로그램과 독립적으로 의미가 100% 같다는 증명은 아닙니다. 실제 합계는 헤더 포함 482,195바이트, DocInfo+Section 10,425레코드입니다.
2. **잘못된 선언/입력**: 45개 파일 각각에서 구역 수 불일치·중복·범위 밖 ID, 문서 속성 누락/중복/잘못된 level, 잘림·테스트 bridge의 trailing 입력, 미지원 헤더를 거부했습니다. DocInfo level 검사는 이미 reader가 소유하므로 새 코드의 중복 검사를 제거했습니다.
3. **전역 경계/후반 실패**: 실제 각 파일의 정확한 바이트/레코드 한도에서는 성공, 각각 한 단계 작은 한도에서는 실패합니다. 첫 구역 성공 후 두 번째 구역 누락·잘못된 문단 참조·구역 한도 초과, 추가 DocData의 잘못된 BinData 참조 및 미지 타입 뒤 잘린 payload도 검사했습니다. 오류를 보류로 바꾸지 않습니다.
4. **명세 누락 재현/수정**: 정상 구역 앞에 빈 루트 문단을 추가하면 구역 정의가 두 번째 문단으로 밀려도 이전 WASM은 성공했습니다(`Missing expected exception`으로 회귀 테스트 실패 재현). 공식 3.2.3의 첫 문단 조건을 기존 `body/section_validation.zig`에 추가해 `MisplacedSectionDefinition`으로 거부합니다. 반대로 첫 문단 앞의 미지 레코드는 문단으로 오인하지 않습니다. 새 문서 계층에 같은 규칙을 복제하지 않았습니다.
5. **수명/할당/회복**: 네이티브에서 정상 두 구역 조립과 후반 구역 실패의 모든 할당 실패 지점을 주입했습니다. DocInfo borrowed 꼬리의 수명, 빈 구역 선언, 소스가 없어도 잘못된 옵션 거부를 확인했습니다. 45개 파일의 명시적 오류 1,215건은 각각 정상 문서를 재호출해 회복을 확인했습니다. opaque/unsupported 진단은 보고서에 남습니다.

최종 Debug·ReleaseSafe·ReleaseFast `zig build audit --summary all` 모두 통과: 네이티브 117/117, Node 47/47, HWP5 WASM 95,305회 검사(모드별), CFB 60컨테이너/483스트림/5,496검색 비교 및 12,000회 변이(trap 0). 정상 파일 대조에 더해 오류/후속 정상 호출을 수행한 수치이며, 테스트 수가 포맷 지원률을 뜻하지 않습니다.

**남은 범위**: CFB에서 정규 경로로 필수 스트림/구역을 수집하고 압축을 해제하는 파일 단위 진입점, BinData 실물 연결, 번호 ID 0/fallback, ControlData 소유권·개별 컨트롤 의미, 미지 DocInfo/셀·캡션 꼬리, 나머지 도형/필드/HWPX/공개 JS API는 아직 남아 있습니다. 기존 opaque 셀 확장 507개와 각 검사기의 pending/unknown은 다른 검사기의 성공 수로 상쇄하지 않았습니다. 전체 문서 모델·렌더링·편집·저장 완료가 아닙니다.

## CFB 파일 단위 검증·내부 BinData 연결

2026-09-06. `hwp5.container_validation.inspect(allocator, file_bytes, options)`를 추가했습니다. 파일 바이트를 strict CFB로 열고 `/FileHeader`, `/DocInfo`, `/BodyText`의 정확한 경로와 kind를 확인합니다. DocInfo와 BodyText 직접 자식의 Section 스트림을 압축 해제한 후 기존 decoded 문서 검증기를 호출합니다. 같은 이름의 루트/다른 저장소 스트림으로 대신하지 않습니다.

공식 구조 3.1/3.2.3/3.2.5와 BinData 표 17·18을 참조했습니다. 표 18의 default/compressed/uncompressed 설정은 기존 `bin_data_stream.decode`를 재사용합니다. `BINhhhh[.extension]` 이름은 기존 레퍼런스·실제 corpus에서 관측한 규칙이며 공식 문서가 모든 파일 변형의 이름을 보장한다고 해석하지 않습니다. 로컬 요약에 적힌 다중 fallback 경로/압축 실패 후 원본 사용은 채택하지 않았습니다.

- `container/paths.zig`: CFB의 findExact로 계층 조회, kind 대조, 정규 `Section`+10진수 인덱스, `BinData/BIN`+4자리 16진수 ID와 선택 확장자 생성. CFB의 대소문자 비교·이름 제한을 재사용합니다. 01 같은 인덱스 별칭, 음수·비숫자·u16 초과, 확장자 경로 구분자/NUL/잘못된 UTF-16·길이 초과를 거부합니다. 원래 DocInfo 파서는 해당 raw를 보존하며 경로 소비 단계에서만 오류를 냅니다.
- `container/sections.zig`: BodyText 직접 자식만 수집하고 압축 해제된 구역 배열/바이트 수명을 소유합니다. 다른 저장소의 Section은 문서 구역으로 세지 않습니다. 미지 이름은 강제로 구역으로 추정하지 않습니다.
- `container/binaries.zig`: DocInfo BinData의 저장 ID/확장자로 스트림을 찾고 항목별 압축 정책으로 해석합니다. BinData 리소스의 1-based 참조 번호와 CFB 저장 ID를 혼동하지 않습니다. LINK는 외부 접근 없이 집계하고 미지 타입도 보류합니다. 알려진 내부 항목의 누락/잘못된 kind/예약 압축/손상/한도 초과는 오류입니다.
- `container/validation.zig`: strict CFB·압축 해제·기존 문서 검증 연결과 반환 보고서 수명. CFB 원본/추출 스트림 한도는 `options.cfb`, HWP 헤더+DocInfo+구역+내부 BinData의 decode 합계 한도는 `options.document.max_total_bytes`입니다. CFB strict 검사는 항상 켜며 `options.cfb.strict=false`로 우회하지 않습니다. document Options.validate를 공유해 잘못된 설정을 파일 할당 전에 거부합니다.

Report는 document Report와 DocInfo backing을 소유하므로 입력 파일 바이트를 반환 직후 해제해도 유효합니다. 임시 CFB/구역/바이너리 바이트는 내부에서 해제하며 결과의 deinit은 report 배열과 DocInfo backing을 정리합니다. `binary_data`는 items/decoded/decoded_bytes/external_links/unsupported_types를, `uninspected_streams`는 소비하지 않은 모든 CFB 스트림 수를 보고합니다. 미리보기·요약·스크립트·이력 등의 스트림을 유효한 HWP로 검증했다는 뜻이 아닙니다. 그림/OLE 바이트의 압축 무결성 확인과 이미지/OLE 내부 형식 검증도 구분합니다.

동일 바이너리 스트림을 여러 DocInfo 항목이 가리킬 수 있습니다. 각 항목의 압축 정책으로 검사하며 decoded_bytes와 총 한도도 항목별 소비량으로 셉니다. uninspected는 스트림별로 세므로 중복 참조가 있어도 음수가 되거나 다른 미검사 스트림을 상쇄하지 않습니다. CFB 힙 사용량과 압축 해제 합계는 별도 지표이며 이 한도가 최대 힙 메모리를 그대로 보장하지 않습니다.

### 구현 후 적대적 검증

1. 실제 지원 파일 **45개·47개 구역**, 내부 BinData **13항목/1,028,155 decoded 바이트**를 검사했습니다. 파일 진입점의 document 보고서는 decoded 진입점과 모든 필드가 같고, 바이너리 크기는 Node raw DEFLATE 결과와 대조했습니다. 헤더 포함 전체 소비량 합계는 **1,510,350바이트**입니다. 실제 미검사 스트림 **270개**는 정규 audit에 고정해 완료로 숨기지 않았습니다.
2. 정상 CFB writer로 만든 손상 HWP에서 필수 항목 누락/잘못된 kind·동명 항목의 잘못된 부모·정규 Section 이름 경계·확장자 경로 삽입/잘못된 UTF-16·미지원 보안 헤더를 거부했습니다. 대소문자가 다른 정상 경로는 CFB 규칙에 따라 같은 데이터에 연결됩니다. 이 테스트는 파괴된 CFB만 거부하고 HWP 계층 검사를 건너뛰는 편향을 피합니다.
3. 문서 기본 압축 2종×항목별 압축 3종의 **6정책**과 예약 압축 거부, DocInfo/BinData 압축 손상 후 fallback 금지를 확인했습니다. 바이너리 길이 0·4095·4096·4097 각각 압축/비압축 **8경계**에서 정확한 총 한도 성공/1바이트 부족 실패를 검사했습니다. STORAGE 형식의 확장자 없는 이름과 같은 스트림의 중복 항목 소비량도 검사했습니다.
4. 네이티브에서 정상 문서·후반 구역 실패·문서 검사 성공 후 바이너리 경로 성공/누락의 **모든 할당 실패 지점**을 주입했습니다. v3/v4 CFB, 입력 해제 후 반환 DocInfo 참조 수명, 독립 CFB 입력 한도와 UTF-16 이름 최대 길이도 검사했습니다. 외부 링크는 실제 접근 없이 집계하고 미사용 BIN 스트림은 uninspected로 남습니다.
5. SSOT/책임 재검토: CFB 파서/strict/이름 규칙, stream 지원 정책, BinData 압축 정책, decoded 문서 검사기를 재사용합니다. 경로 규칙·구역 수집·바이너리 연결·보고서 수명을 분리했고 제품 JS ABI는 변경하지 않았습니다. 테스트 전용 WASM mode 25는 기존 문서 보고서 serializer를 공유합니다.

**남은 범위**: 270개 미검사 스트림의 종류별 검증, 구역 번호 fallback, ControlData 소유권과 개별 컨트롤/도형 의미, 미지원 DocInfo와 셀/캡션 꼬리, 그림/OLE 내용, HWPX·공개 HWP JS API·편집/저장은 아직 남아 있습니다. 이 단계는 파일 조립과 알려진 검증 경로 연결이며 전체 목표 완료가 아닙니다.

최종 Debug·ReleaseSafe·ReleaseFast `zig build audit --summary all` 모두 통과: 네이티브 121/121, Node 47/47, HWP5 WASM 95,536회 검사(모드별), 새 파일 단위 명시적 오류/회복 32쌍. 기존 CFB 60컨테이너/483스트림/5,496검색 비교·12,000회 변이(trap 0), Zig/JS 포맷·diff 검사도 통과했습니다.

## 미검사 스트림 실측·미리보기 텍스트

2026-09-06. 지원 corpus 45개 파일에서 남은 270개 스트림의 정확한 CFB 계층 경로를 집계했습니다. 아래 바이트 수는 CFB에서 꺼낸 스트림 크기이며, 스크립트 등의 압축 해제 크기를 뜻하지 않습니다.

| 경로 | 개수 | 바이트 합 | 이번 단계 |
|---|---:|---:|---|
| `/\u0005HwpSummaryInformation` | 45 | 21,381 | 요약 정보 미검사 |
| `/PrvImage` | 45 | 889,352 | 이미지 내용 미검사 |
| `/PrvText` | 45 | 22,896 | raw UTF-16LE 구조/진단 추가 |
| `/Scripts/JScriptVersion` | 45 | 596 | 미검사 |
| `/Scripts/DefaultJScript` | 45 | 5,595 | 미검사, 실행하지 않음 |
| `/DocOptions/_LinkDoc` | 45 | 23,580 | 미검사, 외부 문서 접근하지 않음 |

3.2.6의 유니코드 미리보기 설명과 실제 원문을 대조했습니다. `preview/text.zig`의 `Text.parse`는 길이 접두사 없는 raw UTF-16LE를 빌리며 홀수 길이는 `InvalidPreviewTextSize`로 거부합니다. UTF-16 코드 유닛 수, 정상 Unicode scalar 수, 고립 서로게이트 수, NUL/BOM 유닛 수를 별도 집계합니다. 서로게이트 쌍은 두 코드 유닛/한 scalar이며, 고립 유닛은 scalar 수에 합산하지 않습니다.

기존 DocInfo 문자열 보존 정책과 같이 잘못된 서로게이트를 U+FFFD로 치환하거나 버리지 않습니다. 통계의 `unpaired_surrogates`가 0이 아닌 보고서는 Unicode 이상이 발견된 결과이지 정상 판정이 아닙니다. BOM은 시작/중간 어디에 있어도 원문을 보존하며 NUL 종결, 본문 제어문자 문법 또는 고정 2048바이트 상한을 추정하지 않습니다. 텍스트를 화면에 표시할 때의 치환 정책은 이 검사기가 결정하지 않습니다.

`container/preview.zig`는 선택적 루트 `/PrvText`를 정확한 CFB 경로로 조회하고 kind·전체 소비 한도를 확인한 뒤 파서에 연결합니다. 다른 저장소의 동명 스트림은 대신 사용하지 않습니다. FileHeader compressed 비트가 켜져 있어도 PrvText는 다시 압축 해제하지 않습니다. `Report.preview_text=null`과 존재하지만 0유닛인 Stats는 구분되며, 통계만 보유하므로 해제된 CFB 원문을 참조하지 않습니다. 검사한 PrvText 바이트는 total_decoded_bytes에 포함합니다.

### 구현 후 적대적 검증

1. **실제 파일 대조**: 45개 미리보기 스트림의 22,896바이트를 테스트 전용 WASM에서 통계+원문으로 반환해 JS UTF-16 문자열 순회 결과/입력 바이트와 대조했습니다. 11,448유닛/11,448 scalar, 고립 서로게이트·NUL·BOM은 모두 0입니다. 실제 corpus에 없는 양성 서로게이트/BOM/NUL 경로는 아래 합성 검증으로 구분합니다.
2. **유닛/순서 경계**: 단일 UTF-16 유닛 65,536종을 모두 검사하고 9개 경계값의 3유닛 조합 729종을 검사했습니다. high→high→low, low→high→low, 쌍 뒤 고립 유닛 등 순서 차이를 독립 JS 문자열 순회와 대조합니다. 네이티브에서도 모든 단일 유닛의 진단을 검사합니다.
3. **잘림/원문 보존**: BOM·NUL·본문에서 제어코드로 쓰이는 유닛·보조 평면 문자·고립 서로게이트가 섞인 샘플의 모든 prefix 25개를 검사했습니다. 홀수 바이트만 구조 오류이며 짝수 경계에 남은 고립 high surrogate는 원문/진단으로 보존합니다. 빈 텍스트와 8192바이트 입력도 검사해 임의 종결/크기 제한을 적용하지 않음을 확인했습니다.
4. **파일 연결/한도**: 루트 PrvText 부재·빈 값·이상 진단이 있는 원문·잘못된 kind·홀수 크기를 확인했습니다. 다른 저장소의 동명 홀수 스트림은 미검사로 남습니다. 실제 파일의 정확한 총 바이트 한도에서는 성공하고 한 바이트 부족하면 실패하므로 미리보기 소비량도 전역 한도에 포함됩니다.
5. **수명/SSOT**: 미리보기가 포함된 정상 파일의 모든 할당 실패와 문서 검증이 성공한 뒤 홀수 PrvText에서 실패하는 모든 할당 실패 지점을 주입했습니다. 입력 CFB를 해제한 뒤 보고서 통계가 유효함을 확인합니다. raw 미리보기 문법과 CFB 조회/한도/집계는 책임을 나누고, Reader의 경계 읽기와 CFB findExact를 공유합니다.

현재 실제 미검사 스트림은 **225개**입니다. 이전 270개 중 PrvText 45개의 구조/진단 경로만 추가한 것이며, 다른 스트림까지 완료 처리하지 않았습니다. 전체 소비량 합계는 미리보기 포함 1,533,246바이트입니다. 다음 대상은 요약 정보와 나머지 미검사 스트림의 형식/필드 검증이며, 전체 문서 목표는 계속 진행 중입니다.

최종 Debug·ReleaseSafe·ReleaseFast `zig build audit --summary all` 모두 통과: 네이티브 124/124, Node 47/47, HWP5 WASM 161,907회 검사(모드별). 기존 CFB 비교 60컨테이너/483스트림/5,496검색 및 12,000회 변이(trap 0), Zig/JS 포맷·diff 검사도 통과했습니다.
