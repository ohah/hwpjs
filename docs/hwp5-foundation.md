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

## HWP 요약 정보의 단일 property-set 검증

2026-09-06. 선택적인 루트 `/\u0005HwpSummaryInformation`을 HWP 단일 property-set 프로파일로 읽고 파일 검사에 연결했습니다. 일반 MS-OLEPS의 모든 FMTID/다중 set/타입을 구현한 단계는 아닙니다.

명세 근거는 HWP 3.2.4 표 7과 Microsoft의 [PropertySetStream](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-oleps/6e65d6fa-6044-4e23-ae71-d65d1e3b1249), [PropertySet](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-oleps/aefcbddf-f299-4f5e-a9da-65ce4ca55075), [PropertyIdentifierAndOffset](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-oleps/f59e6c94-a0ae-4d1b-85d3-f01c35779a22), [UnicodeString](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-oleps/9660cb24-953a-4e60-adf2-37cc0e779d19)입니다. 원문과 실측을 구분했습니다.

- 실제 HWP summary의 FMTID wire bytes는 `60b6a29f6110d411b4c6006097c09d8c`, set 수는 1, 시작 offset은 48이었습니다. 헤더 version 0/1과 해당 FMTID만 지원하며 다른 형식/다중 set은 명시적 Unsupported 오류입니다. system identifier/CLSID는 원문 보존하고 문서 의미로 추정하지 않습니다.
- 공식 HWP 표에는 문자열이 VT_LPSTR로 적혀 있으나 실제 지원 corpus는 VT_LPWSTR(31)입니다. 이번 typed value 지원은 VT_LPWSTR·VT_I4(3)·VT_FILETIME(64)입니다. LPSTR/코드페이지를 임의 UTF-8로 읽지 않고 unsupported 타입으로 보류합니다.
- 속성 디렉터리는 ID 순서가 아니라 offset 증가 순서입니다. 실제 PID 20이 5보다 앞에 있고 PID 0은 마지막입니다. offset은 set 기준이며 디렉터리 영역과 겹치지 않고 4바이트 정렬/단조 증가/범위 내에 있어야 합니다. ID 중복은 별도 검사합니다.
- 마지막 PID 0은 dictionary입니다. 실제 값이 `01 00 00 00`으로 시작해도 VT_NULL 등 일반 TypedPropertyValue로 해석하지 않습니다. 전체 원문을 dictionary_deferred로 보존하며 내부 dictionary 의미는 후속 범위입니다. 전체 set 길이가 홀수인 관측 파일도 있으므로 속성 시작 정렬 조건을 전체 길이 정렬로 확대하지 않았습니다.

책임은 `summary/header.zig`(프로파일/envelope), `parser.zig`(디렉터리/할당/범위), `value.zig`(typed wire 값), `rules.zig`(HWP ID별 기대 타입)로 나눴습니다. 알려진 ID에 해석 가능한 잘못된 타입이 오면 InvalidSummaryPropertyType, 해석하지 못하는 타입이면 unsupported 진단입니다. 미지 ID도 원문과 unknown_ids로 남습니다. 다른 속성 타입/새 ID를 추측해 문자열로 강제하지 않습니다.

문자열의 길이는 u32 UTF-16 코드 유닛 수이며 종결 NUL을 포함합니다. 0길이와 NUL 하나인 문자열은 다르게 보존합니다. 선언 길이를 남은 바이트와 나눗셈으로 대조한 후 곱해 wasm32 오버플로를 피하며, 종결과 필요한 4바이트 경계 패딩을 검사합니다. 내부 NUL/고립 서로게이트는 원문에서 제거하지 않습니다. 모든 문자열이 정상 Unicode라는 증명은 아닙니다. 정수는 i32 부호, FILETIME은 전체 u64를 유지하며 JS Number/지역 시간으로 강제 변환하지 않습니다.

Document는 속성 배열만 소유하며 raw stream/header/속성 값/extra는 입력을 빌립니다. Header 뒤·디렉터리 뒤의 gap, 알려진 값 뒤 extra, stream 뒤 바이트도 보존하고 trailing_bytes에 집계합니다. 이 보류 바이트를 정상 패딩이라고 단정하지 않습니다. 속성 수는 실제 디렉터리 바이트와 호출자 한도로 제한하며 container 기본 `max_summary_properties`는 4096입니다. 0은 빈 set만 허용하는 한도입니다.

`container/summary.zig`는 제어문자 0x05를 포함한 정확한 루트 경로만 사용합니다. 접두사가 빠진 동명 스트림으로 fallback하지 않고, 원문은 재압축 해제하지 않습니다. 파싱된 통계만 container Report에 복사하고 임시 속성 배열을 해제합니다. summary 소비량도 기존 전역 바이트 한도에 포함합니다.

### 구현 후 적대적 검증

1. **실제 파일/typed 왕복**: 지원 45파일의 summary 21,381바이트·630속성을 대조했습니다. typed 값으로 재직렬화한 속성 원문이 입력과 같으며 문자열 360/FILETIME 135/정수 90/dictionary 보류 45입니다. 미지원 타입/미지 ID/남은 바이트는 이 실제 corpus에서 0이지만 일반 형식 지원 완료를 뜻하지 않습니다.
2. **경계/배치**: 합성 정상 스트림의 모든 잘림 prefix, 잘못된 byte order/version/FMTID/set 수·크기·offset·속성 수, 디렉터리 침범·중복/역순/미정렬 offset·중복 ID를 거부했습니다. 명시적 오류 140건 각각 뒤에 정상 문서를 다시 파싱해 회복을 확인했습니다.
3. **값/부재/보류**: u32 최대 문자열 길이, 누락 종결·잘못된 패딩·known ID의 잘못된 타입을 검사했습니다. 0길이/NUL 하나/고립 서로게이트/미지 타입·ID/dictionary·extra 원문을 구분하고, i32 -1/u64 최댓값도 손실 없이 대조했습니다. 적법한 비정렬 ID 순서를 정렬하거나 거부하지 않습니다.
4. **파일 연결**: 정확한 루트 이름, 0x05가 빠진 alias의 미소비 처리, 잘못된 kind/손상 summary, 정확한 전체 바이트 한도 성공/한 바이트 부족 실패를 검사했습니다. optional summary 부재와 검사 결과의 존재를 구분합니다.
5. **할당/수명/SSOT**: 정상 summary와 중복 ID 실패의 모든 할당 실패를 주입했습니다. summary를 포함한 파일 전체의 성공 및 문서·미리보기 검사 후 summary에서 실패하는 모든 할당 실패 지점도 검사했습니다. 입력 CFB 해제 후 통계는 유효하며 해제된 raw 포인터를 container 보고서에 남기지 않습니다. 기존 CFB lookup/Reader/문서 검사기를 재사용하고 타입/ID 규칙은 분리했습니다.

현재 미검사 스트림은 **180개**이며 summary 내부의 dictionary 보류 **45개**는 별도로 남아 있습니다. 전체 소비량 합계는 1,554,627바이트입니다. 다음 작업은 dictionary/코드페이지와 미지원 요약 타입을 명세에 따라 확장하는 것이며, 미리보기 이미지·스크립트·문서 옵션·나머지 본문 컨트롤/도형·HWPX 등 전체 목표는 계속 남아 있습니다.

최종 Debug·ReleaseSafe·ReleaseFast `zig build audit --summary all` 모두 통과: 네이티브 128/128, Node 47/47, HWP5 WASM 162,245회 검사(모드별). 기존 CFB 비교 60컨테이너/483스트림/5,496검색·12,000회 변이(trap 0), Zig/JS 포맷·diff 검사도 통과했습니다.

## 요약 코드페이지·LPSTR·dictionary 구조

2026-09-06. 명시된 코드페이지를 사용하는 요약 값의 경계를 추가했습니다. 근거는 MS-OLEPS의 [CodePage Property](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-oleps/b8910736-7f4a-469a-9644-aed68a71d7d1), [CodePageString](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-oleps/a4c32611-5b79-4965-8f50-50639c138e16), [DictionaryEntry](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-oleps/333959a3-a999-4eca-8627-48a224e63e77), [Dictionary](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-oleps/99127b7f-c440-4697-91a4-c853086d6b33)입니다.

- parser는 속성 디렉터리를 검사한 뒤 PID1을 먼저 찾아 VT_I2인지 확인합니다. 텍스트/dictionary보다 뒤에 있는 코드페이지도 적용합니다. raw 값은 signed i16, `Document.code_page`는 같은 16비트 비트패턴의 u16입니다. 65001을 음수/범위 초과로 잘못 버리지 않습니다. 코드페이지 식별자 전체 등록 목록의 유효성이나 문자 변환까지 구현한 것은 아닙니다.
- `strings.zig`는 기존 LPWSTR와 새 LPSTR/dictionary가 공유하는 경계·종결·패딩을 소유합니다. LPWSTR 길이는 UTF-16 유닛 수, LPSTR 길이는 **CP1200에서도 바이트 수**입니다. CP1200의 바이트 수는 짝수여야 하며 NUL 종결은 2바이트입니다. 다른 코드페이지는 8비트 바이트 배열을 보존합니다. 원문을 UTF-8/CP949 등으로 자동 변환하지 않습니다.
- `Value.encoded_string`은 코드페이지 ID와 원시 bytes를 함께 반환합니다. 내부 NUL/추가 NUL도 제거하지 않습니다. 코드페이지가 없으면 값 의미는 보류하지만 인코딩과 무관한 바이트 길이·패딩·마지막 0바이트 조건은 검사합니다. 부재를 0이나 호스트 기본 코드페이지로 대체하지 않습니다.
- `dictionary.zig`는 borrowed 이름 Iterator와 구조 검사기를 분리합니다. 코드페이지가 명시된 경우에만 parser에서 호출합니다. CP1200 이름은 UTF-16 유닛 길이와 항목별 4바이트 패딩, 나머지는 바이트 길이와 **항목별 무패딩**을 적용합니다. dictionary 전체의 마지막 정렬 바이트는 별도로 소비합니다. ID 2..0x7fffffff 범위/ID 중복을 검사하며 이름의 인코딩·대소문자/동일성 의미 검증은 보류합니다.
- dictionary entry 수는 남은 입력의 최소 항목 크기로 선검사합니다. 임시 중복 ID 집합만 할당하고 모든 실패에서 해제합니다. Iterator는 실패 시 reader 위치와 남은 항목 수를 바꾸지 않습니다. `Document.dictionary_structure`에는 확인한 항목 수와 추가 원문을 제공하지만 `dictionaries_deferred`를 의미 검증 완료로 감소시키지 않습니다.

실제 지원 45개 HWP를 다시 조사하니 모두 PID1 코드페이지가 없었고, PID0 원문은 동일한 13바이트 `01000000000000000100000000`였습니다. 이를 표준 dictionary 항목이라고 단정하면 예약 ID 0을 포함하므로 기본 코드페이지를 임의 주입해 ‘정상 dictionary’로 승격할 수 없습니다. 기존 원문/보류를 유지했고 실제 정상 파일 결과는 달라지지 않았습니다. 이번 코드페이지 양성 경로는 합성 자료로 검증한 범위입니다.

### 구현 후 적대적 검증

1. 코드페이지 949/1252/1200/65001과 속성 순서 앞/뒤를 검사했습니다. CP949 바이트와 UTF-8 보조 평면 문자의 원문, 내부 NUL, 빈 문자열, 16비트 부호 비트가 있는 코드페이지를 typed 재직렬화/네이티브 값으로 대조했습니다.
2. dictionary의 비정렬 다음 항목(바이트 이름), UTF-16 항목별 패딩, 예약/범위 밖/중복 ID, 과대 항목 수와 모든 잘림 prefix를 검사했습니다. 마지막 전체 패딩을 항목별 패딩으로 혼동하지 않습니다. 이름 유닛 길이와 LPSTR 바이트 길이를 서로 바꾸지 않았습니다.
3. 잘못된 PID1 타입/패딩, CP1200 홀수 바이트 길이, u32 최대 선언 길이, 종결/문자열 패딩 오류를 거부했습니다. 명시적 오류 149건 각각 뒤에 정상 문서를 재호출해 회복을 확인했습니다. 빈 속성 slice가 되면 먼저 디렉터리 offset 검사가 거부하는 경우도 오류 원인을 구분했습니다.
4. 추가 검토에서 **코드페이지 부재 시 잘린 LPSTR 전체를 보류하던 누락**을 발견했습니다. 수정 전 WASM에 최대 길이/빈 body를 넣자 `Missing expected exception`으로 재현됐습니다. 공통 바이트 envelope는 코드페이지 없이도 검사하도록 수정해 UnexpectedEnd로 거부합니다. 반면 유효한 envelope의 인코딩은 추정하지 않습니다.
5. 네이티브에서 정상 2항목 dictionary 및 중복 ID 실패의 모든 할당 실패를 주입했습니다. 코드페이지가 마지막에 있어도 값/이름을 올바른 경계로 읽고, 실패한 Iterator를 재호출해 위치·개수가 유지되는지 확인했습니다. 문자열 공통 규칙은 strings, dictionary 구조는 dictionary, PID별 타입은 rules, context 순서는 parser가 소유합니다.

최종 Debug·ReleaseSafe·ReleaseFast `zig build audit --summary all` 모두 통과: 네이티브 131/131, Node 47/47, HWP5 WASM 162,562회 검사(모드별). 기존 CFB 60컨테이너/483스트림/5,496검색 비교·12,000회 변이(trap 0), Zig/JS 포맷·diff 검사도 통과했습니다.

미검사 스트림 180개와 실제 dictionary 의미 보류 45개는 그대로입니다. 코드페이지 없는 관측 dictionary의 의미를 확정하거나, 코드페이지 등록값/문자 변환/이름 동일성을 검증한 단계는 아닙니다. 전체 문서 목표를 완료 처리하지 않으며, 다음에는 나머지 미검사 스트림과 컨트롤 검증을 이어갑니다.

## Scripts 바이너리 경계와 컨테이너 연결 (2026-09-06)

공식 HWP 5.0 revision 1.3의 3.2.9절, 표 8·9 및 로컬 명세 스킬 해당 절을 대조했습니다. `JScriptVersion`의 HIGH/LOW는 각각 unsigned DWORD이며 HWP 파일 버전과 별개입니다. `DefaultJScript`는 u32 길이 네 개와 각 UTF-16LE 문자열, 마지막 DWORD 0xffffffff로 구성됩니다. 문자열 길이는 코드 유닛 수이며 summary와 달리 NUL 종결·4바이트 패딩을 요구하지 않습니다.

- `scripts/version.zig`와 `source.zig`는 입력을 빌리는 무할당 payload 파서입니다. 네 문자열은 각 필드로 노출하며 내부 NUL·고립 서로게이트를 변환하지 않습니다. 남은 입력을 2로 나눈 값과 길이를 비교한 뒤 곱해 wasm32 overflow를 방지합니다. 미지 버전과 종료 표식 뒤 extra도 보존합니다.
- `container/scripts.zig`는 정확한 선택 경로와 kind, `stream.decode` 공통 압축 정책을 연결합니다. 두 스트림의 존재를 각각 구분하며 저장 플래그만으로 존재/부재를 추정하지 않습니다. scalar 보고서만 반환하므로 임시 압축 해제 버퍼를 해제한 뒤에도 유효합니다. 모든 소비 바이트는 기존 전역 한도에서 차감하고 extra는 trailing_bytes로 별도 집계합니다.
- 스크립트를 실행하거나 JS 문법을 검사하지 않습니다. unknown 버전을 특정 엔진 지원으로 승격하지 않으며, binary envelope 검사 성공은 실행 안전성 보증이 아닙니다. Scripts의 다른 이름 스트림도 자동 소비하지 않습니다.

실제 지원 대상 HWP 45개에서 JScriptVersion 45개와 DefaultJScript 45개를 독립 Node zlib/정수 읽기와 비교했습니다. WASM 파싱 필드로 재구성한 결과는 원문과 바이트 단위로 일치했습니다. 합계 압축 해제 크기는 11,476바이트, trailing 0입니다. corpus 미검사 스트림 수는 180에서 90으로 감소했지만 남은 스트림이나 dictionary 의미 보류가 해결된 것은 아닙니다.

### 구현 후 적대적 검증

1. 버전/소스의 모든 잘림 prefix, 네 길이 위치별 0x7fffffff·0x80000000·0xffffffff, 종료 표식의 각 32비트 변조를 검사했습니다. WASM payload 오류 94건 뒤에 정상 입력을 재호출해 회복을 확인했습니다.
2. 네 문자열 각각의 빈 값·1·127·32,768·65,536 유닛을 독립 위치에 배치하고 재구성했습니다. 내부 NUL·고립 서로게이트·비종결 문자열·추가 꼬리·unsigned 버전 비트도 확인했습니다.
3. 압축/비압축 컨테이너 모두에서 정확한 총 바이트 한도 성공과 1바이트 부족 실패를 확인했습니다. 잘못된 kind, 루트로 옮긴 동명 스트림, 미지 이름, 빈 Scripts storage, 대소문자 경로, 잘린 payload와 종료 표식 오류를 검사했습니다. 압축 실패 시 원본 fallback을 하지 않는 경로도 확인했습니다.
4. 네이티브에서 Scripts 정상 완료 및 마지막 소스 실패의 모든 할당 실패 지점을 주입했습니다. 먼저 성공한 문서/버전 decode와 이후 실패 경로에 누수가 없었습니다.
5. SSOT/수명 검토: 파일·압축 정책은 기존 계층을 공유하고, payload 문법은 scripts만 소유합니다. summary 문자열은 종료/패딩 문법이 달라 억지로 합치지 않았습니다. 컨테이너 보고서에 해제된 payload slice를 남기지 않습니다.

최종 Debug·ReleaseSafe·ReleaseFast audit 모두 통과: 모드별 네이티브 135/135, Node 47/47, HWP5 WASM 162,900회 검사. 기존 CFB 60컨테이너/483스트림/5,496검색 비교와 12,000회 변이(trap 0), Zig/JS 포맷·diff 검사도 통과했습니다. 다음 범위는 DocOptions/_LinkDoc 등 남은 선택 스트림입니다. 전체 HWP/HWPX 구현 완료를 의미하지 않습니다.

## DocOptions 조사와 XMLTemplate decoded 문자열 (2026-09-06)

### 명세·표본 근거와 미확정 부분

공식 revision 1.3의 3.2.8절과 로컬 명세 스킬을 확인했습니다. `_LinkDoc`는 연결된 문서 경로를 저장한다고만 명시되어 있고 필드 배치·인코딩·길이·패딩 규칙은 없습니다. 지원 표본 45개는 모두 524바이트(합계 23,580바이트), 첫 16비트 값 0이며 그중 1개만 전체가 0입니다. 그러므로 전체 버퍼를 NUL 종결 문자열로 읽어 빈 경로로 처리하거나, 524바이트를 필수 길이로 규정하지 않았습니다. 경로/기타 바이트의 의미를 확정할 양성 표본과 생산 프로그램의 변경 전후 비교가 더 필요합니다.

rhwp의 `src/parser/hwpx/contract_streams.rs`는 HWPX 변환 시 대응 데이터가 없는 `_LinkDoc`에 `blank2010_assets/doc_options_link_doc.bin` 정적 fallback을 넣습니다. 이는 관측 바이트의 재사용이지 필드 배치 검증 근거가 아니므로 제품에 복사하지 않았습니다. `tests/hwp5/optional-survey.mjs`에 위 corpus 관측값만 회귀 검사로 남겼고, 파일 경로 내용을 출력하지 않습니다. `_LinkDoc`는 여전히 uninspected이며 원본 CFB를 통해 보존됩니다.

