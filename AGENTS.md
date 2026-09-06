# hwpjs 개발 가이드

## 프로젝트

HWP/HWPX 읽기·편집·저장을 목표로 하는 Zig 0.16.0 / WebAssembly 라이브러리입니다.
현재는 바이트 리더, CFB v3/v4 읽기·strict 검증·새 컨테이너 생성/재저장, HWP5 헤더·압축 스트림·레코드 경계와 DocInfo 주요 리소스 해석·활성 참조 검증, 본문 문단 헤더·UTF-16 텍스트/제어문자 토큰 코어가 구현되어 있습니다. HWP/HWPX 전체 문서 모델·레이아웃·본문 편집·저장은 미구현입니다. HWP5 코어는 테스트용 WASM에서 검증하며 제품 JS 공개 API는 아직 CFB만 제공합니다. 지원 범위는 구현·테스트로 확인하고, 예정 기능을 완료된 기능처럼 설명하지 않습니다.

## 구조와 참고 자료

- `src/binary/`: 경계 검사와 바이너리 읽기.
- `src/cfb/`: 읽기·검증·저장을 책임별로 분리한 CFB 코어.
- `src/hwp5/`: 헤더 원본·버전·스트림 정책·압축 trailer·레코드 framing을 분리합니다. [구현/검증 기록](docs/hwp5-foundation.md)을 참조합니다.
- `src/hwp5/document/`: types는 입력/소유권/보고서, docinfo는 리소스 검증 연결, section은 기존 본문 검사기 조립, validation은 헤더 지원 정책·구역 수/인덱스·전역 한도를 소유합니다. inspectDecoded 입력은 이미 압축 해제된 스트림이며 CFB를 검색하지 않습니다. 구역 보고서는 인덱스 순서로 소유하고 DocInfo 원문 슬라이스는 빌립니다. 레벨·ID·구역 정의 첫 문단 조건 등 기존 의미 규칙을 이 계층에 복제하지 않습니다.
- `src/hwp5/container/`: paths는 CFB 계층 조회와 정규 Section/BinData 이름, sections는 직접 BodyText 자식의 bounded decode, binaries는 항목별 압축/외부 링크 보류, validation은 파일 단위 수명과 총 decode 한도를 소유합니다. strict CFB와 findExact만 사용하며 동명 basename fallback·외부 링크 접근·압축 실패 후 원본 fallback을 금지합니다. 반환 보고서는 DocInfo backing을 소유하므로 입력 CFB를 해제해도 유효합니다. uninspected 스트림은 완료로 세지 않습니다.
- `hwp5/preview/text.zig`는 길이 접두사 없는 raw UTF-16LE 미리보기 뷰/진단, `container/preview.zig`는 선택 루트 PrvText 조회와 전체 소비 한도를 소유합니다. 본문 제어문자 문법·NUL 종결·BOM 제거·2048바이트 상한을 임의 적용하지 않습니다. 고립 서로게이트는 치환하지 않고 수치로 진단합니다. 검사 보고서 존재를 무조건 Unicode 정상 판정으로 해석하지 않습니다.
- `src/hwp5/body/`: 문단 헤더·제어코드 종류/너비·UTF-16 토큰·태그 dispatch를 분리합니다. 토큰 위치는 Unicode 문자 수가 아닌 원본 UTF-16 단위이며, 컨트롤 데이터를 텍스트나 실제 메모리 포인터로 취급하지 않습니다. 계층/DocInfo 참조/개체 연결은 별도 조립 책임입니다.
- 본문 `char_runs.zig`·`line_segments.zig`·`range_tags.zig`는 고정 행 해석, `metadata.zig`는 호출자가 연결한 헤더 개수/위치/글자 모양 ID 검증을 소유합니다. `binary/record_array.zig`는 고정 폭 배열 경계만 공유합니다. 영역 중첩과 signed 줄 값·미지 플래그는 보존하며 페이지를 추정하지 않습니다.
- `control_header.zig`는 4바이트 ID/속성 원본, `list_header.zig`는 문단 수 원값과 명시적 spec6/observed8 배치를 소유합니다. 리스트 배치를 길이·버전만으로 자동 선택하지 않습니다. 컨트롤별 속성과 리스트 소유권 검증은 별도입니다.
- `body/tree.zig`는 level 기반 부모/서브트리 인덱스를 할당·소유하고 payload는 입력을 빌립니다. `paragraphs.zig`는 직접 자식 연결·중복/고아·문단 참조 검증을 소유합니다. 리스트 헤더 뒤 문단은 같은 level의 형제일 수 있으며 리스트를 가짜 부모로 만들지 않습니다. 보고서의 missing/pending/unknown은 완료로 세지 않습니다.
- `section_def.zig`·`page_def.zig`·`page_border.zig`는 구역/용지/쪽 테두리 payload, `section_validation.zig`는 구역 소유권/개수/참조 검증을 소유합니다. 구역 하위 레코드를 본체에 붙은 바이트로 읽지 않습니다. 번호 ID 0은 보류 항목입니다.
- 각주 payload는 `note_shape.zig`에서 추가 해석합니다. 기본 28바이트/i32 구분선 길이, 명시적 spec26 경로를 구분하며 자동 길이 fallback을 금지합니다. `section_validation`은 note_shapes 개수를 보고하고 주석 문단/번호 의미는 별도입니다.
- `control_links.zig`는 같은 문단의 확장 텍스트 토큰과 컨트롤 헤더를 발생 순서/ID로 연결합니다. `paragraph_children.zig`는 문단 직접 자식 수집/중복 검사의 SSOT이며 paragraphs와 links가 공유합니다. 연결 성공과 개별 컨트롤 의미 검증을 구분합니다.
- `column_def.zig`는 cold의 공통 간격/개별 너비·간격 배치를 소유합니다. count 1 또는 동일 너비와 가변 너비를 구분하며, 개별 쌍은 record_array를 재사용합니다. section_validation에서 부모/개수를 검사하고 단위/레이아웃을 임의 보정하지 않습니다.
- `list_groups.zig`는 같은 부모의 리스트 헤더 사이에서 직접 문단을 묶고 count_raw와 대조합니다. 중간 표/개체 레코드가 있다고 그룹을 닫지 않으며, Tree의 부모를 변경하지 않습니다. 그룹 범위/개수 검증과 셀/캡션 속성 검증은 구분합니다.
- `control_rules.zig`는 공식 ID/코드 대응과 MAKE_4CHID의 SSOT, `control_type_validation.zig`는 연결 결과의 종류 검증을 소유합니다. 미지 ID는 deferred로 남기며 접두사나 잘못된 요약 별칭으로 자동 분류하지 않습니다.
- `object_common.zig`는 tbl/gso/eqed 헤더의 공통 속성만 해석합니다. ID는 control_rules를 공유하고 UTF-16 길이 검사는 utf16_string을 재사용합니다. 설명 부재/빈 값, signed 위치와 unsigned 크기, 원시 플래그/꼬리를 보존하며 캡션·셀·도형 자식 레코드를 인라인 속성으로 소비하지 않습니다.
- `table.zig`·`table_cell.zig`·`caption.zig`는 payload, `table_zone.zig`는 원시 좌표/명시적 열-행 또는 행-열 view, `table_lists.zig`는 TABLE 전후 직접 형제의 캡션/셀 역할을 소유합니다. `table_validation.zig`는 부모·중복·셀 수·병합 범위·영역/참조를 검사합니다. list/zone 배치는 호출자가 선택하며 길이로 자동 추정하지 않습니다. 확장 꼬리 의미와 시각적 배치는 미검증 범위입니다.
- `table_grid.zig`는 Rectangle의 병합 경계 SSOT, 행별 시작 셀 수, 비중첩/완전 격자 채움을 소유합니다. table_validation은 할당자를 받아 이 검사를 호출합니다. 칸 수만큼 메모리를 할당하거나 총면적만으로 비중첩을 가정하지 않습니다. 공유 행 경계에서는 제거를 추가보다 먼저 처리합니다.
- `cell_attributes.zig`는 호출자가 선택한 list view의 셀별 bit 16~19를 해석하고 원값을 보존합니다. `cell_extension.zig`는 명시적으로 선택한 관측 꼬리의 선택 text_width/marker와 remaining 원문만 소유합니다. 0xff는 ParameterSet 표시이지 고정 offset 필드명이나 유효성 보장이 아닙니다. Cell.parse는 여전히 꼬리 전체를 보존하며 자동으로 확장 형식을 가정하지 않습니다.
- `hwp5/parameters/types.zig`는 배치/노드 계약, `parser.zig`는 bounded ParameterSet 트리를 소유합니다. 헤더 4/6바이트와 NULL 4/0바이트 선택을 숨기지 않으며 배열은 관측 shared-ID 형식입니다. 원본 정수 4바이트/UTF-16과 소비하지 않은 꼬리를 보존합니다. 알 수 없는 타입을 건너뛰지 않고 UnsupportedParameterType으로 반환합니다. `cell_field.inspect`는 이 공통 파서로 지정된 root set의 직접 이름 항목만 검사합니다.
- `parameters/references.zig`는 중첩 PIT_BINDATA의 1-based 참조, `sources.zig`는 DocData/ControlData/표 셀 확장 순회와 진단 집계를 소유합니다. `cell_field.fromDocument`를 재사용해 같은 Set을 다시 파싱하지 않습니다. UnsupportedParameterType만 보류로 바꾸고 잘림·한도·참조·셀 이름 오류는 전파합니다. parsed/unsupported/opaque/trailing을 전체 완료 수로 합산하지 않습니다.
- `src/hwp5/docinfo/`: 문서 속성·ID 매핑·BinData·FaceName·TabDef·Numbering·Bullet·Style payload와 태그 dispatch·리소스 개수 검증을 분리합니다. 번호/글머리표의 공통 머리 정보는 `paragraph_head.zig`가 소유합니다. 실제 필드 부재(null)와 값 0, 버전상 기대 슬롯 수를 구분합니다. BinData/글꼴 개수 검증과 전체 문서 조립/참조 검증을 혼동하지 않습니다.
- `src/compression/`: bounded raw DEFLATE와 MIT Zig 디코더 로컬 수정본. HWP 플래그·trailer 정책을 넣지 않습니다.
- `src/hwp5/docinfo/resources.zig`: 주요 리소스 실측 개수와 ID 매핑 비교. `reference_rules.zig`는 ID 기준/부재 값, `references.zig`는 활성 참조 순회·진단을 소유합니다. `validateKnown()` 성공을 전체 문서 유효성으로 해석하지 말고 deferred/unknown_records와 미검증 범위를 확인합니다.
- `src/hwp5/docinfo/border_fill.zig`, `fill.zig`, `char_shape.zig`, `para_shape.zig`: 테두리·채우기·글자·문단 모양을 분리합니다. 그림 정보의 5바이트 배치는 `picture_info.zig`에서 글머리표와 공유합니다. 미지의 채우기 비트는 후속 필드 순서를 추정하지 않고 원본 보존합니다.
- `src/wasm/`, `js/`: WASM 메모리·문서 수명·엔트리 변환별 어댑터.
- ABI 필드·버전·편집 모델 wire 형식은 `js/abi-schema.mjs`에서 정의합니다. 생성된 Zig 선언과 일치해야 하며 빌드에서 검사합니다. 레거시 검색은 `find.zig`, 명세 이름 비교·정렬·검색은 `name_order.zig`, 읽기/쓰기 공통 메타데이터 규칙은 `entry_rules.zig`에 둡니다.
- `src/root.zig`: Zig 라이브러리 진입점.
- `src/wasm.zig`: 브라우저용 WASM ABI 진입점.
- `build.zig`: 빌드·테스트 정의.
- `docs/architecture.md`: 모듈 책임과 구현 순서.
- `legacy/rust/`: 이전 구현·fixture·명세. 요청된 비교나 수정에만 사용합니다.
- `reference/`: 외부 참고 소스. 제품 의존성으로 자동 포함하지 않습니다.

