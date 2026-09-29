# HWP5 읽기 전용 문서 모델 첫 연결

[HWP5 모듈 인덱스](hwp5-modules.md) · [아키텍처](architecture.md)

`src/model/document.zig`는 포맷 어댑터가 채우는 소유 `Document → Section → Paragraph → Token` 구조를 정의합니다. `src/hwp5/model_projection.zig`의 `fromDecodedSections`는 이미 압축 해제된 Section 바이트를 공통 HWP5 record framing·계층·문단 헤더·텍스트 토큰 파서로 읽고, 선택한 값을 복사합니다. 입력 Section의 소유권은 호출자에게 있고 반환 모델의 소유권은 호출자에게 이전됩니다. `deinit(allocator)`로 해제합니다.

`fromFile`은 HWP 바이트에서 바로 같은 모델을 만듭니다. `src/hwp5/text_source.zig`가 CFB 열기·FileHeader 정책·DocInfo 구역 수·Section 이름/압축 해제를 소유하고 기존 `text_preview.zig`와 이 경로가 함께 사용합니다. `fromDecodedSections`는 그 파일 경계를 다시 구현하지 않습니다.

현재 coverage는 `paragraph_text_and_style_references`뿐입니다. 구역 순서와 각 문단의 원본 node/parent index, 선언 UTF-16 단위 수, 텍스트 레코드 존재 여부, 문단 모양·스타일 ID, UTF-16LE 원문 토큰과 제어 토큰, 문자 모양 run의 시작 위치·ID를 보존합니다. node index는 구역 안에서만 유효하고 `parent_node`는 record 트리 부모이지 논리적 목록 소유자는 아닙니다. 문단 목록에는 표·개체 아래 중첩 문단도 원본 node 순서대로 들어가며, `parent_node == null`인 문단만 최상위 문단입니다. 누락 텍스트와 길이 0인 텍스트 레코드를 구분합니다. 문단의 직접 자식 중 투영하지 않은 레코드 수와 구역의 전체 원본 레코드 수를 드러냅니다. 본문 텍스트·run의 기존 파서와 소유 관계 검사를 재사용하고, 중복 run·선언 개수/위치 불일치는 거부합니다. 구역 0개나 미지원 버전도 허용하지 않습니다. 구역 1,024개, 전체 decoded Section 64 MiB, 전체 레코드 1,000,000개 한도를 적용합니다.

이 모델은 **읽기 전용 부분 투영**입니다. 미투영 레코드의 원본 payload, DocInfo 리소스의 실제 내용, 문단/문자 모양 ID의 참조 해결, 표·개체·조판, 편집·저장은 포함하지 않습니다. 따라서 `deferred_direct_records == 0`도 무손실 저장을 뜻하지 않습니다. HWPX 어댑터 역시 아직 연결되지 않았습니다. 반환 모델을 원본 문서 전체 또는 저장 가능한 IR로 취급하지 않습니다.

## 외부 JSON 계약

기존 Rust hwpjs의 `toJson(Buffer): string`은 파싱 구조를 직렬화합니다. 실제 `example.hwp` 출력의 최상위 키는 `file_header`, `doc_info`, `body_text`, `bin_data`, `preview_text`, `preview_image`, `scripts`, `xml_template`, `summary_information`이며, `body_text.sections[].paragraphs[]`는 `para_header`와 `records`를 갖습니다. 이 스키마는 현재 내부 `Document`와 다릅니다. 기존 공개 `toJson`을 호환 목표로 두되, 내부 모델을 그대로 JSON 직렬화하거나 누락 필드를 기본값으로 꾸며 내지 않습니다. Zig/JS 공개 `toJson`은 아직 제공하지 않으며, 별도 호환 어댑터와 필드별 실파일 대조가 필요합니다.

참고 `rhwp`는 HWP/HWPX 파서를 공통 `Document` IR에 연결하고 WASM `HwpDocument`의 조회·편집·렌더 메서드와 CLI별 JSON 결과를 그 위에 둡니다. `rhwp`의 JSON이 레거시 hwpjs `toJson`의 계약이라는 뜻은 아닙니다.

## 검증

`zig test src/root.zig -O ReleaseSafe --test-filter 'HWP5 projection'`은 합성 두 문단의 순서·참조·원문 수명·누락 텍스트, 잘못된 run 개수 거부, 실제 `example.hwp`의 15문단을 decoded Section 및 파일 입력 양쪽에서 조립한 결과, 모든 할당 실패 지점의 정리를 검사합니다. `noori.hwp`·`table.hwp`·`footnote-endnote.hwp`에서는 최상위 문단 수를 레거시 Rust `toJson`의 21·2·2개와 대조합니다. `noori.hwp`의 중첩 문단을 포함한 투영 목록은 65개이므로 전체 목록 길이를 레거시의 최상위 `sections[].paragraphs` 길이와 직접 비교하지 않습니다. 이 검사는 네 파일의 일부 구조만 확인하며 JSON 동일성이나 전체 corpus 동등성을 증명하지 않습니다.

2026-09-29 실측: 위 집중 검사는 파일 입력 경계의 할당 실패 전수 검사와 구역/버전 거부를 포함해 Debug·ReleaseSafe·ReleaseFast 각각 8/8 통과했습니다. 전체 `zig build test --summary all`은 5/5 단계·2,681/2,681 테스트 통과(종료 코드 0)했습니다. `zig build -Doptimize=ReleaseSafe`와 기존 JS 미리보기 15/15, 선택적 791경로 corpus 분류(미리보기 677, 독립 원시 텍스트 오라클 대조 가능 676개·459,401문단 전부 일치), `zig build hwp5-audit -Doptimize=ReleaseSafe --summary all` 10/10 단계·8,905,855회 검사·WASM imports 0이 통과했습니다. 기존 미리보기·감사가 새 모델의 모든 필드나 JSON 호환성을 자동으로 검증한다는 뜻은 아닙니다.