XMLTemplate은 공식 3.2.10절 표 10~12와 로컬 명세를 대조했습니다. `_SchemaName`, `Schema`, `Instance`는 각각 DWORD 코드 유닛 수 + WCHAR 배열입니다. 기존 지원 표본 45개에는 XMLTemplate이 없습니다. 추가로 `rg --files reference legacy`에서 찾은 HWP 경로 788개를 조사했고 strict CFB 읽기에 성공한 599개에도 XMLTemplate이 없었습니다. 실패한 189개는 내부 존재 여부를 확인하지 못했으므로 부재로 계산하지 않습니다. 이 조사는 고유 파일/전체 버전 지원 수가 아닙니다.

### 구현과 책임

- `xml_template/string.zig`: decoded 단일 문자열의 value/extra를 빌립니다. Unicode 치환·NUL 제거·패딩 가정을 하지 않습니다.
- `xml_template/template.zig`: decoded 선택 입력 세 개, 전체 바이트 한도와 extra 합계만 조립합니다. 입력 부재(null), 존재하는 빈 문자열(길이 DWORD 0), 잘린 0바이트 스트림을 구분합니다. 전체 길이의 unchecked 덧셈 대신 남은 한도에서 차감합니다.
- `utf16_string.zig`: 기존 u16 read와 신규 u32 read32가 공통 counted reader를 사용합니다. 남은 길이/2 비교 후 곱하며 실패 시 커서를 보존합니다. Scripts도 read32를 재사용합니다. summary 문자열은 종결/패딩 규칙이 달라 이 함수에 합치지 않았습니다.

컨테이너 압축 정책은 표본 없이 추정 연결하지 않았습니다. 따라서 이 단계는 decoded 코어이며 파일 단위 검증에서 XMLTemplate을 소비하지 않습니다. XML 문법·DTD·스키마 검증·외부 엔터티 접근도 하지 않습니다. HWPX ZIP/XML 파서를 구현한 단계가 아닙니다.

### 구현 후 적대적 검증

1. 세 입력 위치 각각 모든 잘림 prefix, 0x7fffffff·0x80000000·0xffffffff 선언 길이를 검사했습니다. 정상 회복 호출을 포함한 WASM 테스트는 성공 77건·거부 121건이며 거부에는 한도 부족도 포함됩니다.
2. 존재/부재 8조합과 전체 부재의 0 한도, 존재하지만 빈 문자열, 각 위치의 1·127·32,768·65,536 코드 유닛, 3바이트 미지 꼬리를 재구성했습니다. 정확한 총 한도는 통과하고 1바이트 부족하면 실패합니다.
3. BOM·내부 NUL·고립 서로게이트, XML처럼 보이는 문자열, 잘못된 XML과 외부 DTD 문자열도 원문으로만 반환했습니다. 테스트 WASM은 import 0으로 외부 엔터티를 불러오지 않습니다. 바이너리 경계 통과를 XML 유효성으로 보고하지 않습니다.
4. 공통 reader의 u16/u32 양쪽에서 과대 길이와 잘못된 커서 실패 후 위치 보존을 네이티브로 확인했습니다. borrowed 슬라이스의 실제 입력 포인터와 value/extra 범위도 확인했습니다.
5. SSOT 재검토 후 Scripts의 독립 u32 문자열 함수를 제거했습니다. 기존 DocInfo/본문/u16 문자열과 실제 Scripts 90개를 포함한 전체 audit를 재실행했습니다. XMLTemplate에는 실제 양성 표본이 없으므로 합성 검증이라고 명시합니다.

최종 Debug·ReleaseSafe·ReleaseFast audit: 모드별 네이티브 138/138, Node 47/47, HWP5 WASM 163,098회 검사 통과. CFB 기존 비교와 12,000회 변이(trap 0), 포맷·diff 검사도 통과했습니다. corpus 미검사 스트림 90개는 감소시키지 않았습니다. `_LinkDoc` 필드 확정, XMLTemplate 실제 컨테이너/문법 검증을 남겨 두고 다른 명세상 미구현 파트의 검증을 계속합니다.

## DocHistory decoded 이력 레코드 (2026-09-06)

공식 revision 1.3의 3.2.11, 4.4.1~4.4.2 및 명세 스킬 해당 절을 대조했습니다. 이력 레코드는 일반 본문 10/10/12비트 헤더가 아니라 BYTE type + UINT payload 바이트 길이입니다. VersionLog 한 항목은 STAG(0x10)로 시작하고 ETAG(0x11)로 끝납니다. 압축·암호화된 이력 스트림을 일반 본문 파서로 직접 읽지 않습니다.

### 실제 자료와 명세 차이

- `rg --files reference legacy`에서 찾은 HWP 788경로 중 strict CFB 성공 599개를 조사했습니다. 그중 `reference/rhwp/samples/basic/treatise sample.hwp`에 DocHistory가 있었고 VersionLog0~3 및 HistoryLastDoc이 존재했습니다. 읽기 실패 189개는 내부 부재로 판정하지 않았습니다.
- 이 표본의 시작 payload는 모두 `000000009f00`입니다. PDF 표 154의 WORD flag→UINT option 순서로 읽으면 flags=0이지만 실제 버전·날짜·작성자·설명·DiffData가 존재합니다. 관측 UINT option→WORD flag 순서에서는 option=0, flags=0x009f로 다섯 presence bit와 맞습니다. 길이/버전 자동 추정 대신 `spec_flag_first`와 `observed_option_first`를 호출자가 명시합니다. 관측을 모든 파일의 규칙으로 일반화하지 않습니다.
- 4항목은 각각 109/6,505/19,885/81,177 decoded 바이트, 합계 107,676바이트이며 각각 7레코드입니다. raw DEFLATE 뒤에는 8바이트 CRC32/ISIZE가 붙습니다. 순수 raw decoder의 TrailingData 실패를 실제로 확인한 후 기존 HWP 압축 꼬리 검사기로 비교했고 CRC 변조를 거부했습니다. 새 복호화 알고리즘이나 보편적인 이력 압축 정책을 확정한 것은 아닙니다.
- 날짜 payload는 표본에서 16바이트지만 공식 문서의 SYSTEMDATE wire 구조가 정의되어 있지 않아 필드를 추측하지 않았습니다. PDF는 LASTDOCDATA에 “기록하지 않음, 필수”라고 적혀 있어 로컬 요약의 “선택”을 채택하지 않았습니다. 별도 HistoryLastDoc 연결을 아직 검사하지 않으므로 항목 검사를 전체 이력 유효성으로 보고하지 않습니다.

### 구현과 적대적 검증

1. `history/record.zig`는 payload/레코드 수 상한과 원자적 Iterator를 소유합니다. 잘림·과대 u32 크기에서 커서/개수는 유지되며, 빈 입력과 0 레코드 한도를 구분합니다. 일반 HWP record 형식을 복제·변형해 섞지 않았습니다.
2. `value.zig`는 공식 태그/다섯 presence bit의 SSOT입니다. start의 선택 배치와 raw flag/option, unsigned 버전 및 extra, WCHAR payload를 빌립니다. 종료 레코드의 비어 있지 않은 payload·홀수 text 크기를 거부합니다. 날짜와 미지 태그는 raw deferred이며 DiffML/HWPML을 XML로 파싱하지 않습니다.
3. `item.zig`는 시작/끝, 중첩 시작, 끝 뒤 레코드 및 다섯 포함 비트 일치를 검사합니다. 중복 metadata는 명세상 금지 여부가 불명확해 duplicate_presence_records로 보고합니다. LOCK·미지 flag/option을 지우지 않으며 LASTDOCDATA 존재는 별도 수치입니다.
4. WASM 합성 검증은 성공 337건·거부 85건입니다. 모든 잘림 prefix, 잘못된 시작/끝, 중첩/끝 뒤 레코드, 포함 비트 불일치, 네 text 태그의 홀수 길이, 정확한 payload/record 한도와 한도 부족, 0x7fffffff·0x80000000·0xffffffff 길이를 검사했습니다. 알려진 8개를 제외한 모든 u8 태그를 미지 payload로 재구성했습니다. 오류 뒤 정상 회복도 검사했습니다.
5. 실제 4항목은 독립 Node zlib/정수 읽기와 WASM typed 필드 재구성으로 107,676바이트 전체가 일치했습니다. spec 배치는 presence mismatch, 명시한 관측 배치는 통과함을 회귀 검사로 남겼습니다. 참조 표본이 없는 환경에서는 해당 실제 검증을 skipped로 명시하며 합성 성공으로 대체하지 않습니다. 외부 코드/표본은 제품 소스로 복사하지 않았습니다.

최종 Debug·ReleaseSafe·ReleaseFast audit 모두 통과: 모드별 네이티브 141/141, Node 47/47, HWP5 WASM 163,539회 검사(참조 표본 있는 현재 환경). CFB 60컨테이너/483스트림/5,496검색 비교, 12,000회 변이(trap 0), 포맷·diff 검사도 통과했습니다. 실제 날짜 4레코드는 의미 보류입니다. 암호화·HistoryLastDoc 연결·이력 재생·파일 단위 자동 연결은 남았으며 기존 45개 corpus의 미검사 스트림 90개를 줄이지 않았습니다.

## DocInfo 호환 문서·레이아웃 호환성 (2026-09-06)

명세 스킬 4.2.14·4.2.15와 공식 revision 1.3의 표 4/13/54~56을 대조했습니다. HWPTAG_BEGIN+14(30)는 level 0, 대상 프로그램 u32(0=현재 한글, 1=한글 2007, 2=MS 워드)입니다. +15(31)는 level 1, 글자/문단/구역/개체/필드 단위 서식 u32 다섯 개입니다. 각 비트 의미는 공개 표에 정의되어 있지 않습니다.

`compatible_document.zig`와 `layout_compatibility.zig`를 별도 payload 모듈로 추가하고 기존 DocInfo reader에서 dispatch·최소 길이·레벨을 검사합니다. 미지 프로그램 값은 non-exhaustive enum으로 원값을 보존하며 다섯 서식 값도 u32 전체를 반환합니다. 최소 길이 이후 extra를 버리지 않고 입력에서 빌립니다. 버전별 필드 추가 근거가 없으므로 임의 버전 gate나 상위 비트 금지를 넣지 않았습니다. document/container는 기존 공통 Iterator를 통해 검사하며 같은 규칙을 복제하지 않습니다.

실제 지원 표본 45개에서 tag 30/31이 각각 34개 발견됐고, 모두 level 0/1과 길이 4/20에 일치했습니다. 대상 프로그램과 서식 값은 이 표본에서 모두 0입니다. typed 필드 재구성은 모든 원본 바이트와 일치했습니다. references의 unknown_records는 138→70으로 감소하며 기존 checked 7,881/invalid 0/deferred 316은 유지됩니다. 미지 대상값·레이아웃 비트 의미·확장 꼬리까지 검증 완료라는 뜻은 아닙니다.

### 구현 후 적대적 검증

1. 모든 최소 길이 미만 prefix를 네이티브/WASM으로 검사했습니다. 일반/extended 레코드 헤더 양쪽에서 잘림을 거부하고 정상 재호출로 회복했습니다.
2. 대상값 0/1/2/3/0x80000000/0xffffffff와 각 DWORD의 32개 단일 비트를 독립 위치에 배치했습니다. 실제 표본의 전부 0이라는 편향을 합성 필드 재구성으로 보완했습니다.
3. 원시 NUL을 포함한 홀수 3바이트 extra를 두 태그에서 보존했습니다. 명세의 최소 크기를 전체 고정 크기나 정렬 제약으로 확대하지 않았습니다.
4. 잘못된 level 0/1/2/1023을 해당 태그별로 검사했습니다. 네이티브에서는 같은 오류를 두 번 호출해 Iterator cursor/count가 유지되는지 확인했습니다. 파일 단위 CFB 검사에서도 두 태그의 짧은 payload/잘못된 레벨이 오류로 전파됩니다.
5. SSOT 검토: payload별 타입/필드는 두 모듈, 태그·레벨은 reader, 참조 통계는 기존 references를 사용합니다. 테스트 재구성은 실제 typed 값을 사용하며 단순 raw 복사를 새 타입 검증으로 대신하지 않습니다. synthetic WASM 성공 254건·거부 54건에 파일 단위 오류 검증을 별도로 추가했습니다.

최종 Debug·ReleaseSafe·ReleaseFast audit 모두 통과: 모드별 네이티브 144/144, Node 47/47, HWP5 WASM 163,855회 검사. CFB 비교·12,000회 변이(trap 0), Zig/JS 포맷·diff 검사도 통과했습니다. 대상별 실제 레이아웃 동작, 레코드 간 호환성 의미/소유권 검증은 남았으며 전체 문서 목표는 계속 진행 중입니다.

## 호환성 레코드 소유권 재검증 및 수정 (2026-09-06)

명세 스킬 4.1절의 레벨 계층 규칙과 공식 표 4의 compatible_document(level 0)/layout_compatibility(level 1)를 다시 확인했습니다. 실제 지원 표본의 layout 34개 모두 가장 가까운 level 0 루트가 tag 30이었습니다. 하지만 기존 구현은 개별 level만 검사했기 때문에 ID_MAPPINGS 루트 그룹 끝에 layout을 추가해도 파일 단위 검사에서 통과했습니다.

수정 전 CFB 합성 사례를 먼저 추가해 `Missing expected exception`으로 재현했습니다(`/tmp/hwpjs-owner-before.log`). `docinfo/compatibility_owner.zig`의 작은 상태 검사기를 document/docinfo 순회에 연결했습니다. 최근 level 0 루트가 compatible_document인 경우에만 layout을 허용하며, 다른 루트가 나오면 그룹을 닫습니다. payload/level 해석은 기존 reader에서만 수행합니다. 이름이나 단순히 과거에 tag 30이 있었는지만 보고 연결하지 않습니다.

구현 후 적대적 검증에서는 부모 없는 layout, 이전 compatible_document 뒤에 미지 level 0 루트가 끼어 있는 layout을 거부했습니다. 반대로 미지 level 1/2 레코드가 끼어 있는 경우에는 원래 그룹이 유지되어 통과했습니다. 네이티브 상태 검사와 실제 CFB 파일 단위 오류·회복을 모두 확인했고, 기존 실제 34개 레이아웃과 전체 corpus가 계속 통과했습니다. 중복/필수 개수나 대상별 의미까지 이번 상태 검사에서 임의 규정하지 않았습니다.

최종 Debug·ReleaseSafe·ReleaseFast audit: 모드별 네이티브 145/145, Node 47/47, HWP5 WASM 163,861회 검사 통과. CFB 기존 비교·12,000회 변이(trap 0), 포맷·diff 검사 통과. 호환성 소유권 누락 한 건을 재현·수정한 것이며 전체 DocInfo 계층/레이아웃 의미 검증 완료를 주장하지 않습니다.

## 머리말·꼬리말 속성과 리스트 영역 (2026-09-06)

명세 스킬 4.3.10.3과 공식 표 140~141을 대조하고 실제 Section 스트림을 조사했습니다. 표의 속성 4바이트와 텍스트 폭/높이/참조 비트 10바이트를 전부 CTRL_HEADER에서 읽으면 실제 배치를 잘못 해석합니다. 지원 표본에서는 `headerfooter.hwp`의 head/foot 두 개, `software.hwp`의 head 한 개가 발견됐습니다. 세 컨트롤 모두 ID 포함 12바이트이며, 직접 자식 LIST_HEADER는 34바이트입니다. 적용 속성은 컨트롤에, 폭/높이/두 참조 바이트는 리스트의 공통 8바이트 이후에 있었습니다.

레거시 요약의 길이에 따른 선택 읽기·누락 0 채우기는 적용하지 않았습니다. `header_footer.zig`는 Properties(attributes+extra)와 Area(width/height/text_references/number_references+extra)를 분리합니다. head/foot ID는 기존 control_rules.id를 사용합니다. Properties 꼬리를 폭/높이라고 추정하지 않습니다. Area는 공통 list view 이후의 10바이트를 요구하며 u32 크기, 원시 참조 비트와 추가 바이트를 보존합니다.

`header_footer_validation.zig`는 Groups.build가 만든 직접 부모별 그룹을 사용하며 최소 하나의 소유 리스트가 있어야 합니다. 공통 리스트 spec6/observed8 선택과 문단 개수 검사는 기존 모듈에서 처리합니다. 노드/정렬된 그룹을 순서대로 순회해 O(nodes+groups)로 연결하며 같은 계층을 다시 만들지 않습니다. document/section에서 검사하고 SectionReport.header_footer에 컨트롤/리스트/문단/예약 페이지값/꼬리 바이트 진단을 남깁니다. 페이지값 3은 의미를 추정하지 않고 진단하며 다른 상위 속성 비트도 지우지 않습니다.

### 구현 후 적대적 검증

1. Properties 0~3바이트, Area 0~9바이트의 모든 prefix를 네이티브와 WASM에서 거부했습니다. 두 공통 리스트 배치에서 길이를 명시적으로 선택하고 정상 재호출 회복을 확인했습니다.
2. u32 최댓값 폭·상위 부호 비트 높이, 참조 비트 0x81/0xfe, 예약 페이지값 3, 상위 속성 비트와 홀수 extra를 재구성했습니다. 미지원 비트/꼬리를 0으로 보정하지 않습니다.
3. 소유 리스트 없는 head와 같은 level에 놓인 고아 리스트를 거부했습니다. head뿐 아니라 foot도 검사했습니다. 리스트 count 0은 존재하는 빈 리스트와 부재를 구분하는 양성 사례로 유지했습니다.
4. 네이티브에서 Tree/Groups 생성의 모든 할당 실패를 주입했습니다. 정상 영역과 잘린 영역의 실패 경로 모두 임시 배열이 해제되었습니다. 검사기 자체는 추가 할당하지 않습니다.
5. 실제 Section 전체를 독립 정수/레벨 해석과 WASM으로 대조했습니다. 컨트롤 3개·리스트 3개·문단 3개·예약값 0개·extra 60바이트가 일치했습니다. 컨트롤 extra는 각 4바이트, 리스트 영역 extra는 각 16바이트이며 그 의미는 보류입니다. 기존 문서/CFB 검증도 새 검사를 호출한 상태로 통과했습니다.

최종 Debug·ReleaseSafe·ReleaseFast audit: 모드별 네이티브 148/148, Node 47/47, HWP5 WASM 163,970회 검사 통과. 기존 CFB 비교·12,000회 변이(trap 0), 포맷·diff 검사도 통과했습니다. 이번 구현은 관측 분리 배치이며 표의 14바이트 인라인 배치를 자동 fallback하지 않습니다. 실제 쪽 선택·폭/높이에 따른 조판·참조 비트의 대상 의미와 확장 꼬리 의미는 남았습니다.

## 머리말·꼬리말 최종 보고서/실제 파일 변이 재검증 (2026-09-06)

후속 검토에서 **전용 파서와 최종 보고서 사이의 테스트 관측 누락**을 찾았습니다. SectionReport.header_footer는 구현되어 있었지만, 테스트용 document-probe의 직렬화에 빠져 있어 기존 문서 단위 비교로는 이 필드의 전달을 확인할 수 없었습니다. 제품 동작 오류로 단정하지 않고 테스트 누락으로 분류했습니다.

document-probe가 각 구역의 header_footer 다섯 수치를 직렬화하도록 보완했습니다. 테스트 전용 구역 행은 144→164바이트이며 제품 공개 ABI 변경은 아닙니다. 독립 필드/레벨 oracle인 headerFooterActual의 결과를 문서 기대값에 포함시켰고, container-probe가 같은 document serializer를 재사용하므로 파일 단위 보고서도 검증됩니다.

`header-footer-document.mjs`는 실제 세 컨트롤의 원본 Section/DocInfo/CFB를 사용합니다. 컨트롤 속성 잘림, 소유 리스트 영역 잘림, 컨트롤 하위 목록 제거를 각각 적용하고 decoded document 및 재작성 CFB 경로로 전달했습니다. 3컨트롤×3변이×2경로=18건을 거부했으며 정상 입력 재호출로 회복을 확인했습니다. 최소 synthetic payload만으로 오류 전파를 주장하지 않습니다. 원본 fixture는 수정하지 않고 메모리에서 변조합니다.

