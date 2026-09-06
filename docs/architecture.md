# Zig/WASM 구현 구조

바이트 리더와 CFB 읽기·strict 검증·새 컨테이너 쓰기를 구현했습니다. CFB의 각 책임은 개별 파일로 나누며, `reader.zig`는 소유권과 처리 순서를 조립합니다. 상세 API와 검증 범위는 [CFB 읽기·쓰기](cfb-reader.md)를 참고하세요.

```text
src/
  binary/      경계 검사·정수 읽기 (현재 구현)
  cfb/         컨테이너 읽기·검증·새 컨테이너 쓰기 (구현)
  compression/ bounded raw DEFLATE·MIT 디코더 경계 수정본 (구현)
  hwp5/        FileHeader·압축·레코드 경계·DocInfo 해석/참조 검증·본문 문단 헤더/텍스트 토큰 (구현), 문서 모델/나머지 의미 해석/쓰기 (예정)
  hwpx/        ZIP/XML 읽기·쓰기 (예정)
  model/       문서 공통 모델과 원본 정보 보존 (예정)
  root.zig     라이브러리 진입점
  wasm/        메모리 할당·CFB 수명·엔트리·원시 섹터 ABI
  wasm.zig     ABI 모듈 등록과 버전
js/            읽기·쓰기 API·메모리 복사·엔트리/편집 모델 변환·검색·Node 파일 입력
tests/cfb/     독립 JS 기준 구현과 비교, 브라우저 검증
tests/hwp5/    테스트 전용 WASM bridge·독립 zlib/레코드 oracle·적대적 검증 5회
```

CFB에는 HWP 문단·표·글꼴 로직을 넣지 않습니다. 파일·시계·브라우저 API에 직접 의존하지 않는 메모리 기반 읽기·쓰기를 우선합니다.

`hwp5/body/paragraph_header.zig`는 문단 헤더, `control.zig`는 제어코드 분류와 너비, `text.zig`는 원본 UTF-16 단위 위치를 가진 토큰, `reader.zig`는 태그 66~72 dispatch를 담당합니다. `char_runs.zig`·`line_segments.zig`·`range_tags.zig`는 각 행 배치, `binary/record_array.zig`는 빌린 고정 폭 배열 경계, `metadata.zig`는 문단의 선언 개수·위치·글자 모양 ID 검증을 소유합니다. `control_header.zig`는 ID/속성 원본, `list_header.zig`는 명시적으로 선택하는 spec6/observed8 배치를 소유합니다.

`body/tree.zig`는 레코드 level 기반 parent/subtree_end 인덱스를 선형 시간에 만들고 노드 배열을 소유합니다. payload는 입력을 빌립니다. `paragraphs.zig`는 문단 직접 자식을 연결하고 기존 개수/참조 규칙을 호출하며, 누락 텍스트·컨트롤/리스트 보류·미해석 레코드를 보고합니다. 논리적 리스트 범위는 list_groups가 별도로 제공하며 개체 모델·렌더링 문자열은 아직 만들지 않습니다.

`paragraph_children.zig`가 직접 자식 수집/중복 검사를 소유하고 paragraphs와 `control_links.zig`가 재사용합니다. control_links는 원본 문단/텍스트/컨트롤 노드와 UTF-16 위치를 가진 순서/ID 링크 배열을 소유합니다. 토큰의 나머지 부가정보와 개별 컨트롤 의미는 추정하지 않습니다.

`column_def.zig`는 단 정의의 동일/가변 너비 payload를 해석하고 section_validation이 문단 부모와 개수를 확인합니다. 가변 너비의 u16 쌍 배열은 binary/record_array를 재사용하며 공통 spacing의 부재와 값 0을 구분합니다. 실제 단 배치 계산은 별도 단계입니다.

`list_groups.zig`는 원래 Tree를 유지하면서 같은 부모의 리스트 헤더 사이를 그룹 범위로 나타내고 직접 문단 수를 대조합니다. 중간 표/개체 레코드와 중첩 그룹을 보존합니다. 그룹 배열을 소유하며 셀/캡션 등 개체 의미는 후속 검증 책임입니다.

`control_rules.zig`는 ID와 기대 제어코드의 순수 대응표, `control_type_validation.zig`는 기존 링크의 checked/deferred 종류 검증을 소유합니다. section_def/column_def도 같은 ID 상수를 재사용합니다. 연결·종류·payload 의미 검증을 서로 완료로 대체하지 않습니다.

태그 dispatch는 용지 73·각주/미주 모양 74·쪽 테두리 75도 포함합니다. `section_def.zig`·`page_def.zig`·`note_shape.zig`·`page_border.zig`는 각 payload 배치를 소유하고 `section_validation.zig`는 트리 기반 구역 소유권/개수/참조를 검증합니다. 구역 정의 본체와 하위 레코드를 섞지 않습니다. 각주 구분선 길이는 관측 i32 배치를 기본으로 하며 spec26은 명시적으로만 선택합니다. 주석 컨트롤 연결 및 번호 ID 0은 아직 남아 있습니다.

HWP5 기반의 책임 소유자·소유권·미지원 경계·검증 기록은 [HWP5 기반 구현](hwp5-foundation.md)에 모읍니다. 제품 JS ABI는 변경하지 않았고, 테스트 전용 bridge는 코어를 wasm32-freestanding으로 실행하기 위한 어댑터입니다.

DocInfo 리소스는 BinData·글꼴·탭·번호·글머리표·스타일·테두리/배경·글자 모양·문단 모양까지 해석합니다. `border_fill.zig`는 선 배열, `fill.zig`는 채우기 조합, `picture_info.zig`는 이미지 속성 공통 배치를 소유합니다. 문단 모양의 구/신 줄 간격을 임의로 하나로 합치지 않습니다. `resources.zig`는 주요 리소스 개수, `reference_rules.zig`는 ID 기준/부재 값, `references.zig`는 활성 참조 진단을 분리합니다. 본문 구역/외부 스트림 연결 및 미지원 리소스의 참조는 후속 단계입니다.

저장은 문서 모델 → HWP 레코드 → 압축된 스트림 목록 → 새 CFB 생성 순서로 구현합니다. 기존 파일의 섹터를 제자리 수정하는 기능은 초기 범위에 포함하지 않습니다.

버전별 필드 부재와 기본값을 구분하고, 미지원 레코드·스트림 및 보존에 필요한 CFB 메타데이터를 유지하는 정책을 설계해야 합니다. 단순 재저장도 정보 보존 검증 전에는 무손실이라고 주장하지 않습니다.

구현 순서: CFB 읽기 → 새 CFB 쓰기 → 전체 스트림 왕복 비교 → HWP5 최소 읽기·쓰기 → 편집 후 저장 → HWPX 공통 모델 통합. 각 단계에서 기존 Rust fixture, 독립 리더, 손상 입력 테스트로 검증합니다.

CFB 단계의 현재 경계: 읽기 기본값은 레거시 호환, strict는 명세 검증을 추가합니다. 쓰기는 항상 명세용 이름 비교와 공통 메타데이터 검사를 사용합니다. `writer_directory.zig`는 의미 모델/형제 트리, `writer_layout.zig`는 FAT/DIFAT 수와 Range Lock 예약 배치, `writer.zig`는 바이트 직렬화를 담당합니다. `name_order.zig`와 `entry_rules.zig`는 strict 읽기와 쓰기가 공유하며, JS는 이를 재구현하지 않습니다.

이전 `benchmarks/zig-spike`는 실험이며 제품 파서로 승격하지 않았습니다. 기존 실험은 `legacy/rust/benchmarks/`에서 확인할 수 있습니다.