HWP5 구현 시 `legacy/rust/documents/docs/spec/hwp-5.0.md`와 `legacy/rust/.claude/skills/hwp-spec/`의 해당 파트를 확인합니다. 레거시 설계·개발 규칙을 신규 Zig 코드에 그대로 적용하지 않습니다.

## 구현 원칙

- CFB 컨테이너, HWP5 레코드, HWPX ZIP/XML, 문서 모델, WASM ABI의 책임을 분리합니다.
- 코어는 메모리 기반으로 설계합니다. 파일시스템·시계·브라우저 API 의존성은 경계에서 주입합니다.
- 할당자와 버퍼 소유권·수명을 명확히 하고, 실패 경로에서도 메모리를 정리합니다.
- 외부 입력의 크기·오프셋·오버플로·순환 참조를 검사하고, 예상 가능한 입력 오류는 오류 값으로 반환합니다.
- 버전별 필드 부재와 기본값을 구분합니다. 미지원 레코드·스트림의 보존 또는 손실 여부를 명시합니다.
- 저장은 새 컨테이너 생성부터 구현합니다. 무손실 저장 주장은 독립 구현과의 비교로 검증합니다.
- GPL/LGPL 의존성은 제외합니다. 외부 코드를 채택·이식하기 전에 라이선스를 확인합니다.

## 검증

```sh
zig fmt --check build.zig src
zig build test
zig build -Doptimize=ReleaseSafe
zig build compare -Doptimize=ReleaseSafe
zig build audit -Doptimize=ReleaseSafe
```

파서·writer 변경에는 정상 입력뿐 아니라 잘림·잘못된 참조·크기 경계 테스트를 추가합니다. WASM ABI 변경은 실제 WebAssembly 인스턴스에서 확인합니다. 문서만 변경한 경우 관련 링크·경로·내용 검증으로 충분합니다.

## 작업과 커밋

- 한국어로 변경 결과와 남은 제한을 간결하게 설명합니다.
- 기존 사용자 변경을 보존하고, 무관한 변경은 커밋에 포함하지 않습니다.
- 검증 후 별도 브랜치·PR 없이 `main`에 직접 커밋·푸시합니다.
- 푸시 전 원격 변경을 확인하며, 강제 푸시나 스냅샷 일괄 승인은 하지 않습니다.
- 커밋 메시지는 `commit-rules.md`를 따릅니다.