또한 실제 속성의 페이지값을 3으로 바꾸었을 때 예약값 진단이 정확히 1 증가하고, 컨테이너의 document prefix가 decoded 결과와 일치하는지 확인했습니다. 새 필드가 누락되거나 기본 0으로 전달되는 경우를 테스트가 관측할 수 있게 했습니다. 기존 실제 47개 구역의 나머지 보고서 필드도 함께 대조합니다.

최종 Debug·ReleaseSafe·ReleaseFast audit: 모드별 네이티브 148/148, Node 47/47, HWP5 WASM 164,053회 검사 통과. 기존 CFB 비교·12,000회 변이(trap 0), 포맷·diff 검사도 통과했습니다. 이번 단계는 문서/파일 연결 검증을 강화한 것으로 실제 페이지 배치나 남은 원시 비트 의미를 구현 완료로 바꾸지 않습니다.

## 자동 번호·새 번호 지정 저장 필드 (2026-09-06)

명세 스킬 4.3.10.5·4.3.10.6과 공식 표 142~144를 대조했습니다. 실제 ID는 기존 공식 ID 표/SSOT의 atno/nwno이며 로컬 요약의 autn/newn을 별칭으로 추가하지 않았습니다. Auto는 속성 u32, 번호 u16, 사용자 기호/앞/뒤 장식 WCHAR 각 2바이트로 12바이트입니다. Restart는 표의 u32+u16 합계가 6바이트인데 전체 길이는 8바이트로 적혀 있습니다. 정의되지 않은 두 바이트를 번호 상위 비트나 필수 패딩으로 추정하지 않고 extra로 보존합니다.

`number_control.zig`는 공통 Header(원시 속성/번호)와 Auto/Restart를 분리합니다. 공통 prefix 읽기는 실패 시 커서를 보존합니다. 번호 종류 bit 0~3, 자동 번호 모양 bit 4~11, superscript bit 12는 원시 view이며 번호 계산이나 표시 문자열 생성은 하지 않습니다. WCHAR의 NUL·고립 서로게이트·BOM도 u16 원값으로 보존합니다. `number_control_validation.zig`는 구역 Tree를 순회해 automatic/restarted/reserved_kinds/extra_bytes를 보고합니다. 기존 control_links/타입 검사와 역할이 다르며 SectionReport.number_controls와 테스트용 document/container 직렬화에도 연결했습니다.

실제 지원 corpus에서는 자동 번호 32개, 새 번호 지정 0개를 찾았습니다. 자동 번호는 모두 ID 포함 16바이트로 표 142와 일치했고, typed 필드 재구성이 원본 바이트와 일치했습니다. 새 번호 지정의 길이 정책은 명세 필드와 합성 입력으로 검증한 범위이며 실제 양성 검증이라고 주장하지 않습니다.

### 구현 후 적대적 검증

1. Auto 0~11바이트와 Restart 0~5바이트의 모든 잘림 prefix를 거부했습니다. 실패 후 정상 입력을 다시 호출해 회복을 확인했습니다.
2. 각 payload의 모든 개별 비트를 독립적으로 켜고 재구성했습니다. 네이티브에서는 속성 32개 비트의 종류/모양/superscript 위치도 각각 대조했습니다. u16 최대 번호와 고립 서로게이트/빈 장식 코드 유닛도 확인했습니다.
3. 0~3바이트 미지 꼬리를 보존하고 잘못된 요약 ID autn/newn을 해당 타입으로 해석하지 않는지 검사했습니다. WASM 합성 성공 170건·거부 20건입니다.
4. 실제 자동 번호 32개를 각각 한 바이트 짧게 다시 framing해 decoded document 검사에 넣었고 UnexpectedEnd로 거부했습니다. 같은 문서의 원시 번호 종류만 예약값으로 바꿨을 때 최종 구역의 reserved_kinds가 정확히 1 증가함을 확인했습니다.
5. SSOT 재검토: 공통 prefix는 한 곳, ID는 기존 control_rules, payload와 구역 집계는 분리했습니다. document-probe에도 새 진단을 포함해 전용 파서만 통과하고 최종 보고서가 관측되지 않는 누락을 피했습니다. 테스트 전용 구역 행은 180바이트이며 제품 ABI 변경은 아닙니다.

최종 Debug·ReleaseSafe·ReleaseFast audit: 모드별 네이티브 151/151, Node 47/47, HWP5 WASM 164,371회 검사 통과. CFB 기존 비교·12,000회 변이(trap 0), 포맷·diff 검사도 통과했습니다. 번호 순서 재계산, 번호 모양의 전체 의미, 각주/표/그림 대상 연결과 Restart 실제 표본 검증은 남았습니다.

## 문서 보고서 기대 형식 SSOT와 다중 구역 검증 (2026-09-06)

보고서 확장 후 테스트를 검토하니 문서 길이 비교, 머리말 진단 위치, 번호 진단 위치에 같은 prefix/stride 숫자가 반복되어 있었습니다. 테스트 전용 `document-report-wire.mjs`에 필드 그룹별 word 수와 offset 계산을 모았습니다. 제품 Zig serializer에서 생성하지 않으므로 서로 같은 실수를 공유하는 자동 생성 oracle로 바꾸지 않았습니다. 그룹 길이·필드 위치·정수 인덱스 경계를 별도로 고정 대조하고 기존 각 payload의 독립 byte oracle도 유지합니다.

`document-report-edges.mjs`는 실제 문서 9개의 구역을 바탕으로, 첫 구역은 정상·둘째 구역은 머리말 또는 자동 번호 예약값 진단이 1 증가하도록 서로 다른 입력을 만들었습니다. DocInfo 구역 수를 2로 맞춘 뒤 입력 순서를 역전해 전달했습니다. 반환 구역은 인덱스 0/1 순서이며 정상/변이 진단이 정확히 각 구역에 남는지 전체 구역 행 바이트를 비교했습니다. 같은 내용의 구역을 단순 복제해 순서 오류를 가리는 테스트가 아닙니다. 원본 fixture는 수정하지 않았습니다.

추가 적대적 검사로 음수·소수·NaN·Infinity·범위 밖 인덱스, 미지 그룹/상속 속성 이름, 범위 밖 필드 번호를 거부했습니다. 머리말/번호 실제 문서 변이 테스트도 같은 offset 함수를 사용하도록 연결했습니다. 신규 파싱 지원으로 계상하지 않고 문서 단위 검증 기반의 SSOT/위치 편향 보완으로 기록합니다.

최종 Debug·ReleaseSafe·ReleaseFast audit: 모드별 네이티브 151/151, Node 47/47, HWP5 WASM 164,398회 검사 통과. 기존 CFB 비교·12,000회 변이(trap 0), 포맷·diff 검사도 통과했습니다. 전체 문서 목표 및 기존 미검증 의미 범위는 유지합니다.

## 쪽 번호 위치 필드와 관측 차이 (2026-09-06)

명세 스킬 4.3.10.9와 공식 표 147~148 및 컨트롤 ID 표를 대조했습니다. ID는 pgnp이며 로컬 요약의 pgno를 사용하지 않습니다. 속성 u32와 사용자 기호/앞/뒤 장식/마지막 WCHAR 네 개로 12바이트입니다. 모양 bit 0~7, 위치 bit 8~11을 원시 view로 제공하고 11~15의 예약 위치를 진단합니다.

실제 지원 표본에서 pgnp 4개를 찾았습니다. 모두 위치 5와 ID 포함 16바이트였으나, 표 147에서 항상 '-'라고 적힌 마지막 WCHAR는 세 개만 '-'이고 하나는 0이었습니다. `page_number.zig`는 값과 extra를 보존하고 `page_number_validation.zig`가 nonstandard_dash를 보고합니다. 0을 지우거나 '-'로 고치거나 파일 전체를 손상으로 단정하지 않습니다. 실제 쪽 번호 조판을 검증하는 단계는 아닙니다.

구역 검사에 연결하고 SectionReport.page_number에 controls/reserved_positions/nonstandard_dash/extra_bytes를 저장합니다. 테스트용 document/container 직렬화와 기대 형식 SSOT도 함께 확장했습니다. 새 구역 테스트 행은 196바이트이며 기존 필드 offset은 공유 정의에서 계산합니다.

### 구현 후 적대적 검증

1. 0~11바이트의 모든 잘림 prefix를 네이티브/WASM에서 거부하고 정상 재호출을 확인했습니다. payload 96개 비트를 독립적으로 켜 typed 재구성을 검사했습니다.
2. 원시 속성의 32비트 각각에서 모양/위치 추출 범위를 대조했습니다. NUL·고립 서로게이트·BOM·0xffff 문자와 0~3바이트 추가 꼬리를 보존합니다. 합성 WASM 성공 116건·거부 12건입니다.
3. 실제 4개 컨트롤의 원시 필드는 독립 정수 해석 및 typed 재구성과 일치했습니다. document/container의 구역 보고서도 독립 집계한 수치와 대조합니다.
4. 실제 각 컨트롤을 한 바이트 짧게 다시 framing해 문서 검사에서 거부했습니다. 위치를 예약값으로 바꾸면 해당 구역 진단이 1 증가합니다. 마지막 문자 '-'를 0으로 또는 0을 '-'로 바꾸면 비표준 진단이 각각 정확히 +1/-1 변했습니다.
5. SSOT는 기존 control_rules ID, payload 모듈, 구역 집계 모듈, 테스트 기대 형식으로 분리했습니다. 모양 값의 전체 의미·페이지 안/바깥 배치·표시 문자열 생성은 구현했다고 주장하지 않습니다.

최종 Debug·ReleaseSafe·ReleaseFast audit: 모드별 네이티브 153/153, Node 47/47, HWP5 WASM 164,546회 검사 통과. CFB 기존 비교·12,000회 변이(trap 0), 포맷·diff 검사도 통과했습니다. 실제 페이지 조판 및 장식 문자의 표시 의미는 후속 범위입니다.

## 찾아보기 표식 키워드 경계 (2026-09-06)

명세 스킬 4.3.10.10과 공식 표 149를 대조했습니다. 두 u16 코드 유닛 길이와 UTF-16 배열, 마지막 u16 dummy로 구성되며 최소 6바이트입니다. ID는 기존 공식 control_rules의 idxm이고 로컬 요약의 bkmk를 별칭으로 해석하지 않습니다. 현재 지원 corpus에서는 해당 컨트롤을 찾지 못했으므로 실제 양성 검증이라고 주장하지 않습니다.

`index_mark.zig`는 공통 utf16_string.read로 두 키워드를 빌리고 dummy와 extra를 보존합니다. 키워드 대소문자/정렬/Unicode 정규화·NUL 제거를 하지 않습니다. `index_mark_validation.zig`는 controls/first_units/second_units/extra_bytes를 집계해 SectionReport.index_marks로 연결합니다. 문서/컨테이너 보고서 직렬화와 독립 기대 형식도 함께 확장했습니다. 테스트 전용 구역 행은 212바이트입니다.

### 구현 후 적대적 검증

1. 첫/둘째 키워드 및 마지막 dummy를 자르는 모든 prefix와, 입력이 부족한 두 위치의 최대 길이 선언을 거부했습니다. 오류 뒤 정상 입력을 재호출했습니다.
2. 두 위치를 각각 독립적으로 0/1/127/32,768/65,535 코드 유닛으로 채우고, 두 키워드 모두 최대 길이인 입력도 검사했습니다. 큰 payload는 extended record framing을 통해 실제 WASM Tree/집계 경로로 전달했습니다.
3. NUL·고립 서로게이트·BOM, dummy 0/1/0x8000/0xffff, 홀수 extra를 typed 필드로 재구성했습니다. dummy의 허용값은 명세에 정의되지 않아 0 조건을 발명하지 않았습니다.
4. 한 구역 내 여러 idxm의 집계와 미지 bkmk ID 무분류를 확인했습니다. 합성 WASM 성공 31건·거부 14건입니다. 네이티브에서는 Tree 할당 실패를 정상/짧은 dummy 경로에 모두 주입해 정리 여부를 확인했습니다.
5. SSOT 검토: 문자열 경계는 기존 리더, ID는 기존 control_rules, payload와 구역 집계는 별도 모듈입니다. 기존 실제 47개 구역의 0개 결과와 나머지 진단을 문서/파일 단위에서 함께 비교했습니다. 0개 결과를 실제 양성 지원 증명으로 계상하지 않습니다.

최종 Debug·ReleaseSafe·ReleaseFast audit: 모드별 네이티브 156/156, Node 47/47, HWP5 WASM 164,639회 검사 통과. CFB 기존 비교·12,000회 변이(trap 0), 포맷·diff 검사도 통과했습니다. 실제 찾아보기 컨트롤 표본, 키워드 정렬/병합과 페이지 연결·찾아보기 생성은 남았습니다.

## 찾아보기 실제 표본 확보 및 문서/CFB 대조 (2026-09-06)

이전 45개 지원 corpus에는 idxm이 없었지만 레퍼런스 범위를 추가 조사해 `reference/rhwp/samples/HWP5-nopassword-123456.hwp`에서 3개를 찾았습니다. 조사에서 CFB 읽기 성공은 599경로, 본문 검사 구역은 719개였고 보안 플래그로 제외한 파일은 8개였습니다. 전체 처리 실패 192건에는 CFB 실패와 이후 본문 decode/framing 실패가 섞여 있으므로 내부 부재로 판정하지 않습니다.

세 표식의 첫 키워드는 3/3/5 UTF-16 단위(합계 11), 둘째 키워드는 모두 비어 있고 dummy=0입니다. 각 payload에는 명세 필드 이후 2바이트가 있어 extra 합계는 6바이트입니다. 이를 필수 padding이나 새 필드로 추정하지 않았습니다. `index-mark-reference.mjs`는 이 파일의 압축·원시 필드·본문 typed 재구성·decoded document·CFB container를 독립 helper들과 비교합니다. 외부 표본을 제품에 복사하지 않으며 표본이 없는 환경에서는 skipped를 명시합니다.

추가 비교에서 기존 `objectActual` 테스트의 과도한 고정 길이 가정을 발견했습니다. 코어는 이미 개체 설명 뒤 extra를 보존하는데 actual oracle는 `n === 46 + description_units*2`로 확장 꼬리를 거부했습니다. 새 표본의 48바이트 payload에서 기대 46과 달라 재현됐습니다. 설명 끝이 전체 payload 이내인지 검사하도록 수정하고, 확장 꼬리 양성/설명 자체 잘림 음성을 세 개체 ID에 회귀 검사로 추가했습니다. 실제 본문 전체를 mode 8 typed 재구성으로도 대조하므로 단순히 오류를 숨기기 위한 원문 복사 비교로 대체하지 않았습니다.

적대적 검증에서는 세 표식 각각에서 extra 2바이트와 dummy 1바이트를 제거하고 framing을 재작성했습니다. 전용 구역 검사·decoded document·재작성 CFB의 3경로 모두 UnexpectedEnd로 거부했습니다(9건). 반대로 extra만 2바이트 제거하면 통과하고 extra 집계만 6→4로 줄어듭니다. 정상 입력 재호출도 확인했습니다. 원본 파일은 수정하지 않았습니다.

이 추가 문서는 구역 1개, DocInfo+본문 1,965레코드, 헤더 포함 decoded document 132,184바이트의 대조를 통과했습니다. BinData 3개/179,494바이트도 기존 독립 컨테이너 oracle로 비교했습니다. 미검사 스트림 2개와 dictionary 등 기존 의미 보류는 그대로이며, 전체 문서의 모든 의미가 검증됐다는 주장은 아닙니다.

최종 Debug·ReleaseSafe·ReleaseFast audit: 모드별 네이티브 156/156, Node 47/47, HWP5 WASM 164,684회 검사 통과(현재 참조 표본 존재 환경). CFB 기존 비교·12,000회 변이(trap 0), 포맷·diff 검사도 통과했습니다. 실제 idxm 양성 필드 검증은 확보했지만, 두 번째 키워드의 실제 양성 사례·키워드 정렬/페이지 연결·찾아보기 생성은 여전히 남았습니다.

## 감추기·홀짝 조정 속성 (2026-09-06)

명세 스킬 4.3.10.7~8과 공식 표 145~146을 대조했습니다. 감추기(pghd)는 공식 표가 UINT를 2바이트로 기재하지만 관측 속성은 4바이트입니다. `page_visibility.HideLayout`으로 spec16/observed32를 분리하고 문서 옵션 hide_layout은 observed32를 기본값으로 사용합니다. 버전이나 짧은 입력으로 자동 fallback하지 않습니다. 홀짝 조정은 기존 control_rules의 pgct를 사용하고 로컬 요약의 pgad를 별칭으로 허용하지 않습니다.

`page_visibility.zig`는 여섯 감추기 비트·홀짝 하위 2비트·원시 속성·extra를 해석합니다. `page_visibility_validation.zig`는 hide/parity/reserved_parity/unknown_hide_bits/extra_bytes를 집계하며 document.section이 이를 연결합니다. 예약값 3과 미지 감추기 비트를 원문과 진단으로 남기고 자동 보정하지 않습니다. 테스트 기대 형식 SSOT에 다섯 필드를 추가했으며 구역 행은 232바이트입니다.

### 구현 후 적대적 검증

1. 두 감추기 폭과 홀짝 속성의 모든 짧은 prefix를 거부하고 정상 재호출을 확인했습니다. 2바이트 감추기를 observed32로 읽으면 실패합니다.
2. 속성의 각 비트를 독립적으로 켜 마스크와 원시 값 재구성을 확인했습니다. 꼬리 0~3바이트를 보존하고 미지 pgad는 분류하지 않습니다. 합성 WASM 성공 142건·거부 15건입니다.
3. `reference/rhwp/saved/pr360-edward.hwp`의 Section0에서 실제 pghd 2개를 확인했습니다. 4바이트 속성의 집계는 [2,0,0,0,0]이며 Node와 Zig의 압축 해제 결과 및 전용 검사 typed 재구성을 비교했습니다. 두 레코드를 각각 한 바이트 줄여 framing을 다시 작성하면 UnexpectedEnd로 거부합니다. 원본 파일은 수정하지 않았으며 표본 부재 환경은 skipped로 보고합니다.
4. 기존 corpus의 문서/CFB 보고서 대조와 서로 다른 두 구역의 순서 검증을 새 행 폭으로 실행했습니다. 기존 corpus에는 두 컨트롤이 없어 이 경로의 0개 결과를 실제 양성 검증으로 세지 않습니다. 추가 참조 표본의 양성/잘림 검사는 전용 구역 검사까지이며 전체 문서·CFB 의미 검증으로 확대해 주장하지 않습니다.
5. SSOT 검토: ID는 control_rules, 바이트 경계는 Reader, payload와 구역 집계는 각각 단일 모듈이 소유합니다. 테스트 기대 형식은 제품 serializer에서 생성하지 않고 독립 대조합니다.

홀짝 조정 실제 양성 표본과 감추기 spec16 실제 표본은 아직 확보하지 못했습니다. 페이지 숨김 적용·홀짝 페이지 삽입·조판은 미구현이며, 본 변경은 속성 해석과 진단에 한정됩니다.

최종 Debug·ReleaseSafe·ReleaseFast audit: 모드별 네이티브 158/158, Node 47/47, HWP5 WASM 164,896회 검사 통과(참조 표본 존재 환경). CFB 12,000회 변이에서 trap 0이며 포맷·diff 검사도 통과했습니다.

## 책갈피 이름과 ControlData 소유 관계 (2026-09-06)

명세 스킬 4.3.10.11/4.3.8과 공식 표 127 및 책갈피 설명을 대조했습니다. 공식 ID는 bokm이며 로컬 통합 요약의 bkmk가 아닙니다. 명세는 이름을 HWPTAG_CTRL_DATA의 ParameterSet에 저장한다고 설명하지만 Set/항목 ID는 정의하지 않습니다. 레퍼런스와 fixture 조사에서 읽은 본문 710구역에서 책갈피 136건을 찾았습니다. 파일 헤더/보안 필터를 통과한 경로는 581개이며 처리 실패 189건은 CFB 및 이후 decode/framing 실패가 섞인 값이므로 부재로 판정하지 않습니다.

관측 이름 구조는 Set 0x021b의 직접 항목 0x4000, 타입 1의 counted UTF-16입니다. 이 구조는 기존 셀 이름과 같아 `parameters/field_name.zig`로 추출 규칙을 공통화했습니다. cell_field는 기존 오류 이름을 유지하는 어댑터입니다. `body/bookmark.zig`는 직접 부모가 bokm인 태그 87만 연결하며, 앞 컨트롤/가장 가까운 조상/CTRL_HEADER 자체에서 이름을 추정하지 않습니다. rhwp 소스를 참고 조사했지만 고정 offset 이름 읽기나 헤더 문자열 fallback을 도입하지 않았습니다.

`sources.inspectBodyDetailed`가 ParameterSet을 한 번 파싱한 결과로 기존 바이너리 참조·꼬리 검사와 책갈피 이름 검사를 수행합니다. SectionReport.bookmarks의 여덟 수치는 controls/control_data/names/name_units/missing_names/unknown_sets/unsupported/header_extra_bytes입니다. missing_names는 알려진 Set 내부의 이름 항목 부재이며 CTRL_DATA 자체의 부재와 다릅니다. 후자는 controls와 control_data로 관측할 수 있으나 여러 CTRL_DATA가 가능하므로 차이를 정확한 누락 개수로 단정하지 않습니다. 미지 타입은 전체 원문 보류 정책을 유지합니다. 테스트 구역 행은 264바이트입니다.

### 구현 후 적대적 검증

1. 이름 부재와 빈 문자열을 구분하고 NUL·고립 서로게이트·BOM 및 extra를 보존했습니다. 모든 짧은 prefix와 32,768/65,535 코드 유닛 이름의 마지막 바이트 잘림을 거부하고 정상 재호출했습니다.
2. 다른 항목이 먼저 오는 경우와 중첩된 같은 ID를 검사했습니다. 루트 직접 항목만 이름으로 읽으며 잘못된 이름 타입과 중복 이름 항목은 거부합니다. 미지 Set/타입을 성공한 이름으로 세지 않습니다.
3. 형제 CTRL_DATA, 잘못된 bkmk 별칭, 다른 컨트롤 밑의 후손은 책갈피 이름으로 연결하지 않습니다. 여러 책갈피·누락된 CTRL_DATA·이름 없는 Set을 각각 검사합니다.
4. `reference/rhwp/samples/HWP5-nopassword-123456.hwp`의 실제 책갈피 11개, 이름 합계 122 UTF-16 단위를 독립 계층/ParameterSet oracle와 비교하고 decoded document 및 CFB container의 새 구역 보고서도 대조했습니다. 각 실제 이름의 타입을 정수로 바꿔 세 검사 경로에서 모두 InvalidNamedFieldType으로 거부했습니다(33건). 원본 파일은 수정하지 않았으며 표본이 없는 환경은 skipped를 보고합니다.
5. 네이티브에서 정상/잘린 ParameterSet의 모든 할당 실패와 Tree+공통 조립의 할당 실패를 주입했습니다. SSOT는 ID/control_rules, ParameterSet/parser, 이름/field_name, 소유 관계/bookmark, 조립/sources, 독립 wire 기대 정의로 구분합니다. 기존 셀 테스트도 그대로 통과해야 합니다.

이름의 전역 유일성·문서 내 이동 위치·책갈피 편집/저장 의미는 미구현입니다. 관측 Set ID를 공식 명세가 보장한 값으로 표현하지 않으며, 조사된 136건 모두를 전체 문서 검증했다고 주장하지 않습니다.

최종 Debug·ReleaseSafe·ReleaseFast audit: 모드별 네이티브 160/160, Node 47/47, HWP5 WASM 165,076회 검사 통과(참조 표본 존재 환경). 책갈피 합성 성공 39건·거부 23건이며 CFB 12,000회 변이에서 trap 0입니다. 포맷·diff 검사도 통과했습니다.

## 글자 겹침의 명시적 배치와 글자 모양 참조 (2026-09-06)

명세 스킬 4.3.10.12와 공식 표 150/컨트롤 ID 표를 대조했습니다. 공식 ID는 tcps이며 로컬 요약의 over를 사용하지 않습니다. 표 150은 ID 포함 10바이트+문자열+글자 모양 배열입니다. control_header가 ID를 이미 소비하므로 속성 파서는 최소 6바이트부터 읽으며 ID를 두 번 읽지 않습니다.

레퍼런스/fixture 경로 조사에서 tcps 52건을 찾았습니다. 5.0.2.4(9건)/5.0.2.5(16건)는 counted 문자열 뒤 필드가 없었고, 관측 5.0.3.0 이상 나머지 27건은 문자열 뒤 44바이트(속성 4바이트+10개의 u32)를 가졌습니다. 파일 처리 실패 189건은 CFB와 이후 decode/framing 실패가 섞인 값으로 부재 판정이 아닙니다. 이 표본만으로 정확한 전환 버전을 증명할 수 없고 명세에도 명시되지 않아 `Layout.text_only/full`을 호출자가 선택합니다. 문서 Options.overlap_layout 기본값은 full이며 짧은 full을 text_only로 자동 재해석하지 않습니다.

`char_overlap.zig`는 공통 utf16_string과 record_array를 재사용하여 원본 문자열, optional Attributes, u8 테두리/i8 내부 크기/u8 펼침/글자 모양 ID 배열과 extra를 보존합니다. text_only의 속성은 null이며 0으로 채우지 않습니다. `char_overlap_validation.zig`는 reference_rules의 inherited_char_shape를 사용합니다. 실제 배열에 반복되는 0xffffffff는 명시 참조와 별도 집계하며 일반 ID는 0-based 글자 모양 수와 대조합니다. 테두리/펼침 전체 값의 의미와 표시 결과는 검증하지 않습니다.

SectionReport.char_overlap은 controls/text_units/shape_refs/inherited_refs/text_only/extra_bytes 여섯 값을 보고합니다. 기존 구역 검사 및 독립 기대 wire 정의에 연결했고 구역 행은 288바이트입니다.

### 구현 후 적대적 검증

1. 문자열·속성·배열 모든 짧은 prefix를 거부하고 정상 재호출했습니다. signed 크기 -128/-1/0/127, 문자열 0/1/32,768/65,535 UTF-16 단위와 배열 0/1/254/255개를 검사했습니다.
2. 최대 배열과 0개 리소스에서 상속 sentinel을 허용하되, count와 같은 ID 및 범위를 벗어난 일반 ID는 거부합니다. 0xfffffffe도 충분한 리소스 수를 명시하면 일반 ID로 보존됩니다.
3. NUL·고립 서로게이트·BOM·비표준 속성·홀수 꼬리를 typed 재구성으로 대조했습니다. text_only와 full을 동일 입력에서 명시적으로 선택하고 자동 fallback이 없음을 확인했습니다. 네이티브 Tree의 정상/잘못된 참조 경로에 할당 실패를 주입했습니다.
4. `aift.hwp` Section0의 신형 tcps 1개는 문자 1단위·명시 참조 1개·상속 sentinel 9개입니다. `basic/issue2007_nested_cell_pagination_42065.hwp` Section0의 구형 8개는 문자 합계 15단위이며 속성은 부재입니다. Node/Zig 압축 해제 및 전용 WASM typed 재구성을 대조했습니다. 각각 마지막 바이트 잘림 1/8건과 신형의 범위 밖 참조 1건을 거부했습니다. 외부 표본은 복사/수정하지 않았고 부재 환경은 skipped로 보고합니다.
5. 전체 문서 확인에서 aift의 모든 구역을 전달하도록 테스트를 보완했습니다. 이어 Section2의 문단 offset 401136/401473에서 확장 토큰 ID %%me(0x25256d65)와 헤더 %unk(0x25756e6b)의 불일치를 독립 바이트 조사로 확인했습니다. 전용 연결 검사와 decoded document 모두 ControlIdMismatch로 거부하는 상태를 명시적 pending으로 기록했습니다. 이 오류를 삼켜 전체 문서 성공으로 세거나 ID를 보정하지 않습니다. 구형 참조 파일의 전체 문서 검증도 이번 양성 검증 범위가 아닙니다.

SSOT는 payload/참조 집계/조립을 분리하고 기존 문자열·배열·ID·참조 규칙을 재사용합니다. 신구 배치의 정확한 전환 버전, aift의 컨트롤 ID 불일치가 허용 가능한 저장 관행인지 여부, 실제 글자 겹침 조판은 남았습니다. 전체 corpus 성공과 추가 참조 파일의 pending을 구분해야 합니다.

최종 Debug·ReleaseSafe·ReleaseFast audit: 모드별 네이티브 162/162, Node 47/47, HWP5 WASM 165,261회 검사 통과(참조 표본 존재 환경). 합성 성공 48건·거부 28건이며 CFB 12,000회 변이에서 trap 0입니다. 포맷·diff 검사도 통과했습니다. 이 수치는 위의 명시적 ControlIdMismatch 거부 확인도 포함하며, aift 전체 문서의 성공을 뜻하지 않습니다.

## 관측 메모의 이중 ID 연결 및 aift 문서 검증 (2026-09-06)

앞 단계의 ControlIdMismatch를 추가 조사했습니다. 공식 표 128은 %unk와 %%me를 각각 정의하지만 서로 다른 ID의 허용 관계는 설명하지 않습니다. aift Section2 문단 401136/401473의 텍스트는 code 3 + %%me이고 헤더 offset 401288/401633은 %unk입니다. 두 헤더의 공통 필드는 attributes=0x8001, other=0, command 41 UTF-16 단위의 MEMO/ 표식, instance ID, extra 4바이트입니다.

rhwp 레퍼런스 HEAD `e8800c8def63449808a4092798442652ed460552`의 serializer/control.rs는 Memo의 헤더를 명시적으로 FIELD_UNKNOWN으로 기록하고 serializer/body_text.rs는 FIELD_MEMO 토큰을 사용합니다. parser/tags.rs에도 MEMO/ 기반 관측 저장 형태와 변환 이력이 설명되어 있습니다. 따라서 이번 현상은 단순 바이트 손상으로만 단정할 수 없는 저장 형태입니다. 레퍼런스의 command 기반 의미 추정 전체나 잘린 payload를 기본값으로 치환하는 처리는 가져오지 않았습니다.

명세 스킬 4.3.10.15와 공식 표 152~153을 바탕으로 `field_start.zig`에 ID 제외 11바이트+command의 bounded 공통 파서를 추가했습니다. attributes/other/command/instance_id/extra를 보존하고 instance ID가 없으면 실패합니다. `control_identity.zig`는 정확한 동일 ID 또는 code 3·%%me 토큰·%unk 헤더·UTF-16 MEMO/ 표식이 모두 맞는 관측 메모만 구분합니다. 방향을 뒤집거나 다른 필드/다른 code/소문자·유사 문자열로 확장하지 않습니다. 이 표식 검사는 메모 command 전체 문법·번호·작성자·명령 실행 의미를 검증하지 않습니다.

Link.id는 원본 토큰 ID이고 header_id도 원본 그대로 저장합니다. identity=exact/observed_memo를 별도로 보존하며 ID를 덮어쓰지 않습니다. `Links.observedCount`가 구역 observed_field_links를 집계합니다. 기존 테스트 모드 13의 여섯 필드 형식은 명시적으로 유지하고 새 모드 38은 두 필드를 더 내보내 원본 ID와 관측 구분을 대조합니다. 구역 기대 wire SSOT는 292바이트입니다.

### 구현 후 적대적 검증

1. 필드 command와 instance ID의 모든 짧은 prefix를 거부했습니다. u32 속성/instance ID, u8 기타 속성, extra를 보존합니다. 정확히 같은 ID의 기존 연결은 새 추정을 적용하지 않습니다.
2. 반대 방향, 다른 헤더·토큰, 다른 제어코드, MEMO 표식 누락/소문자/전각/중간 NUL은 거부합니다. 최대 65,535 UTF-16 단위 command와 고립 서로게이트·NUL·BOM·꼬리는 원문으로 유지합니다. 합성 WASM 성공 39건·거부 32건입니다.
3. 네이티브에서 필드 원본과 두 ID를 대조하고 Tree/Links 할당 실패를 모두 주입했습니다. 기존 다른 ID·제어코드 불일치 테스트도 계속 거부해야 합니다. 관측 연결을 임의 %unk wildcard나 명령 실행으로 확장하지 않았습니다.
4. aift 3개 구역, 헤더 포함 decoded document 988,925바이트/28,503레코드를 독립 구역 oracle 및 정렬/역순 입력으로 대조했습니다. 원본 Section2의 관측 연결 수는 정확히 2입니다. CFB 검사도 통과했고 BinData 21개/38,376,784바이트를 기존 독립 container oracle로 비교했습니다. 미검사 스트림 2개 등 기존 보류 범위는 그대로입니다.
5. 두 실제 헤더에서 첫 command 문자를 X로 바꾸거나, extra 4바이트와 필수 instance ID 1바이트를 제거해 framing을 재작성했습니다. 전용 연결·decoded document·재작성 CFB 세 경로에서 각각 ControlIdMismatch/UnexpectedEnd로 거부했습니다(12건). 정상 재호출의 보고서가 원본과 같은지도 확인했습니다. 원본 파일은 수정하지 않았고 외부 표본 부재는 skipped입니다.

앞 단계의 aift ControlIdMismatch pending은 이 관측 계약과 검증으로 해소됐습니다. 단, 이를 모든 %unk/다른 필드 불일치에 대한 허용 규칙이나 메모의 전체 의미 검증으로 일반화하지 않습니다. 모든 필드의 속성 검사 연결, 명령 종류별 해석, 전역 instance ID 의미와 메모 편집/조판은 남았습니다.

최종 Debug·ReleaseSafe·ReleaseFast audit: 모드별 네이티브 165/165, Node 47/47, HWP5 WASM 165,425회 검사 통과(참조 표본 존재 환경). CFB 12,000회 변이에서 trap 0이며 포맷·diff 검사도 통과했습니다.

## 알려진 필드 공통 속성의 전체 구역 연결 (2026-09-06)

명세 스킬 4.3.10.15와 이전에 대조한 공식 표 128/152/153을 기준으로 필드 공통 검사를 확장했습니다. `field_start.supports`는 control_rules의 code 3 목록만 사용하며 현재 34개 ID를 포함합니다. '%' 접두사나 로컬 요약의 '%%%%'를 wildcard로 해석하지 않습니다. 알 수 없는 ID는 기존 raw/deferred 정책에 남습니다.

기존 `field_start.Properties.parse`를 재사용해 attributes/other/counted UTF-16 command/instance_id/extra를 해석합니다. editableReadOnly는 bit 0, updateKind는 bit 11~14, modified는 bit 15이고 unknownBits는 이 범위 밖 원값입니다. updateKind의 모든 조합을 실제 하이퍼링크 상태로 판정하거나 미지 비트를 0으로 정규화하지 않습니다. `field_validation.zig`는 controls/command_units/editable_readonly/modified/unknown_bits/extra_bytes를 집계하며 section이 이를 연결합니다. 테스트용 구역 기대 wire SSOT는 316바이트입니다.

### 구현 후 적대적 검증

1. 공식 ID 34종 각각에 문자열과 필수 instance ID를 자르는 모든 짧은 prefix를 주입하고 정상 재호출했습니다. 합성 WASM 성공 652건·거부 578건입니다. 최대 65,535 코드 유닛과 NUL·고립 서로게이트·BOM·기타 속성·0xffffffff ID·추가 꼬리를 typed 재구성으로 대조했습니다.
2. 속성 32비트를 하나씩 켜 native view와 독립 JS 진단을 비교했습니다. 미지 '%%%%'/'%zzz' 및 다른 종류 tcps는 공통 필드로 분류하지 않습니다. 문자열 길이/ID/기타 속성과 알려진 비트가 아닌 값의 의미를 발명하지 않았습니다.
3. 기존 corpus의 실제 필드는 22개, command 합계 667 UTF-16 단위, modified 6개, 미지 속성 비트 진단 0개입니다. 모두 4바이트 extra를 가져 합계 88바이트이며 별도 읽기 조사로 폭 분포도 확인했습니다. 이를 모든 필드에 필수인 padding이나 memo index로 추정하지 않았습니다.
4. 실제 필드 22개에서 extra 전체와 필수 instance ID 마지막 바이트를 제거한 뒤 framing을 재작성해 decoded document가 UnexpectedEnd로 거부함을 확인했습니다. 필드가 있는 구역별 첫 사례의 CFB 재작성에서도 4건 모두 거부했고 정상 재호출은 원래 보고서와 같았습니다. 원본 파일은 수정하지 않았습니다.
5. 실제 각 필드의 읽기 전용 수정/수정됨/미지 비트 여부를 반전해 보고서의 해당 구역 해당 값만 정확히 +1/-1 되는지 비교했습니다(66건). 네이티브 Tree의 정상/잘린 필드 경로에 모든 할당 실패를 주입했습니다. ID는 control_rules, 바이트 경계는 field_start/utf16_string, 집계는 field_validation, 문서 조립은 section, 테스트 기대 필드 위치는 공통 wire 정의를 사용합니다.

aift 및 찾아보기/책갈피 추가 표본의 문서·CFB 대조도 새 필드 집계를 포함합니다. 이 구현은 공통 envelope 검사이지 각 필드 command 문법·하이퍼링크 접근/상태·전역 instance ID 유일성·본문 필드 시작/끝 범위 의미 검증을 완료한 것이 아닙니다.

최종 Debug·ReleaseSafe·ReleaseFast audit: 모드별 네이티브 167/167, Node 47/47, HWP5 WASM 166,921회 검사 통과(참조 표본 존재 환경). CFB 12,000회 변이에서 trap 0이며 포맷·diff 검사도 통과했습니다.

## 덧말의 두 문자열과 전체 폭 속성 (2026-09-06)

명세 스킬 4.3.10.13과 공식 표 127/151을 대조했습니다. 공식 ID는 tdut이며 로컬 요약의 cmtt가 아닙니다. 표 151의 전체 길이 18바이트는 나열된 두 WORD 길이와 다섯 UINT의 합계에도 미치지 못합니다. `ruby.zig`는 counted UTF-16 문자열 두 개와 위치/size_ratio/option/style_number/정렬의 u32 다섯 개를 읽어 최소 24바이트+문자열 데이터로 처리합니다. ID는 control_header에서 이미 분리돼 있습니다.

reference/rhwp 및 기존 fixture 경로를 조사했지만 읽은 지원 본문에서 tdut 양성 표본을 찾지 못했습니다. 처리 실패 189건에는 CFB 및 이후 decode/framing 실패가 섞여 있으므로 이를 덧말 부재로 판정하지 않습니다. rhwp 파서도 두 HWP 문자열과 다섯 UINT를 읽지만 size_ratio/위치/정렬을 u8, style을 u16으로 축소합니다. 본 구현은 명세의 u32 전체 폭과 extra를 보존하며 기본값 치환·Unicode 정규화·크기 제한을 임의 적용하지 않습니다.

`ruby_validation.zig`는 controls/main_units/sub_units/reserved_positions/reserved_alignments/extra_bytes를 집계합니다. 위치 0~2, 정렬 0~5 밖은 원문과 진단으로 남깁니다. size_ratio/option의 세부 의미 및 style_number가 어떤 리소스를 어떤 기준으로 참조하는지는 단정하지 않습니다. SectionReport.ruby와 독립 테스트 기대 형식에 연결했고 구역 행은 340바이트입니다.

### 구현 후 적대적 검증

1. 두 문자열 및 다섯 정수의 모든 잘린 prefix를 거부했습니다. 표의 18바이트만 주어진 입력과 최대 길이만 선언한 짧은 문자열도 거부합니다. 오류 뒤 정상 재호출을 확인했습니다.
2. 두 문자열의 위치를 각각 바꿔 0/1/127/32,768/65,535 코드 유닛을 검사하고 두 문자열 모두 최대 길이인 경우도 typed 재구성으로 대조했습니다. NUL·고립 서로게이트·BOM·홀수 extra를 보존합니다.
3. 다섯 u32 각각에 0/1/2/3/5/6/255/256/65,535/65,536/0xffffffff를 넣어 축소가 없음을 확인했습니다. 네이티브에서도 서로 다른 고비트 값 다섯 개를 대조했습니다. 합성 WASM 성공 104건·거부 33건이며 Tree 할당 실패를 정상/마지막 정수 잘림 경로에 주입했습니다.
4. 기존 실제 파일의 문서 입력에 합성 tdut 문단을 추가해 decoded document/재작성 CFB의 구역 보고서를 대조했습니다. 합성 payload의 모든 잘림 및 CFB 마지막 정수 잘림 합계 35건을 거부했고 정상 재호출이 같은 보고서를 반환했습니다. 예약 위치/정렬 변경은 각각의 진단만 증가합니다(두 경로 4건). 원본 파일은 수정하지 않았으며 실제 덧말 양성 사례로 계상하지 않습니다.
5. 합성 두 구역에 서로 다른 덧말 진단을 넣고 Section1의 값이 정확히 1인지 확인했습니다. 공통 문서 oracle로 역순 입력과 전역 한도도 대조합니다. SSOT는 utf16_string/control_rules, payload/ruby, 집계/ruby_validation, 조립/section, 독립 wire 기대 정의로 분리합니다.

실제 덧말 파일과 버전별 저장 형태, 스타일 번호 참조 의미, 크기 비율/옵션의 조판 효과는 남았습니다. 기존 실제 corpus에서의 0개 결과와 합성 양성 검증을 구분합니다.

최종 Debug·ReleaseSafe·ReleaseFast audit: 모드별 네이티브 169/169, Node 47/47, HWP5 WASM 167,244회 검사 통과(기존 참조 표본 존재 환경). CFB 12,000회 변이에서 trap 0이며 포맷·diff 검사도 통과했습니다.

## 숨은 설명의 직접 문단 리스트 (2026-09-06)

명세 스킬 4.3.10.14와 공식 컨트롤 ID/제어코드 표 및 숨은 설명 문단을 대조했습니다. ID는 tcmt이며 로컬 요약의 hide를 사용하지 않습니다. 명세는 문단 리스트만 포함하며 보안 수준에 따라 데이터가 무효화될 수 있다고 설명합니다. 구현은 주어진 구조의 검증만 수행하고 보안 무효화 판정·숨은 내용 복구·표시 허용 판단을 하지 않습니다.

`hidden_comment.zig`는 Groups.build가 검증한 직접 소유 그룹을 사용해 controls/lists/paragraphs/header_bytes/list_extra_bytes/intervening_records를 집계합니다. 리스트가 없으면 MissingHiddenCommentList, 선언된 문단 수가 다르면 기존 Groups의 ListParagraphCountMismatch가 발생합니다. 문단 0개인 리스트는 리스트 부재와 구분해 허용합니다. opaque 헤더 속성과 리스트 확장 꼬리는 의미를 추정하지 않고 바이트 수를 남깁니다.

`list_groups.OwnerCursor`는 부모 노드 순서의 그룹 검색을 소유하며 머리말/꼬리말과 숨은 설명이 공유합니다. 원래 Tree의 부모나 Groups를 바꾸지 않고 재구축하지 않습니다. 부모/형제/후손 리스트를 섞지 않는 선형 커서이며, 다른 소유자의 그룹을 지나치는 책임을 각 검사기에 복제하지 않습니다. 구역 보고서 및 독립 기대 wire는 364바이트로 확장했습니다.

### 구현 후 적대적 검증

1. spec6/observed8 두 명시적 리스트 배치의 잘린 prefix, 리스트 부재, 문단 수 불일치, 리스트 앞 고아 문단을 검사했습니다. 빈 리스트, 여러 리스트, 미지 헤더/리스트 꼬리와 중간 레코드는 구분해 집계합니다.
2. 다른 컨트롤의 자식 리스트와 이전 형제의 리스트를 tcmt가 가져오지 않음을 확인했습니다. 중첩 tcmt와 뒤에 오는 tcmt도 올바른 그룹만 집계합니다. hide 별칭은 해석하지 않습니다.
3. OwnerCursor가 다른 부모를 건너뛰고 같은 부모의 복수 그룹을 한 번만 반환하는지 네이티브에서 검사했습니다. 정상/리스트 누락 경로의 Tree·Groups 모든 할당 실패를 주입했으며 기존 머리말/꼬리말 회귀 검사도 함께 실행했습니다.
4. 조사한 지원 본문에서 `reference/rhwp/samples/issue6034/2912735_court_report_form.hwp`의 tcmt 1개를 찾았습니다. 처리 실패 189건은 CFB와 이후 decode/framing 실패가 섞인 값이며 부재 판정이 아닙니다. 이 파일의 버전은 5.0.1.7, 플래그 33입니다. level 3의 컨트롤 아래 level 4 리스트 1개와 문단 1개가 있으며 헤더 속성/리스트 꼬리/중간 레코드 수는 0입니다. 문단 헤더는 22바이트로 별도 실측했습니다.
5. 원본 Section0의 텍스트 레코드 offset 614, UTF-16 위치 6의 tcmt 토큰은 code 23이며 종결도 23입니다. 공식 표의 code 15와 달라 원본 decoded document/CFB는 ControlCodeMismatch로 거부합니다. 이 상태를 pending으로 기록했습니다. 별도의 메모리 내 합성 변형에서 토큰 시작/끝만 15로 바꿔 문서 10,216 decoded 바이트/227레코드 및 CFB 경로를 대조했습니다. 이것을 원본 전체 문서 성공이나 자동 정규화로 계상하지 않습니다.

리스트 1바이트 잘림·문단 수 1→2·리스트와 하위 문단 제거의 세 변이를 원본 코드 23의 전용 구조 검사와 코드 15 합성 변형의 decoded document/CFB 경로에서 거부했습니다(9건). 정상 재호출도 확인했습니다. 원본 파일은 수정하지 않았으며 외부 표본 부재는 skipped로 보고합니다.

원본의 제어코드 23이 어떤 저장 관행/버전 규칙에 해당하는지, 보안 수준과 무효화의 세부 계약, 실제 숨은 설명의 표시/편집 의미는 남았습니다. 현재 전용 구조 검증 성공과 원본 전체 문서 보류를 구분해야 합니다.

최종 Debug·ReleaseSafe·ReleaseFast audit: 모드별 네이티브 171/171, Node 47/47, HWP5 WASM 167,472회 검사 통과(참조 표본 존재 환경). 합성 성공 26건·거부 19건이며 CFB 12,000회 변이에서 trap 0입니다. 포맷·diff 검사도 통과했습니다. 위 수치는 원본 ControlCodeMismatch 거부 확인을 포함하며 원본 전체 문서 성공을 뜻하지 않습니다.

## 숨은 설명의 관측 제어코드 23과 원본 문서 검증 (2026-09-06)

공식 표 6은 숨은 설명을 코드 15로 정의하지만 실제 `issue6034/2912735_court_report_form.hwp`의 tcmt는 시작/종결 코드 23을 갖습니다. 추가 조사에서 rhwp serializer/body_text.rs의 control_char_code_and_id도 HiddenComment를 0x0017로 기록하며, 주석 #5154가 여러 한컴 원본의 실측과 코드 15 저장 시 표시 차이를 설명하는 것을 확인했습니다. 이는 로컬 rhwp 설명 문서의 코드 15 표보다 실제 코드/표본에 가까운 근거입니다. 한컴 프로그램을 이번에 직접 실행해 표시 차이까지 재검증한 것은 아닙니다.

`control_rules.expectedCode`의 공식 매핑은 15 그대로 유지했습니다. 새 classifyCode는 specified/observed_hidden_comment/unknown/invalid를 반환하고 **정확한 tcmt + 23**만 관측 유형으로 추가합니다. 임의 코드 23·이름 접두사·다른 ID에는 적용하지 않습니다. 기존 Link.code와 원본 텍스트는 변경하지 않습니다.

control_type_validation의 보고서는 checked/deferred/observed 세 축입니다. checked는 명세 일치만, observed는 관측 코드만 세어 두 값을 중복 계상하지 않습니다. 문서/CFB 보고서와 독립 기대 형식도 세 필드로 변경했으며 구역 행은 368바이트입니다. 기존 테스트 모드 13의 링크 원값 형식은 유지했습니다.

### 구현 후 적대적 검증

1. 네이티브의 공식 ID 53종 × 코드 0~31 대조에서 정확한 tcmt/23 한 조합만 새 관측 성공으로 확인했습니다. 공식 매핑은 여전히 tcmt/15입니다. 원래 코드 23도 그대로 보존됩니다.
2. WASM의 알려진 ID/extended code 조합에서 기존 불일치 636건 중 tcmt/23 한 건만 관측 유형으로 바뀌었습니다. 나머지 635건은 계속 ControlCodeMismatch로 거부하고 오류 뒤 정상 재호출을 확인합니다. 미지 ID의 deferred 정책은 변경하지 않았습니다.
3. 실제 원본의 링크 전체를 독립 바이트 순회와 대조해 tcmt 코드 23이 그대로임을 확인했습니다. 원본 decoded document 10,216바이트/227레코드와 CFB 검사가 통과했고 관측 코드 수는 정확히 1입니다. 이전 단계의 원본 ControlCodeMismatch pending은 해소됐습니다. 미검사 스트림 2개 등 나머지 범위는 그대로입니다.
4. 코드 15 합성 변형은 checked가 1 증가하고 observed가 1 감소하는 것 외에 문서/CFB 구역 보고서가 같습니다. 서로 다른 코드 진단을 가진 두 구역을 독립 문서 oracle로 정순/역순 대조해 두 번째 구역의 필드 위치도 검사했습니다.
5. 실제 토큰의 시작/끝 코드를 함께 2/3/11/21로 바꾼 네 변형은 코드·문서·CFB 세 경로에서 모두 거부했습니다(12건). 기존 리스트 잘림·문단 수 불일치·리스트 누락의 9건도 이제 원본 코드 23 경로에서 모두 거부합니다. 원본 파일은 수정하지 않았고 표본이 없는 환경은 skipped입니다.

보안 수준에 따른 숨은 설명 무효화 판단, 표시/편집 의미, 모든 버전에 대한 한컴 프로그램 동작 동등성은 남았습니다. 관측 코드 지원을 이 의미 검증의 완료로 해석하지 않습니다.

최종 Debug·ReleaseSafe·ReleaseFast audit: 모드별 네이티브 171/171, Node 47/47, HWP5 WASM 167,536회 검사 통과(참조 표본 존재 환경). CFB 12,000회 변이에서 성공 8,445건·거부 3,555건·오류 후 복구 120건·trap 0을 확인했습니다. 포맷·diff 검사도 통과했습니다.

## 각주/미주 속성의 명시적 저장 배치 (2026-09-06)

명세 스킬 4.3.10.4와 공식 PDF 같은 항목을 대조했습니다. 공식 설명은 문단 리스트 외에 속성이 없지만 8바이트를 serialize한다고 하며 필드 의미를 정의하지 않습니다. 로컬 스킬 요약의 foot ID는 꼬리말이므로 사용하지 않습니다. control_rules의 공식 fn␠␠/en␠␠와 일치하는 ID만 note_control.kind로 구분합니다.

rhwp parser/control.rs 및 serializer/control.rs는 number(u32), 앞/뒤 장식(u16 각각), number_shape(u32), instance_id(u32)의 관측 배치를 사용합니다. parser는 번호를 u16으로 축소하고 짧은 입력의 일부 필드를 기본값으로 남기지만 새 파서는 이 동작을 채택하지 않습니다. 버전별 전환 규칙이나 중간 길이를 자동 추정하지 않습니다.

`note_control.Properties.parse`는 호출자가 spec8/observed16을 선택합니다. spec8은 의미 미상의 8바이트만 raw로 보존하고 observed=null입니다. observed16은 다섯 필드를 전체 폭으로 읽으며 잘리면 UnexpectedEnd입니다. 두 경로 모두 raw/extra는 입력을 빌리고 원문 꼬리를 보존합니다. 관측 값 0을 기본 장식 ')'로 치환하거나 instance_id 유일성을 가정하지 않습니다.

### 구현 후 적대적 검증

1. 네이티브에서 최대 u32 번호·모양·ID, 최대 WCHAR, 값 0, borrowed 주소, 원시 영역과 꼬리의 분리를 대조했습니다. 공식 불투명 배치에는 관측 의미를 부여하지 않습니다.
2. 두 배치의 모든 필수 prefix 잘림 24가지를 거부했습니다. observed16 입력이 8바이트 남았다고 spec8로 후퇴하지 않습니다.
3. WASM에서 각 바이트 위치에 1/0x80/0xff를 독립 주입한 72개 양성을 원시 바이트 기대값과 대조했습니다. 필드 순서 오류·폭 축소·고립 UTF-16 값 정규화를 검출하는 검사입니다. 잘림 24건과 잘못된 모드 1건도 거부했습니다.
4. 실제 reference/rhwp/samples의 footnote-01.hwp(각주 9개), endnote-01.hwp(미주 6개), footnote-tbox-01.hwp(각주 2개)를 strict CFB로 읽고 Section0 압축 해제를 Node와 코어에서 대조했습니다. 모두 버전 5.0.3.0, 컨트롤 ID 제외 속성 길이 16입니다. 각 관측 필드의 재구성을 원본 17개 payload와 바이트 단위로 대조했습니다. 각주 표본에는 동일한 후반 DWORD 0x10이 두 번 있으므로 이를 근거 없이 전역 유일 ID로 검증하지 않습니다.
5. 실제 17개 payload마다 길이 0~15를 잘라 272건의 거부 및 오류 뒤 정상 재호출을 확인합니다. 표본이 없으면 skipped로 보고하며 원본 파일은 변경하지 않습니다. ID 검사는 foot/대문자/공백이 다른 ID를 각주·미주로 해석하지 않는지도 포함합니다.

이 단계는 속성 파서와 전용 WASM 검사까지입니다. 문서 검사기에 연결하는 작업, 직접 문단 리스트 소유권·확장 꼬리, 자동 번호와의 연결, 관측 필드의 버전별 의미·조판은 아직 남았습니다. 이번 payload 검사를 실제 파일 전체 문서 검증 완료로 계상하지 않습니다.

최종 Debug·ReleaseSafe·ReleaseFast audit: 모드별 네이티브 173/173, Node 47/47, HWP5 WASM 168,238회 검사 통과(참조 표본 3개 존재). CFB 12,000회 변이에서 trap 0이며 포맷·diff 검사도 통과했습니다.

## 각주/미주 문단 소유권과 문서 검사 연결 (2026-09-06)

`note_validation.zig`는 note_control의 ID/속성 해석과 기존 Groups/OwnerCursor를 조립합니다. 직접 리스트가 없으면 MissingNoteList이고 리스트가 존재하되 문단 수 0인 경우와 구분합니다. 문단 수 불일치는 Groups가 소유하며 이 검사기에 재구현하지 않습니다. 리스트 미지 꼬리와 컨트롤 extra를 각각 집계하고 주석 보안·표시·번호 의미를 추정하지 않습니다.

연결 첫 회귀 검사에서 기존 숨은 설명 표본 issue6034/2912735_court_report_form.hwp의 각주 4개가 관측 16바이트 검사에 실패했습니다. 원문 재측정 결과 offset 734/1252/1710/2262의 fn 컨트롤 속성은 12바이트입니다(ID 제외). 버전 5.0.1.7에서 번호·장식·모양의 12바이트는 존재하지만 마지막 DWORD가 없습니다. 길이로 자동 후퇴시키지 않고 observed12를 명시적 배치로 추가했습니다. 해당 배치의 instance_id는 null이며 값 0인 observed16과 구분합니다.

문서 Options.note_layout 기본값은 observed12입니다. 16바이트 표본의 마지막 4바이트는 이 선택에서 extra로 보존·집계하며 ID라고 자동 해석하지 않습니다. 호출자가 observed16을 선택하면 ID까지 필수입니다. spec8 선택은 필드 의미를 부여하지 않고 opaque_controls를 보고합니다. 구역 보고서는 footnotes/endnotes/lists/paragraphs/opaque_controls/header_extra_bytes/list_extra_bytes 7필드를 추가했으며 독립 기대 wire의 행 크기는 396바이트입니다.

### 구현 후 적대적 검증

1. 세 속성 배치 × 두 리스트 배치를 대조했습니다. 속성/리스트 필수 prefix 전체 잘림, 고아 문단, 리스트 부재, 선언 개수 오류, 빈 리스트, 여러 리스트, 알 수 없는 중간 레코드와 꼬리를 검사합니다. 정상 입력 재호출로 오류 뒤 복구를 확인합니다.
2. 이전 형제나 다른 컨트롤의 후손 리스트를 가져오지 않는지 확인했습니다. 각주 문단 안의 중첩 미주와 이후 형제 미주도 직접 그룹만 집계하며 foot 꼬리말은 제외합니다. SSOT는 기존 OwnerCursor이고 새로운 계층 검색/문단 수 검증기를 만들지 않았습니다.
3. Tree/Groups 성공·리스트 누락 경로의 모든 할당 실패를 네이티브로 주입했습니다. observed12의 ID 부재, observed16의 ID 0, u32 폭 보존과 모든 prefix 잘림도 대조했습니다. 전용 WASM payload 검사는 observed12까지 확장했습니다.
4. footnote-01.hwp/endnote-01.hwp/footnote-tbox-01.hwp의 실제 원본을 독립 문서 oracle 및 CFB 경로에서 대조했습니다. 세 파일 각각 첫 주석의 리스트 하위 영역 제거, 문단 수 증가, 속성 11바이트 잘림을 전용 검사/decoded document/재생성 CFB 세 경로에서 거부했습니다(총 27건). 원본 파일은 수정하지 않았습니다. 기존 12바이트 주석 표본도 전체 회귀 문서 경로에서 통과합니다.
5. 각 실제 파일에서 첫 주석의 컨트롤 ID와 텍스트 토큰 ID를 함께 각주↔미주로 바꾼 별도 합성 구역을 구성했습니다. 원본/변형 두 구역의 서로 다른 보고서 값을 독립 oracle로 대조하고 역순 입력·총량 한도도 검사했습니다. Section1 번호 필드의 독립 고정 위치도 새 행 크기로 대조했습니다.

이전 단계의 문서 연결/직접 리스트 구조 보류는 해소했습니다. 버전별 배치 전환 규칙, 리스트 확장 8바이트 의미, 마지막 DWORD의 실제 유일성/용도, 자동 번호와의 의미 연결·레이아웃·편집·저장은 남았습니다. 검사 통과를 이 범위의 완료로 계상하지 않습니다.

최종 Debug·ReleaseSafe·ReleaseFast audit: 모드별 네이티브 174/174, Node 47/47, HWP5 WASM 168,929회 검사 통과(참조 표본 존재). CFB 12,000회 변이에서 trap 0이며 포맷·diff 검사도 통과했습니다.

## 수식 EQEDIT의 관측 payload 배치 (2026-09-06)

명세 스킬 4.3.9.3 및 공식 PDF 표 104/105를 대조했습니다. eqed 컨트롤의 개체 공통 속성과 자식 EQEDIT(tag 88)는 별개이며 공통 속성을 EQEDIT 시작에서 다시 읽지 않습니다. 표 105는 뒤 두 문자열에 같은 len을 표기하지만 실제 저장은 각각 u16 길이를 갖습니다. 또한 baseline 뒤의 u16은 표에 없습니다. rhwp parser/control.rs와 serializer/control.rs의 관측 처리 및 실제 원문으로 이 차이를 확인했습니다.

`equation.Properties`는 attributes(u32), counted script, font_size(u32), color(u32), baseline(i16), unknown(u16), counted version_info, 선택 counted font_name, extra를 보존합니다. Layout.version_only/with_font는 호출자가 명시하며 버전/길이로 fallback하지 않습니다. version_only의 font_name은 null이고 with_font의 빈 문자열과 다릅니다. 첫 비트만 lineMode view로 해석하고 나머지 원시 속성을 마스킹하지 않습니다. unknown이 0이어야 한다고 강제하지 않습니다. 최소 길이는 문자열 내용 제외 각각 20/22바이트이며 공식 표의 총합을 그대로 메모리 크기로 사용하지 않습니다.

문자열 경계는 기존 utf16_string, 정수 읽기는 binary.Reader가 소유합니다. 수식 스크립트를 실행하거나 Unicode를 치환하지 않으며 raw 슬라이스는 입력을 빌립니다. rhwp의 잘림 시 기본값 채움은 채택하지 않고 필수 필드 잘림을 오류로 반환합니다.

### 구현 후 적대적 검증

1. signed baseline 최솟값, 최대 크기/속성, COLORREF 상위 비트, 미지 u16 최댓값, lineMode 양쪽 값과 borrowed 주소를 네이티브에서 검사했습니다. 고립 서로게이트·NUL·비문자 값은 원문 그대로 보존합니다.
2. 각 배치의 모든 필수 prefix 잘림과 거대한 문자열 선언을 거부했습니다. font 부재와 빈 font를 구분하고 version_only에서 후속 바이트는 extra로 보존합니다.
3. WASM에서 세 문자열을 독립적으로 최대 65,535 코드 유닛까지 늘려 검사했습니다. 각 스칼라 바이트 위치를 독립 변이해 필드 교환·폭 축소·부호 손실을 검출하고 원문과 바이트 대조합니다.
4. 실제 atop-equation-01.hwp(5.0.3.0, 3개)는 version_only, equation-lim.hwp(5.1.1.0, 1개)와 math-001.hwp(5.1.0.1, 44개)는 with_font입니다. strict CFB로 Section0을 추출하고 Node/코어 압축 해제를 대조한 뒤 모든 EQEDIT payload를 typed 필드로 재구성해 원문과 비교했습니다. 이 세 표본만으로 포맷 전환 버전을 일반화하지 않습니다.
5. 실제 48개 payload의 각 바이트 길이 0부터 마지막 필수 바이트 직전까지 모두 잘라 거부를 확인하고 정상 재호출했습니다. version_only 원본 3개를 with_font로 읽으면 오류임도 검사합니다. 외부 표본이 없으면 skipped이고 원본 파일은 변경하지 않습니다.

이번 단계는 payload 파서와 전용 WASM 검사입니다. EQEDIT의 부모/중복/필수 존재 규칙, 문서 검사기 연결, 수식 스크립트 문법·렌더링·편집/저장은 남았습니다. 실제 payload 대조를 해당 파일 전체 문서 검증 완료로 계상하지 않습니다.

최종 Debug·ReleaseSafe·ReleaseFast audit: 모드별 네이티브 175/175, Node 47/47, HWP5 WASM 174,134회 검사 통과(참조 표본 존재). 수식 합성 성공 41건·거부 60건, 실제 payload 잘림 거부 4,948건입니다. CFB 12,000회 변이에서 trap 0이며 포맷·diff 검사도 통과했습니다.

## 수식 레코드 소유권과 문서 검사 연결 (2026-09-06)

실제 수식 표본 3개의 EQEDIT 48개 모두 직접 부모가 eqed CTRL_HEADER임을 level 기반 독립 순회로 확인했습니다. 새 equation_validation은 eqed의 직접 자식에 EQEDIT가 하나 있어야 한다는 구조를 검사합니다. EQEDIT가 루트이거나 다른 종류 부모의 자식이면 OrphanEquation, 두 개면 DuplicateEquation, 없으면 MissingEquation입니다. Tree의 parent/subtree_end를 재사용하고 별도 부모 그래프를 만들지 않습니다. 다른 자식의 후손을 건너뛰므로 후손이나 이후 형제의 EQEDIT로 누락을 상쇄하지 않습니다.

payload 해석은 equation.Properties, ID는 control_rules.equation_id, 태그 번호는 equation.tag가 소유합니다. 문서 조립은 Options.equation_layout으로 검사기를 호출합니다. 기본 version_only에서는 뒤쪽 폰트 원문을 extra로 보존·집계하며 자동으로 with_font로 바꾸지 않습니다. with_font 선택 시 폰트 prefix도 필수입니다. 구역 보고서는 controls/script_units/version_units/font_units/line_mode/unknown_attributes/unknown_words/extra_bytes 8필드입니다. 미지 속성 비트와 unknown u16은 진단만 하고 원시 값을 거부·정규화하지 않습니다. 독립 보고서 행은 428바이트로 확장했습니다.

### 구현 후 적대적 검증

1. 두 배치의 모든 필수 prefix 잘림, EQEDIT 루트/다른 부모, 중복, 누락, 중첩 수식, 미지 형제 레코드, 이후 형제의 잘못된 차용을 검사했습니다. 상위 수식에 정상 EQEDIT가 있어도 다른 자식 아래의 고아 EQEDIT를 무시하지 않습니다.
2. Tree의 모든 할당 실패를 성공 및 MissingEquation 경로에 주입했습니다. 검사기는 추가 할당 없이 직접 자식만 순회하고 payload를 재파싱하지 않습니다. object_common과 수식 필드를 같은 바이트에서 두 번 읽지 않습니다.
3. 독립 JS 기대 순회는 원본 level/parent와 각 문자열 길이를 직접 읽어 구역 보고서와 대조합니다. 미지 속성 상위 비트, lineMode, unknown u16, extra를 별도 집계하며 제품 보고서에서 기대값을 생성하지 않습니다.
4. atop-equation-01.hwp/equation-lim.hwp/math-001.hwp의 원본 전체 decoded document와 CFB 경로가 통과했습니다. 각 파일 첫 EQEDIT의 누락/중복/필수 버전 문자열 잘림을 전용 검사·문서·재생성 CFB 세 경로에서 거부했습니다(27건). 원본 레코드를 독립 루트로 옮긴 고아 검사도 3건 수행했습니다. 원본 파일은 변경하지 않았습니다.
5. 각 실제 파일의 첫 수식 lineMode 비트를 뒤집은 합성 구역과 원본 구역을 함께 검사했습니다. 다른 집계를 가진 두 구역을 정순/역순 및 전역 한도로 대조했고 독립 Section1 필드 고정 위치도 확인했습니다. 오류 뒤 정상 문서 재호출로 복구를 확인했습니다.

이전의 수식 레코드 소유권·문서 검사 연결 보류는 해소됐습니다. 문서 기본 배치에서 extra로 남는 폰트의 의미, 버전별 배치 선택 규칙, 수식 언어 문법·렌더링·편집·저장은 남았습니다. 기존 미지 레코드 진단은 별도 층의 분류이며 수식 검사 성공으로 다른 미지 항목을 완료 처리하지 않습니다.

최종 Debug·ReleaseSafe·ReleaseFast audit: 모드별 네이티브 176/176, Node 47/47, HWP5 WASM 174,569회 검사 통과(참조 표본 존재). 전용 소유권 합성 성공 55건·거부 49건, 실제 문서 손상 거부 27건·고아 거부 3건입니다. CFB 12,000회 변이에서 trap 0이며 포맷·diff 검사도 통과했습니다.

## OLE 개체의 명세/관측 속성 배치 (2026-09-06)

명세 스킬 4.3.9.5 및 공식 PDF 표 117~119를 대조했습니다. 표 118은 속성을 u16로 쓰지만 표 119는 bit 16~21의 개체 종류도 정의합니다. 따라서 명세 배치에서 이 비트가 존재한다고 가정하지 않습니다. [hwplib의 ForControlOLE](https://github.com/neolord0/hwplib/blob/main/src/main/java/kr/dogfoot/hwplib/reader/bodytext/paragraph/control/gso/ForControlOLE.java)는 속성을 u32, BinData ID를 u16으로 읽고 테두리 색·두께·속성 뒤 나머지를 보존합니다. 실제 표본과 이 독립 구현을 함께 참조하되 코드를 복사하지 않았습니다.

`ole.Properties.parse`는 spec24/observed26을 호출자가 명시합니다. 속성 너비만 각각 2/4바이트로 다르며 extent_x/y는 i32, BinData ID는 u16, 테두리 색 u32·두께 i32·속성 u32입니다. objectKind는 spec24에서 null이며 observed26의 Unknown 값 0과 구분합니다. baselineRaw는 원시 7비트이고 0을 85로 덮어쓰지 않습니다. 알려지지 않은 enum/상위 비트/꼬리는 버리지 않습니다. 공통 개체/그리기 개체 속성을 이 payload 앞에서 중복 소비하지 않습니다.

로컬 rhwp parser/control/shape.rs는 offset 12에서 BinData ID를 u32로 읽습니다. 실제 표본의 해당 위치 뒤 테두리 색이 0이면 차이가 숨겨집니다. 이번 테스트는 색을 0xaabbccdd로 바꿨을 때 u16 ID는 1 그대로이고 같은 위치의 u32 읽기는 0xccdd0001이 됨을 확인합니다. 이는 바이트 해석의 경계 검증이며 rhwp 전체 프로그램을 실행해 재현한 결과는 아닙니다.

### 구현 후 적대적 검증

1. spec24/observed26의 전체 필수 prefix 잘림 50개를 거부했습니다. 명세 24바이트를 observed26으로 자동 후퇴 처리하지 않습니다. 잘못된 모드와 오류 뒤 정상 재호출도 검사합니다.
2. 각 필수 바이트 위치에 1/0x80/0xff를 독립 주입한 150개 합성 양성을 WASM의 typed 필드 재구성과 대조했습니다. 기대값은 제품 파서로 생성하지 않습니다.
3. signed extent/두께 경계, COLORREF 상위 비트, 최대 속성·개체 종류, baseline 0/127, moniker true/false, BinData ID 0/1, 명세 배치에서의 개체 종류 부재를 네이티브로 대조했습니다.
4. 실제 한셀OLE.hwp와 issue5724/2689441_wmf_contents_ole.hwp는 버전 5.1.0.1이며 각각 OLE 레코드 1개, payload 길이 30바이트입니다. strict CFB로 추출하고 Node/코어 압축 해제를 대조한 뒤 관측 26바이트 필드와 4바이트 미지 꼬리를 원문과 비교했습니다. 속성 값은 각각 0x00010001/0x00030001입니다.
5. 실제 필수 prefix 잘림 52건을 거부하고 각 오류 뒤 정상 payload를 다시 검사했습니다. 필수 영역은 유지한 채 미지 꼬리만 0~3바이트로 줄인 입력은 허용합니다. 테두리 색 변경이 BinData ID를 오염시키지 않는지도 확인했습니다. 원본 파일은 변경하지 않았고 외부 표본 부재는 skipped입니다.

이번 단계는 OLE payload 파서와 전용 WASM 검사입니다. 그리기 개체 소유권, BinData 리소스 참조 및 저장 스트림 연결, 문서 검사기 통합, 임베디드 OLE/차트 내부 형식·표시/편집은 남았습니다. 외부 moniker나 임베디드 프로그램에 접근·실행하지 않았습니다.

최종 Debug·ReleaseSafe·ReleaseFast audit: 모드별 네이티브 177/177, Node 47/47, HWP5 WASM 174,940회 검사 통과(참조 표본 존재). CFB 12,000회 변이에서 trap 0이며 포맷·diff 검사도 통과했습니다.

## OLE 직접 소유권·보류 참조와 문서 검사 연결 (2026-09-06)

명세의 그리기 개체 항목도 확인하고 실제 두 OLE 표본의 전체 level 계층을 측정했습니다. OLE(tag 84)의 직접 부모는 gso CTRL_HEADER가 아니라 SHAPE_COMPONENT(tag 76)이며 첫 ID는 $ole입니다. 두 표본의 경로는 문단 → gso → $ole SHAPE_COMPONENT → OLE입니다. 이번 검사기는 구성요소의 첫 ID와 직접 payload 관계만 검증하며 도형의 전체 속성이나 상위 gso/묶음 계층을 완성된 것으로 판정하지 않습니다.

`ole_validation.inspect`는 $ole 구성요소당 직접 OLE 하나를 요구합니다. 고아·중복·부재는 OrphanOle/DuplicateOle/MissingOle이고 다른 부모의 후손/이후 형제 payload를 가져오지 않습니다. `owned_record.find`로 직접 자식 검색을 분리해 수식 검사도 공유합니다. 구조상 중복을 payload 해석보다 먼저 판정하며 기존 DuplicateEquation/MissingEquation 오류 이름은 유지합니다. Tree의 parent/subtree_end가 계층 SSOT이고 추가 그래프나 할당은 없습니다.

보고서는 objects/pending_references/monikers/reserved_aspects/reserved_baselines/reserved_kinds/extra_bytes입니다. BinData 순번과 storage ID는 두 표본에서 모두 1이므로 구별되지 않습니다. 이 근거로 특정 해석을 단정하지 않고 OLE마다 pending_references를 1 증가시킵니다. 기존 컨테이너의 DocInfo BinData 스트림 검사는 계속 수행하지만 그것을 OLE 참조 해석 성공으로 세지 않습니다. moniker 플래그는 데이터 진단일 뿐 외부 접근을 허가하지 않습니다.

문서 ole_layout 기본값은 observed26입니다. 독립 구역 보고서에 7필드를 추가해 행 크기는 456바이트가 됐습니다. SHAPE_COMPONENT는 첫 ID만 읽으므로 전체 도형 속성의 길이·중복 ID·기하 검증은 남습니다.

### 구현 후 적대적 검증

1. 두 속성 배치의 모든 필수 prefix 잘림, SHAPE_COMPONENT ID 잘림, 다른 종류의 부모, 루트 OLE, 중복/누락, 후손·이후 형제 차용을 거부했습니다. 중첩 $ole 구성요소는 각자의 직접 payload만 집계합니다.
2. 예약 aspect/baseline/kind, moniker 및 미지 꼬리 진단을 독립 원시 바이트 기대값과 대조했습니다. 미지 값은 정규화하지 않고 참조 보류를 성공과 별도 계상합니다.
3. Tree의 성공·MissingOle 경로에 모든 할당 실패를 주입했습니다. 공유 직접 자식 검색으로 바뀐 수식 검사의 실제 문서·고아·중복·누락·잘림 회귀도 함께 실행했습니다.
4. 한셀OLE.hwp와 issue5724/2689441_wmf_contents_ole.hwp의 독립 소유권 보고서와 전체 decoded document는 통과했습니다. 실제 CFB 경로에서는 추가 누락을 발견했습니다. DocInfo BinData 원문 0200010003004f004c004500은 storage형 뒤에 OLE 문자열을 갖고 실제 스트림은 BIN0001.OLE입니다. 현재 container는 확장자 없는 BIN0001을 찾아 MissingHwpEntry로 실패합니다. 이 실패와 두 정확한 경로의 부재/존재를 별도 회귀로 고정했으며 CFB 성공으로 계상하지 않습니다. 각 실제 OLE의 누락/중복은 전용 검사와 decoded document 양쪽에서 거부하며 정상 소유권 검사로 복구합니다. 원본은 변경하지 않습니다.
5. 각 실제 파일에서 moniker 비트만 뒤집은 별도 합성 구역을 만들고 원본 구역과 함께 정순/역순·총량 한도로 대조합니다. 두 번째 구역의 필드 위치와 서로 다른 진단값을 검증해 위치 편향을 방지합니다. 외부 참조 표본이 없으면 skipped입니다.

직접 OLE payload 소유권과 문서 연결은 추가됐지만 BinData 참조 해석·storage형 확장자와 컨테이너 경로·상위 도형 전체 계층/기하·임베디드 OLE/차트 내부 형식·표시/편집은 남았습니다. 다음 단계는 실제 CFB 실패를 만드는 storage 확장자 계약입니다. pending_references를 해소하지 않은 채 전체 OLE 지원 완료라고 판단하지 않습니다.

최종 Debug·ReleaseSafe·ReleaseFast audit: 모드별 네이티브 178/178, Node 47/47, HWP5 WASM 175,295회 검사 통과(참조 표본 존재). OLE 소유권 합성 성공 64건·거부 60건입니다. CFB 12,000회 변이에서 trap 0이며 포맷·diff 검사도 통과했습니다. 이 수치는 두 OLE 원본의 MissingHwpEntry 예상 실패 검사를 포함하며 두 원본의 전체 CFB 성공을 의미하지 않습니다.

## storage형 BinData 확장자와 실제 OLE 컨테이너 복구 (2026-09-06)

명세 스킬 4.2.3의 표 17은 확장자를 EMBEDDING에만 정의합니다. 앞 단계 실제 두 OLE 표본은 STORAGE(type 2)의 ID 뒤에도 counted UTF-16 OLE를 저장합니다. 새 StorageLayout은 specified/observed_optional_extension으로 구분하며 `BinData.parse`의 명세 envelope 및 원문 extra는 그대로 둡니다. `BinData.target(layout)`이 embedding/storage의 ID·선택 extension_utf16·남은 extra view를 반환합니다. LINK/미지원 타입은 null이고 외부 경로를 읽지 않습니다.

observed_optional_extension은 꼬리가 없으면 확장자 부재(null)이고, 꼬리가 있으면 완전한 u16 길이+문자열이 필요합니다. 길이 0인 문자열은 존재하되 빈 확장자이며 부재와 구분합니다. 잘린 prefix/문자열에 대해 지정되지 않은 명세 배치로 fallback하지 않습니다. specified는 storage 꼬리를 전부 미지 extra로 남깁니다. 형식 해석은 BinData.target, 경로 검증/조합은 기존 paths.binary, 정확한 파일 조회·압축/총량 한도는 container.binaries가 소유합니다. 컨테이너 Options.storage_layout 기본값은 관측 선택 배치입니다.

실제 한셀OLE.hwp 및 issue5724/2689441_wmf_contents_ole.hwp가 이제 BIN0001.OLE을 정확히 찾고 전체 CFB 검사를 통과합니다. 이전 MissingHwpEntry 보류를 원본 성공 검사로 교체했습니다. OLE payload의 BinData ID가 순번인지 storage ID인지에 대한 별도 pending_references는 변경하지 않습니다. 경로 복구를 이 참조 의미의 검증으로 혼동하지 않습니다.

### 구현 후 적대적 검증

1. 네이티브에서 specified/관측 선택의 차이, 원래 item.extra 보존, 확장자 뒤 꼬리, 부재/null과 빈 문자열, 최대 ID, embedding 재사용, LINK/unknown 비대상을 검사했습니다. storage 확장자 선언이 시작된 뒤의 모든 잘림을 거부했습니다.
2. WASM target view를 독립 바이트 기대값과 대조하고 잘림/잘못된 모드를 검사했습니다. 표준 BinData 재구성 probe와 기존 전체 DocInfo 회귀도 유지해 기존 parse 계약을 바꾸지 않았음을 확인합니다.
3. 실제 두 파일의 DocInfo를 메모리에서 변형해 모든 확장자 prefix 잘림, NUL·슬래시·고립 서로게이트, 존재하지 않는 확장자를 CFB 경로에서 거부했습니다. 확장자를 가진 DocInfo를 두고 스트림만 BIN0001로 바꿔도 거부합니다. basename fallback은 없습니다.
4. 확장자 부재 및 빈 확장자로 변경한 DocInfo와 확장자 없는 스트림은 허용했습니다. 명세 모드는 원본 BIN0001.OLE에 대해 MissingHwpEntry이며, 명시적으로 BIN0001로 이름을 바꾼 합성 컨테이너에서는 원본 관측 모드와 같은 보고서를 반환합니다. 명세 모드가 몰래 관측 확장자를 채택하지 않음을 검사합니다.
5. 각 오류 뒤 정상 CFB 보고서를 다시 대조했습니다. 실제 파일 전체의 독립 컨테이너 oracle·decode 한도·원래 OLE 문서 소유권 및 두 구역 순서 검증도 함께 실행했습니다. 원본 파일은 변경하지 않았고 참조 표본이 없으면 skipped입니다.

이 단계에서 두 원본의 storage 확장자 경로 실패는 해소했습니다. 확장자 뒤 미지 꼬리 의미, 모든 버전의 배치 규칙, OLE ID 참조 의미·임베디드 내부 형식·상위 도형 의미·표시/편집은 남았습니다.

최종 Debug·ReleaseSafe·ReleaseFast audit: 모드별 네이티브 179/179, Node 47/47, HWP5 WASM 175,370회 검사 통과(참조 표본 존재). CFB 12,000회 변이에서 trap 0이며 포맷·diff 검사도 통과했습니다. 두 OLE 원본의 기본 관측 모드 CFB 성공과 명세 모드 예상 실패를 구분해 검증했습니다.

## OLE 참조 해석을 구별하는 실제 차트 표본 (2026-09-06)

OLE의 pending_references를 성급히 리소스 순번 검사로 대체하지 않기 위해 rhwp samples의 HWP 후보 536개를 추가 조사했습니다. 430개는 순회를 마쳤고 102개는 CFB/압축/레코드 등의 단계에서 실패했으며 4개는 지원하지 않는 보안 플래그로 제외했습니다. 실패를 OLE 부재로 해석하지 않습니다. 순회 중 찾은 OLE 53개 중 51개는 ID가 DocInfo 순번/저장소 ID 양쪽에 맞아 구별에 도움이 되지 않았습니다. 한 개는 ID 0이었고, 한 개에서 DocInfo 두 해석이 달랐습니다. 이 집계는 전체 HWP 지원률이나 실패 파일의 완전한 개체 조사 결과가 아닙니다.

구별 표본은 `reference/rhwp/samples/chart/분산형/곡선이있는분산형.hwp`입니다. 버전은 5.1.1.0이며 OLE payload의 ID는 1입니다. DocInfo BinData는 단 한 항목이고 원문은 0200030003004f004c004500: storage ID 3, extension OLE입니다. 따라서 리소스 순번 1로 해석하면 BIN0003.OLE이지만 물리 저장소 ID 1로 해석하면 BIN0001.OLE입니다. 파일 안에는 두 스트림이 모두 존재합니다. DocInfo에 ID 1이 없다는 사실만으로 물리 ID 해석을 반증할 수 없습니다.

추가로 BIN0001/2/3.OLE을 각각 압축 해제하고 4바이트 크기 envelope 뒤의 내부 CFB를 strict로 읽었습니다. 세 스트림 모두 Contents/OlePres/OOXMLChartContents를 갖지만 내용은 다릅니다. OOXMLChartContents의 scatterStyle은 각각 smooth/lineMarker/smoothMarker입니다. 압축 해제한 전체 envelope의 SHA-256도 모두 다릅니다. 파일 이름이 특정 표시와 비슷하다는 이유로 한컴의 실제 선택 스트림을 단정하지 않습니다. 이번에는 한컴 프로그램을 실행하거나 시각적 출력과 대조하지 않았습니다.

`tests/hwp5/ole-reference-evidence.mjs`는 위 차이를 실제 코어 payload 출력과 독립 원문 순회로 대조합니다. ID 1, DocInfo ordinal 1/storage ID 3, 별개 물리 스트림 3개와 각 차트 설정을 고정했습니다. 내부 CFB 크기 envelope, strict 파싱, 서로 다른 내용 해시도 검사합니다. 차트 XML은 이 고정 표본의 설정 표식만 검사하며 일반 XML/차트 파서를 구현한 것이 아닙니다.

현재 decoded document/CFB 검사는 통과하지만 OLE pending_references는 정확히 1 그대로입니다. DocInfo 항목이 가리키는 BIN0003.OLE을 디코딩한 사실은 OLE ID 1의 의미 해석 성공이 아닙니다. 이 표본은 앞으로 잘못된 단일 해석으로 보류를 지우는 회귀를 검출하기 위한 증거입니다. 원본과 내부 콘텐츠는 변경·실행하지 않았습니다. 외부 표본이 없으면 skipped로 보고합니다.

OLE 참조 의미는 아직 보류입니다. 이를 확정하려면 파일을 읽는 한컴 동작이나 더 명확한 규격/독립 구현 근거가 필요하며, 현재 검사의 성공만으로 순번 또는 물리 ID를 선택하지 않습니다. 전체 문서 구현 목표는 유지합니다.

최종 Debug·ReleaseSafe·ReleaseFast audit: 모드별 네이티브 179/179, Node 47/47, HWP5 WASM 175,406회 검사 통과(참조 표본 존재). CFB 12,000회 변이에서 trap 0이며 diff 검사도 통과했습니다. 이번 변경은 증거·회귀 테스트 추가이며 제품의 OLE 참조 의미를 바꾸지 않았습니다.

## 그리기 구성요소와 Rendering 행렬 파서 (2026-09-06)

공식 PDF 표 82~85와 자료형 표를 대조했습니다. 표 82는 ID 4바이트이고 GenShapeObject일 경우 두 번 기록한다고 명시합니다. 로컬 스킬 요약의 항상 두 번이라는 설명은 적용하지 않습니다. 표 83의 고정 필드는 42바이트이며 HWPUNIT16 회전각은 signed i16입니다. 표 84는 u16 쌍 개수, 48바이트 translation, count×96바이트 scale/rotation 쌍입니다.

`shape_component.Component.parse`는 Layout.single_id/double_id를 명시적으로 받습니다. 원시 ID 두 값과 signed 좌표·회전각, unsigned 크기·횟수·버전·속성을 보존하고 일치하지 않는 두 ID를 몰래 합치지 않습니다. 두 인접 DWORD가 같다는 이유로 두 번째 값을 ID로 추정하지 않습니다. 종류별 테두리·채우기·그림자 등 나머지는 extra입니다.

`rendering.Matrix`는 double 6개의 원시 u64 비트를 보존하며 선택 value(index) view만 제공합니다. Pair/Rendering의 read는 실패 시 Reader cursor를 보존합니다. 행렬 쌍은 binary.record_array의 고정 96바이트 borrowed 배열로 접근하며 입력 전체를 복제하거나 native 구조체에 직접 캐스팅하지 않습니다. count는 u16이고 count×96 크기를 bounded Reader.take로 확인합니다. 행렬 합성·정규화·유한성 판정을 파싱 성공과 혼동하지 않습니다.

### 구현 후 적대적 검증

1. signed 좌표/회전각 최솟값, 최대 unsigned 크기/속성, 단일 ID에서의 second_id 부재, 서로 다른 이중 ID 보존을 네이티브로 확인했습니다. 단일 배치의 offset_x가 ID와 우연히 같아도 필드 위치를 변경하지 않습니다.
2. Matrix/Pair/Rendering의 중간 잘림에서 cursor가 그대로임을 확인했습니다. 행렬 배열의 count 경계·범위 밖 get·usize 최댓값 인덱스가 안전하게 처리되는지도 검사했습니다.
3. WASM에서 NaN payload·양/음 무한대·음수 0·subnormal을 translation/scale/rotation에 넣고 원시 비트로 재구성했습니다. 각 고정 필드 바이트를 독립 변이하고 0쌍/65,535쌍 경계, 과대 선언에 부족한 바이트, 잘못된 모드를 검사했습니다. 도형/행렬의 모든 필수 prefix 잘림을 거부했습니다.
4. 한셀OLE.hwp, shape-group-02.hwp, group-drawing-02.hwp의 Section0을 strict CFB로 추출하고 Node/코어 압축 해제를 대조했습니다. 총 40개 구성요소에서 부모가 gso CTRL_HEADER인 3개는 double_id, 부모가 SHAPE_COMPONENT인 37개는 single_id로 명시해 원문 재구성을 비교했습니다. 바이트 중복 비교로 배치를 선택하지 않았습니다.
5. 실제 각 구성요소의 필수 행렬 영역 끝까지 모든 잘림 위치를 검사해 13,740건을 거부했습니다. extra 영역을 필수 행렬이라고 잘못 계산하지 않고 정상 재호출도 대조합니다. 원본 파일은 변경하지 않았으며 표본 부재는 skipped입니다.

이번 단계는 표 82~85의 payload 파서와 전용 WASM 검사입니다. 기존 OLE 소유권 검사는 아직 구성요소 첫 ID만 사용하며 이 새 필드 검사가 문서 검사에 자동 연결된 것은 아닙니다. 전체 도형 계층·그룹 횟수 의미·행렬 합성·종류별 꼬리·문서 연결·렌더링/편집은 남았습니다. NaN 등이 보존된다고 유효한 조판 행렬로 판정하지 않습니다.

최종 Debug·ReleaseSafe·ReleaseFast audit: 모드별 네이티브 181/181, Node 47/47, HWP5 WASM 189,726회 검사 통과(참조 표본 존재). CFB 12,000회 변이에서 trap 0이며 포맷·diff 검사도 통과했습니다.

## 그리기 구성요소 계층과 문서 검사 연결 (2026-09-06)

추가 표본 순회에서 구성요소 부모는 gso CTRL_HEADER 3,242건과 $con SHAPE_COMPONENT 2,342건으로 관측됐습니다. CFB/압축/레코드 단계 실패 102파일은 이 관계 검증의 성공이나 구성요소 부재로 계상하지 않습니다. 공식 GenShapeObject ID 반복 규칙과 이 계층 증거를 사용해 배치를 선택합니다.

`shape_validation.inspect`는 gso마다 직접 SHAPE_COMPONENT 하나를 요구하며 owned_record.find를 재사용합니다. root/다른 부모/그룹이 아닌 구성요소의 자식은 OrphanShapeComponent, gso 직접 구성요소 중복·부재는 DuplicateShapeComponent/MissingShapeComponent입니다. gso 아래는 double_id, $con 아래는 single_id이며 길이/인접 DWORD 일치로 추측하지 않습니다. 부모 그래프는 Tree의 parent/subtree_end가 소유합니다. identity 읽기는 shape_component.identity로 분리해 OLE에서도 공유합니다.

문서 구역 보고서는 components/top_level/grouped/matrix_pairs/mismatched_ids/unknown_attributes/nonfinite_values/extra_bytes입니다. 이중 ID 불일치와 미지 속성은 진단이며 원문을 수정하지 않습니다. 비유한 수는 원시 IEEE exponent로 세어 NaN·무한대의 비트 패턴을 손상시키지 않습니다. 모든 translation/scale/rotation 원소를 검사하지만 행렬 합성이나 시각적 유효성을 판정하지 않습니다. 독립 보고서 행은 488바이트가 됐습니다.

### 구현 후 적대적 검증

1. gso 구성요소 누락·중복, 고아 root/다른 컨트롤 부모, $con이 아닌 구성요소의 자식, 다른 후손이나 이후 형제의 차용을 거부했습니다. 여러 단계의 그룹 및 이후 별도 gso는 자기 구성요소만 집계합니다.
2. double_id 100바이트와 single_id 96바이트 최소 배치의 모든 필수 prefix 잘림을 별도로 거부했습니다. 오류 뒤 정상 계층 재호출도 확인했습니다. native에서는 Tree 모든 할당 실패를 성공 및 MissingShapeComponent 경로에 주입했습니다.
3. 독립 JS 순회가 level과 부모 ID로 배치를 정하고 원문 필드에서 보고서를 계산합니다. ID 불일치·속성 상위 비트 및 translation/scale/rotation 각각에 넣은 비유한 값 3개를 정확히 진단했습니다. 유한성 검사에 부동소수점 연산이나 NaN 정규화를 사용하지 않습니다.
4. 한셀OLE.hwp/shape-group-02.hwp/group-drawing-02.hwp의 실제 구성요소 40개에 대한 전체 decoded document 및 CFB 경로가 통과했습니다. 각 첫 gso 구성요소 하위 영역 누락·직접 구성요소 중복·필수 행렬 1바이트 잘림을 전용 검사/문서/재생성 CFB 세 경로에서 거부했습니다(27건). 원본 파일은 변경하지 않았습니다.
5. 각 실제 파일의 첫 구성요소 미지 속성 비트를 뒤집은 합성 구역과 원본 구역을 함께 독립 oracle에 대조했습니다. 서로 다른 구역 보고서의 정순/역순·총량 한도와 두 번째 구역의 고정 필드 위치를 확인했습니다. 수식/OLE의 공유 직접 자식 검색 및 기존 문서 회귀도 유지했습니다.

이전 단계의 공통 구성요소 문서 연결 보류는 해소됐습니다. 그룹 횟수/변환 쌍 의미, 종류별 테두리·채우기·그림자 등 extra, 행렬 합성·조판·편집/저장 및 OLE ID 참조 의미는 남았습니다. 계층/공통 필드 검증을 도형 전체 의미 검증으로 계상하지 않습니다.

최종 Debug·ReleaseSafe·ReleaseFast audit: 모드별 네이티브 182/182, Node 47/47, HWP5 WASM 190,497회 검사 통과(참조 표본 존재). CFB 12,000회 변이에서 trap 0이며 포맷·diff 검사도 통과했습니다.

## 도형 테두리 배치와 공통 선 속성 view (2026-09-06)

공식 PDF 표 86~88을 대조했습니다. 표 86은 색 u32·두께 i16·속성 u32·outline u8의 11바이트입니다. 실제 선/사각형/다각형 표본과 rhwp parser/control/shape.rs는 두께 i32의 13바이트 배치를 사용합니다. 새 shape_border.Layout은 spec11/observed13을 명시적으로 구분하며 길이로 fallback하지 않습니다. Border.read는 성공할 때만 Reader cursor를 이동하고 Border.parse는 읽은 값과 borrowed extra를 분리합니다.

line_attributes.Attributes는 표 87의 선 종류(0~5), 선 끝(6~9), 시작 화살표(10~15), 끝 화살표(16~21), 시작 크기(22~25), 끝 크기(26~29), 시작/끝 채움(30/31) view를 제공합니다. enum의 예약값을 버리거나 기본값으로 바꾸지 않습니다. OLE의 원시 border_attributes는 유지하고 borderAttributes()가 같은 view를 제공합니다. 테두리 색을 축소하거나 음수 두께를 0으로 보정하지 않습니다.

### 구현 후 적대적 검증

1. 속성 32개 비트를 하나씩 독립 설정해 다른 필드에 섞이지 않는지 네이티브로 대조했습니다. 최대 화살표/크기 예약값도 보존합니다. OLE accessor도 동일한 원시 값과 채움 비트를 반환하는지 확인했습니다.
2. spec11의 최소 i16, observed13의 최소 i32 두께, 색 상위 비트, 최대 outline 및 extra를 검사했습니다. 각 필수 prefix 잘림에서 Reader cursor가 원래 위치를 유지합니다.
3. WASM에서 두 배치의 각 바이트에 1/0x80/0xff를 독립 주입한 72개 양성을 typed 필드 재구성과 대조했습니다. 필수 prefix 잘림 24건 및 잘못된 모드를 거부하고 오류 뒤 정상 재호출을 확인했습니다.
4. shape-group-02.hwp(다각형 2개), group-drawing-02.hwp(사각형/선 34개), shape-001.hwp(다각형 2개)에서 실제 38개 테두리를 대조했습니다. 부모 관계로 구성요소 ID 배치를 정하고 Rendering count에서 끝 위치를 계산해 해당 도형의 테두리 시작을 찾았습니다. $con 등의 다른 종류 꼬리를 테두리로 파싱하지 않습니다. Node/코어 압축 해제도 대조했습니다.
5. 실제 테두리의 필수 prefix 잘림 494건을 거부했습니다. 테두리 이후의 채우기/그림자 바이트는 extra로 원문 보존하며 이번에 의미를 추정하지 않습니다. 원본 파일은 수정하지 않았고 표본이 없으면 skipped입니다.

이번 단계는 테두리 전용 파서와 공통 속성 view입니다. 도형 종류별 테두리 파서 선택·문서 검사 연결, 채우기/그림자/글상자 꼬리, 선 모양·화살표 렌더링 의미는 남았습니다. 실제 payload 대조를 전체 테두리 의미나 해당 파일의 추가 문서 검증 완료로 계상하지 않습니다.

최종 Debug·ReleaseSafe·ReleaseFast audit: 모드별 네이티브 184/184, Node 47/47, HWP5 WASM 191,191회 검사 통과(참조 표본 존재). CFB 12,000회 변이에서 trap 0이며 포맷·diff 검사도 통과했습니다.

## 관측 도형 스타일의 채우기 경계·종류별 alpha·그림자 (2026-09-06)

공식 표 81은 그리기 공통 속성에 테두리·채우기 정보를 포함합니다. rhwp parser/doc_info.rs 및 parser/control/shape.rs와 실제 원문을 대조하면 채우기 additional 블록 뒤에 활성 종류별 바이트가 pattern→gradient→image 순서로 있으며, 이어서 그림자 kind(u32), color(u32), offset_x/y(i32)의 16바이트가 있습니다. 명세에 충분히 정의되지 않은 부분은 관측 배치로 한정합니다.

`drawing_style.Style.parse`는 shape_border.Border.read와 기존 docinfo.Fill.parse를 재사용합니다. 기본 채우기 필드·gradient 배열·image 정보를 별도 구현하지 않습니다. 기존 Fill의 known.extra에서 fill_alpha.Alpha가 활성 종류별 원시 바이트를 읽고 shadow.Shadow가 다음 16바이트를 읽습니다. 이후 instance/예약/투명도 등의 미지 바이트는 extra로 남깁니다. 이 명명은 관측 해석이며 모든 버전의 의미나 조판 결과를 보장하지 않습니다.

Alpha의 pattern/gradient/image는 각각 ?u8이며 부재/null과 값 0을 구분합니다. 한 종류의 값이 0이라고 다른 종류의 값을 가져와 합치지 않습니다. 알 수 없는 Fill 비트는 후속 필드 순서를 바꿀 수 있으므로 Style.tail.unknown으로 전체 나머지를 보존하고 alpha/그림자를 추측하지 않습니다. 반대로 알려진 Fill에서 필수 바이트가 잘리면 오류이고 unknown으로 후퇴하지 않습니다. Fill의 원래 extra view는 유지하며 스타일을 조립한 이후의 미지 영역은 Style.tail.known.extra로 구분합니다.

### 구현 후 적대적 검증

1. 채우기 8가지 조합에서 pattern/gradient/image 바이트 순서와 부재를 네이티브로 대조했습니다. 첫 값 0과 뒤의 다른 값들이 별도로 보존됩니다. Alpha/Shadow의 모든 중간 잘림에서 Reader cursor가 그대로입니다.
2. 그림자 kind/색의 u32 상위 비트와 signed 좌표 최솟값·최댓값, 미지 꼬리를 대조했습니다. 미지 Fill 뒤에는 유효해 보이는 그림자 바이트가 있어도 해석하지 않으며 빈 unknown tail도 허용합니다.
3. WASM에서 두 테두리 배치 × 채우기 8가지 조합을 검사했습니다. additional 길이를 3으로 두어 한 바이트만 읽는 가정을 배제했고 image/gradient/pattern 조합의 alpha와 그림자를 독립 기대값에 대조했습니다. 합성 성공 36건·필수 prefix 잘림 거부 960건입니다.
4. 기존 실제 테두리 표본 38개에서 그 이후 채우기·alpha·그림자 경계도 추가 검증했습니다. 각 필수 영역의 잘림 1,866건을 거부하고 정상 재호출했습니다. 독립 JS 계산은 원문 길이/플래그에서 다음 필드 위치를 구하며 제품 보고서로 기대값을 생성하지 않습니다.
5. 기존 DocInfo Fill 파서와 BinData 참조 회귀를 함께 실행합니다. 새 코드가 Fill 기본 필드를 복제하거나 기존 parse 결과를 변경하지 않는 구조를 확인했습니다. 원본 파일은 변경하지 않았으며 실제 표본 부재는 skipped입니다.

이번 단계는 관측 도형 스타일 파서입니다. 종류별 파서 선택·문서 검사 연결·이미지 채우기의 참조 검증, 후반부 instance/예약 필드와 조판 효과는 남았습니다. 실제 스타일 payload 대조를 해당 파일의 추가 스타일 문서 검증 완료로 계상하지 않습니다.

최종 Debug·ReleaseSafe·ReleaseFast audit: 모드별 네이티브 186/186, Node 47/47, HWP5 WASM 194,145회 검사 통과(참조 표본 존재). CFB 12,000회 변이에서 trap 0이며 Zig 포맷·diff 검사도 통과했습니다. 로그는 `/tmp/hwpjs-drawing-style-{debug,safe,fast}.log`입니다.

## 도형 스타일 문서 연결 전 전체 참조 조사 (2026-09-06)

`tests/hwp5/drawing-style-survey.mjs`를 정규 audit에 연결했습니다. 공식 표 81의 그리기 종류를 대상으로 하되 그림/OLE/그룹/연결선의 다른 꼬리는 deferred로 구분합니다. 파일별 strict CFB, 헤더 기반 스트림 decode, 기존 shape_validation의 부모/ID 배치 검사를 먼저 통과해야 스타일 경계를 계산합니다. 미지원/실패 파일을 도형 부재로 세지 않습니다. 성공 스타일은 독립 JS 필드 계산과 실제 WASM 결과를 대조하며 WebAssembly trap 및 기대값 불일치는 조사 결과로 삼키지 않습니다.

현재 참조 536파일 중 계층 검사 완료 430, 보안 플래그 제외 4, 컨테이너/계층 진입 실패 102입니다. hierarchyCompleted는 전체 문서나 스타일 완료를 뜻하지 않습니다. 조사한 구성요소 5,584개 중 그리기 대상은 2,734개이며 스타일 성공 2,716, 실패 18입니다. 별도 형식 2,850개는 deferred입니다.

| 종류 | 구성요소 | 스타일 성공 | 스타일 실패 | 미검사 |
| --- | ---: | ---: | ---: | ---: |
| 사각형 `$rec` | 2,175 | 2,157 | 18 | 0 |
| 선 `$lin` | 266 | 266 | 0 | 0 |
| 타원 `$ell` | 139 | 139 | 0 | 0 |
| 다각형 `$pol` | 146 | 146 | 0 | 0 |
| 곡선 `$cur` | 8 | 8 | 0 | 0 |
| 그림/OLE/그룹/연결선 | 2,850 | 0 | 0 | 2,850 |

호 `$arc`는 이 조사에서 표본이 없었습니다. 성공한 스타일은 모두 그림자 뒤 6바이트를 extra로 보존했습니다. 이것만으로 후반부 필드 의미나 모든 버전의 고정 길이를 확정하지 않습니다.

새로 재현한 호환성 차이:

- `issue2559/1341000_research_report_footnotes.hwp`: 헤더 5.0.1.7, localVersion 1, 사각형 17개. 스타일 길이 21 = 관측 테두리 13 + Fill flags 4 + additional 길이 4이며 flags/additional 길이가 0입니다. alpha/그림자 필수 배치로 읽으면 UnexpectedEnd입니다.
- `issue5714/1490000-200800034_vietnam_labor_report.hwp`: 헤더 5.0.0.6, localVersion 1, 사각형 1개. 스타일 길이 51 = 테두리 13 + flags 4 + gradient 29(색 2개) + additional 길이 4 + additional 1입니다. 역시 그 뒤 alpha/그림자가 없어 UnexpectedEnd입니다.

두 파일의 개수·길이·버전·오류를 회귀 assertion으로 고정했습니다. 이 assertion은 현 파서의 지원 한계 재현이며 파일 손상 판정이 아닙니다. 스타일을 문서 검사에 무조건 연결하거나 짧은 입력에 자동 fallback하는 변경은 하지 않았습니다. **다음 구현에는 그림자 없는 명시적 배치와 그 선택 근거가 필요하며, 정확한 전환 버전은 아직 입증하지 못했습니다.**

적대적 검토에서는 (1) 표본 38개 편향을 재귀 전체 조사로 확장, (2) 진입 실패/보안/계층 완료 분리, (3) 스타일 실패/unknown/deferred 분리 및 합계 검증, (4) 호 표본 부재 명시, (5) 실제 구형 18개 오류를 재현했습니다. 파일 이름의 URL 예약문자 오해를 피하려고 파일시스템 경로로 읽으며 원본 파일을 수정하지 않습니다. 제품 파서·문서 검사 동작은 이 단계에서 변경하지 않았습니다.

Debug·ReleaseSafe·ReleaseFast audit 모두 통과: 모드별 네이티브 186/186, Node 47/47, HWP5 WASM 200,705회 검사. 로그 `/tmp/hwpjs-style-survey-{debug,safe,fast}.log`에 파일별 진입 실패와 스타일 예외를 남겼습니다. audit 통과에는 위 18개 예상 오류의 재현이 포함되며 해당 스타일 지원 완료를 뜻하지 않습니다.

## 그림자 없는 명시적 도형 스타일 배치 (2026-09-06)

`drawing_style.Style.parseWithTail(bytes, border_layout, tail_layout)`을 추가했습니다. tail_layout은 fill_only/alpha_shadow이며 기존 parse는 alpha_shadow 호출로 유지합니다. 두 경로 모두 Border와 Fill의 기존 파서를 재사용합니다. fill_only는 Fill 이후 바이트를 Tail.fill_only에 원문 그대로 빌리고, alpha·그림자 구조체를 만들지 않습니다. 미지 Fill 비트는 두 경로 모두 Tail.unknown으로 남습니다. 따라서 필드 부재와 값 0, 미지 형식을 구분합니다.

문서 버전/길이 기반 자동 선택과 오류 후 fallback은 추가하지 않았습니다. 전체 참조 조사의 두 구형 파일에 한해서 명시적으로 fill_only를 호출해 18개 원문을 대조했습니다. 기존 alpha_shadow 조사에서는 같은 입력의 UnexpectedEnd를 계속 검증하며, 별도 fillOnly.parsed에 성공을 기록합니다. 이는 두 파서 배치의 차이이며 전환 버전 발견이나 파일 손상 판정이 아닙니다.

### 구현 후 적대적 검증

1. 네이티브에서 동일 바이트를 fill_only/alpha_shadow로 각각 읽어, 꼬리 raw 보존과 0인 그림자/그림자 부재의 구별을 확인했습니다. fill_only view의 포인터도 입력의 정확한 위치를 빌립니다.
2. 실제 51바이트 gradient 원문을 네이티브에 고정해 선 폭 200, gradient 종류 2, 중심 50/50, blur 80, 색 0x00ffffff/0x00ff6633, additional 80을 독립 기대값과 대조했습니다. 추가 alpha를 만들어내지 않습니다. count 0xffffffff 변이를 거부합니다.
3. WASM에서 두 테두리 폭 × 두 꼬리 배치 × Fill 8조합을 대조했습니다. unknown flags·extra 보존·잘못된 모드·모든 필수 prefix 잘림·오류 뒤 정상 재호출을 검사합니다. fill_only 합성 입력을 alpha_shadow로 읽으면 계속 오류입니다.
4. 실제 구형 18개가 fill_only로 성공했고, 이들의 필수 prefix 잘림 408건은 모두 거부했습니다. 입력 끝에 유효해 보이는 shadow 바이트가 추가되어도 fill_only는 이를 extra로 보존하며 자동 승격하지 않습니다.
5. 기본 Fill 코드를 복제하거나 변경하지 않았으며 기존 2,716개 alpha_shadow 표본 대조를 유지했습니다. 미검사 종류/진입 실패 파일은 완료로 세지 않고 원본 파일은 변경하지 않았습니다.

다음 범위는 실제 버전·종류별 배치 선택 근거와 문서 검사 연결, 이미지 채우기 참조 검증입니다. 이 단계의 명시적 구형 배치 지원을 전체 문서 자동 파싱 완료로 해석하지 않습니다.

최종 Debug·ReleaseSafe·ReleaseFast audit: 모드별 네이티브 188/188, Node 47/47, HWP5 WASM 201,898회 검사 통과. CFB 12,000회 변이에서 trap 0, Zig 포맷·diff 검사 통과. 로그는 `/tmp/hwpjs-style-fill-only-{debug,safe,fast}.log`입니다.

## 도형 스타일 배치와 헤더/localVersion 상관 검증 (2026-09-06)

전체 참조 조사에 헤더 버전/localVersion별 독립 집계를 추가하고, 종류별 성공·미지·오류 및 명시적 fill_only 성공 합계와 교차 검증합니다. 실제 두 배치 모두 localVersion=1임을 회귀 검사로 남겼습니다. localVersion을 shadow 유무 선택에 사용하는 규칙은 반례가 있으므로 채택하지 않습니다.

| 헤더 버전 | localVersion | alpha_shadow 성공 | alpha_shadow 실패 / 명시적 fill_only 성공 |
| --- | ---: | ---: | ---: |
| 5.0.0.6 | 1 | 0 | 1 / 1 |
| 5.0.1.7 | 1 | 0 | 17 / 17 |
| 5.0.2.4 | 1 | 247 | 0 / 0 |
| 5.0.3.0 | 1 | 338 | 0 / 0 |
| 5.0.3.2 | 1 | 2 | 0 / 0 |
| 5.0.3.4 | 1 | 23 | 0 / 0 |
| 5.0.4.0 | 1 | 1 | 0 / 0 |
| 5.0.5.0 | 1 | 98 | 0 / 0 |
| 5.1.0.1 | 1 | 1,092 | 0 / 0 |
| 5.1.1.0 | 1 | 915 | 0 / 0 |

위 표는 관측 표본에 한정됩니다. 5.0.1.8~5.0.2.3 등의 중간 버전, 편집/저장 프로그램이 서로 다른 파일의 혼합 배치, 실제 한글 조판 결과는 입증하지 않습니다. 5.0.2.0/5.0.2.1 등의 임의 cutoff를 만들지 않았습니다.

독립 [hwplib ForShapeComponent](https://github.com/neolord0/hwplib/blob/4dc9673942bb8d977405122c3fed758af104cccd/src/main/java/kr/dogfoot/hwplib/reader/bodytext/paragraph/control/gso/part/ForShapeComponent.java)의 normal 경로는 common/line/fill/shadow 뒤 레코드 끝인지 검사해 반환합니다. localVersion은 읽어서 저장하지만 그 값으로 shadow 유무를 분기하지 않습니다. 이 코드도 정확한 버전 전환의 근거는 아닙니다. 조회는 소스 비교이며 hwplib 실행이나 코드 이식이 아닙니다.

적대적 검증 결과: localVersion 단독 선택 가설은 실제 표본으로 배제했습니다. 헤더 버전의 전환 가설은 표본 공백 때문에 미확정입니다. 문서 연결은 자동 버전 추정을 전제로 미루지 않고 **호출자가 명시적으로 선택한 배치 옵션을 전달하는 방식**으로 진행할 수 있습니다. 기본 정책과 미선택 진단을 분리하고, 선택된 배치에서의 잘림을 다른 배치로 자동 복구하지 않는 계약이 필요합니다.

Debug·ReleaseSafe·ReleaseFast audit 모두 통과: 모드별 네이티브 188/188, Node 47/47, HWP5 WASM 201,898회 검사. 새 버전별 합계/반례 assertion은 JS 검증이며 WASM 호출 수 증가로 계상하지 않습니다. 로그는 `/tmp/hwpjs-style-version-{debug,safe,fast}.log`입니다. 제품 파서 선택 정책은 이 조사 단계에서 변경하지 않았습니다.

## 명시적 도형 스타일의 문서 검사 연결 (2026-09-06)

document.Options.drawing_style에 선택적 `{ border, tail }` 설정을 추가했습니다. 기본 null은 배치를 추정하지 않고 unselected로 보고합니다. 선택된 경우 fill_only/alpha_shadow 및 spec11/observed13의 필수 필드를 검사하며 잘림은 오류로 전파합니다. container의 기존 document 옵션을 통해 동일한 설정을 전달할 수 있습니다.

`shape_validation.inspectDetailed`는 기존 한 번의 Tree 순회와 Component 파싱 결과를 재사용해 기존 shapes 및 새 drawing_styles 보고서를 함께 반환합니다. 기존 inspect는 shapes만 반환하는 호환 경로입니다. `drawing_style_validation.zig`는 타입 선택·스타일 검사·진단 누적만 담당하며 부모 판정/기하 필드를 재파싱하지 않습니다. 실제 읽기는 기존 Style/Border/Fill/Alpha/Shadow가 계속 소유합니다.

drawing_styles는 supported/unsupported/unselected/parsed/unknown/extra_bytes 여섯 필드입니다. supported = unselected + parsed + unknown이고, supported + unsupported는 구성요소 수입니다. unsupported는 그림/OLE/그룹/연결선 등 다른 꼬리 형식을 뜻합니다. parsed는 선택한 필드 배치 검사이지 이미지 참조·렌더링 검증 완료가 아닙니다. shapes.extra_bytes는 구성요소 전체 꼬리, drawing_styles.extra_bytes는 선택한 스타일에서 남은 영역이므로 두 값을 단순 합산하지 않습니다.

### 구현 후 적대적 검증

1. 네이티브에서 unsupported/unselected/unknown/parsed를 각각 구분하고, 선택된 스타일 파싱 실패 시 보고서가 부분 증가하지 않는지 검사했습니다. 옵션 미선택 상태의 빈 스타일을 정상 스타일로 계상하지 않습니다.
2. 새 테스트 모드 54(명시적 decoded document)와 55(명시적 CFB)를 추가하고 옵션 모드 해석을 공유했습니다. 기존 24/25도 새 여섯 진단을 직렬화합니다. 독립 report-wire는 구역 stride 512바이트이며 기대 위치 검사를 갱신했습니다.
3. 실제 신형 세 파일·구형 두 파일의 도형 스타일을 문서와 CFB 경로로 검사합니다. 스타일 부분만 제거한 레코드를 만들되 부모/기하/레코드 경계는 유지해, 선택된 문서 검사가 UnexpectedEnd를 내는지 확인합니다. 같은 입력의 미선택 검사는 성공하더라도 unselected로 남습니다.
4. 실제 스타일의 원시 flags로 만든 unknown 변이를 서로 다른 두 구역에 배치했습니다. 구역 0은 unknown=0, 구역 1은 unknown=1이며 입력 순서를 뒤집어도 정규화된 보고서가 같습니다. 미지 스타일을 다른 배치로 재시도하지 않습니다.
5. 선택 모드의 전체 문서 기대값은 기본 문서의 비스타일 필드와 독립 JS 스타일 경계 계산으로 구성합니다. CFB 결과는 decoded 문서 보고서와 나머지 컨테이너 보고서를 모두 대조합니다. 원본 파일은 수정하지 않았습니다.

이미지 채우기 참조 검증, 스타일 후반부 6바이트 의미, 미지원 도형 종류별 payload, 배치 자동 선택과 조판은 남아 있습니다. 기본 null 정책을 전체 스타일 자동 검증 완료로 설명하지 않습니다.

최종 실제 5파일의 스타일 56개 검사, 스타일 제거 변이 56개 거부, 구역 순서 반전 5건 통과. Debug·ReleaseSafe·ReleaseFast audit 모두 네이티브 189/189, Node 47/47, HWP5 WASM 202,112회 검사 통과. CFB 12,000회 변이에서 trap 0이며 포맷·diff 검사도 통과했습니다. 로그는 `/tmp/hwpjs-style-document-{debug,safe,fast}.log`입니다.

## 도형 이미지 채우기의 BinData 참조 범위 (2026-09-06)

공식 표 28/32의 이미지 채우기 Picture.bin_data_id를 기존 DocInfo Fill과 동일한 reference_rules.one_based로 검사합니다. document가 실측 counts.bin_data_count를 shape_validation.inspectDetailed에 전달하고, 스타일 진단은 이미 파싱된 Fill.image를 사용합니다. ID 디코딩·참조 기준·DocInfo 개수 계산을 별도 구현하지 않습니다.

ID 0과 count 초과는 InvalidShapeImageReference입니다. 참조 실패 시 스타일 보고서가 부분 증가하지 않습니다. known Fill에서 image가 존재하는 경우에만 검사하며 unselected/unknown/unsupported는 이미지 ID처럼 보이는 원문이 있어도 참조를 추측하지 않습니다. 새 image_references는 성공한 활성 참조 개수이고 나머지 진단을 완료로 상쇄하지 않습니다. 구역 wire에는 7번째 스타일 진단을 추가해 stride가 516바이트가 됐습니다.

### 구현 후 적대적 검증

1. 네이티브에서 두 tail 배치 × BinData 수 0/1/2/65535 × ID 0/1/2/3/65534/65535의 48조합을 검사했습니다. 직접 기대 조건 `id != 0 && id <= count`와 대조하며 제품 resolver로 기대값을 만들지 않았습니다. 실패 뒤 보고서는 초기 상태를 유지합니다.
2. 배치 미선택·미지 Fill 비트·그림 종류 미지원은 이미지 참조 검사 완료로 계상하지 않습니다. 기존 이미지 없는 known Fill은 BinData가 0개여도 통과합니다. Fill/그림 정보 파서와 DocInfo 참조 검사는 수정하지 않았습니다.
3. 전체 조사에서 이미지 채우기는 `basic/BookReview.hwp`의 Section1에 3개, 원본 ID 순서 1/3/2였습니다. 이 파일을 명시적 스타일 문서/CFB 회귀 집합에 추가했습니다. 전체 문서 검사상 유효하며 스타일 10개, 활성 이미지 참조 3개를 검사했습니다.
4. 각 실제 참조를 0/count+1/65535로 바꾼 9개 문서 입력과 9개 재작성 CFB가 InvalidShapeImageReference를 반환했습니다. CFB는 해당 Section만 재압축하고 나머지 노드를 유지합니다. 각 오류 뒤 원본을 재검사했습니다. 미선택 문서 입력은 image_references=0이며 이를 유효한 참조로 표시하지 않습니다.
5. 각 실제 ID를 1/count로 바꾼 유효 경계값 6개는 같은 검사 보고서를 반환합니다. 스타일 이미지 offset은 기존 독립 JS Fill 계산에서 전달해 변이 테스트에 필드 파서를 복제하지 않았습니다. 두 구역의 서로 다른 unknown 진단/순서 반전 및 기본 보고서 위치 검증도 유지했습니다.

이번 단계는 DocInfo BinData 목록에 대한 참조 범위 검사입니다. 참조 대상의 그림 코덱 지원·시각적 일치·그림/OLE 개체의 다른 참조 체계를 완료로 주장하지 않습니다. 원본 파일은 수정하지 않았습니다. 전체 문서 검증은 계속 진행 중입니다.

최종 Debug·ReleaseSafe·ReleaseFast audit 모두 통과: 모드별 네이티브 190/190, Node 47/47, HWP5 WASM 202,206회 검사. 선택적 스타일 문서/CFB 집합은 6파일·66스타일이며 스타일 제거 변이 66건·구역 순서 반전 6건도 통과했습니다. CFB 12,000회 변이 trap 0, 포맷·JS 구문·diff 검사 통과. 로그는 `/tmp/hwpjs-style-image-{debug,safe,fast}.log`입니다.
