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

`object_common.zig`는 표/그리기/수식 헤더의 공통 필드와 선택 설명을 해석합니다. ControlHeader는 계속 ID/원본 속성을 보유하고, 호출자가 supports/Properties.parse로 추가 해석합니다. UTF-16 길이 읽기는 기존 utf16_string, 컨트롤 ID는 control_rules가 소유합니다. 개체의 캡션·셀·도형 자식 구조 검증과 렌더링은 이 파서에 넣지 않습니다.

`table.zig`는 태그 77의 버전별 Row Size/영역 배열, `table_cell.zig`와 `caption.zig`는 명시적 리스트 view 이후의 payload를 해석합니다. 배열 경계는 record_array를 재사용하며 zone의 두 좌표 배치는 table_zone에 한정합니다. `table_lists`는 TABLE 마커 전후의 직접 리스트를 구분하고 중첩 표/미지 레코드를 보존합니다. `table_validation.inspect(allocator, tree, options)`는 호출자가 정한 두 배치와 테두리 개수로 소유권·총 셀 수·병합 경계·영역과 참조를 검사하고 table_grid에 논리 격자 검증을 맡깁니다. 확장 꼬리·시각적 배치까지 검사했다는 뜻은 아닙니다.

`table_grid`는 표 행/열 수·Row Size와 Rectangle 배열만 받으며 Tree/CFB에 의존하지 않습니다. Rectangle.validate가 병합 경계의 SSOT입니다. 행별 시작 셀 수를 확인하고 행 경계 이벤트를 정렬한 뒤 열 기준 구간 점유를 검사합니다. 공유 경계에서 제거→추가 순서를 지키고, 비중첩을 증명한 후 넓이 합으로 완전한 격자 채움을 확인합니다. 임시 메모리는 셀+행+열 개수에 비례하며 할당자는 호출자가 주입합니다.

`CellAttributes.fromList(view)`는 선택된 공통 리스트 속성의 셀별 비트를 해석합니다. `CellExtension.parse(cell.extra)`는 호출자가 관측 확장 형식을 선택한 경우 text_width/marker/remaining을 빌려 읽습니다. 기본 Cell.parse는 확장 뷰를 자동 호출하지 않으며 임의 꼬리를 보존합니다. 확장 뷰의 성공이나 0xff 표시는 ParameterSet/필드명의 유효성 검증과 다릅니다. 실제 검사는 `cell_field.inspect(allocator, extension, parameter_options)`를 명시적으로 호출합니다.

`parameters/types.zig`는 노드/배치/제한 계약을, `parameters/parser.zig`는 prefix 파싱과 전위 순서 노드 배열 수명을 소유합니다. 문자열과 raw/extra는 입력을 빌리며 소비 길이를 반환합니다. Set ID와 item ID, 배열의 공통 ID와 wire상 ID 존재 여부를 구분합니다. 중첩은 기본 32/상한 64, 노드는 기본 100,000개로 제한합니다. 셀 이름 소비자는 root 0x021b의 직접 item 0x4000만 확인하며 임시 노드를 해제한 뒤 borrowed 이름/꼬리를 반환합니다. BinData 참조 연결과 각 레코드의 꼬리 계약은 외부 문서 조립 책임입니다.

`parameter_sources.inspectDocInfo/inspectBody`는 parameter options·list layout·DocInfo BinData 리소스 개수를 받아 각 소스를 순회합니다. 파싱된 트리는 parameter_references와 cell_field.fromDocument에서 공유한 뒤 해제합니다. 미지원 타입은 전체 payload 단위로 보류하지만 그 뒤의 소스 검사는 계속합니다. 알려진 손상/참조 오류/할당 실패는 전파합니다. reported parsed는 구조 파싱 수이며 trailing/opaque/unknown 셀 Set을 완료로 치환하지 않습니다. ControlData 소유권과 컨트롤별 Set 의미, 전체 문서/CFB 조립은 별도 책임입니다.

태그 dispatch는 용지 73·각주/미주 모양 74·쪽 테두리 75도 포함합니다. `section_def.zig`·`page_def.zig`·`note_shape.zig`·`page_border.zig`는 각 payload 배치를 소유하고 `section_validation.zig`는 트리 기반 구역 소유권/개수/참조를 검증합니다. 구역 정의 본체와 하위 레코드를 섞지 않습니다. 각주 구분선 길이는 관측 i32 배치를 기본으로 하며 spec26은 명시적으로만 선택합니다. 주석 컨트롤 연결 및 번호 ID 0은 아직 남아 있습니다.

`document/validation.zig`의 `inspectDecoded`는 헤더와 압축 해제된 DocInfo·인덱스별 구역을 받아 기존 검증기를 연결합니다. `docinfo.zig`가 확인한 리소스 개수를 `section.zig`의 문단·구역 정의·표·파라미터 참조에 전달하며 호출자가 임의 리소스 개수를 주입하지 않습니다. 구역 수/인덱스/전역 입력 한도만 새 조립 계층이 소유합니다. 구역 정의가 첫 루트 문단에 있어야 하는 규칙은 기존 section_validation에 둡니다. 파일 검색/압축 해제/BinData 스트림 조립 및 미지원 기능 검증은 이 API의 범위가 아닙니다.

`document/types.zig`의 Report는 인덱스 순서의 구역 보고서 배열을 소유하며 deinit으로 해제합니다. DocInfo 속성 extra와 ID 매핑 raw는 입력 DocInfo를 빌리므로 해당 입력의 수명을 유지해야 합니다. 임시 Tree/링크/리스트/파라미터 노드는 호출 안에서 해제하며 부분 실패에는 보고서를 반환하지 않습니다. 개별 검사기의 pending/unknown/opaque 수치를 다른 축의 성공 개수로 상쇄하지 않습니다.

`container/validation.zig`는 파일 바이트를 strict CFB로 열고 이 decoded 진입점을 호출하는 상위 어댑터입니다. CFB 원본/스트림 한도와 HWP 압축 해제 합계 한도는 별도입니다. `paths.zig`는 정확한 계층 조회와 이름 생성, `sections.zig`는 BodyText 직접 자식 수집/해제, `binaries.zig`는 DocInfo 항목으로 내부 스트림을 찾고 기존 BinData 압축 정책을 호출합니다. 이름 길이/금지 문자/대소문자 동등성은 CFB name_order를 재사용합니다. 외부 링크는 실행하지 않고 보류합니다. 모든 데이터가 raw DEFLATE라는 가정이나 손상 후 원본 fallback을 넣지 않습니다.

container Report는 document Report와 그 DocInfo backing을 소유합니다. 입력 CFB와 임시 구역/바이너리 데이터는 반환 뒤 필요하지 않습니다. 미소비 CFB 스트림은 uninspected_streams로 보고하며 이미지/OLE 콘텐츠 해석이나 미지원 스트림의 유효성을 주장하지 않습니다. 동일 BinData 스트림을 여러 항목이 참조하면 각 항목의 압축 정책으로 검사하고 총 decode 한도도 항목별로 계산합니다.

`preview/text.zig`는 raw UTF-16LE 바이트를 빌리는 뷰와 코드 유닛/Unicode scalar/고립 서로게이트/NUL/BOM 수치를 소유합니다. 길이 접두사가 있는 DocInfo 문자열, 제어문자 문법이 있는 본문 텍스트와 별도 형식입니다. `container/preview.zig`는 루트 PrvText의 선택적 존재·kind·전역 바이트 한도만 담당하고 문서 compressed 비트와 무관하게 원문을 전달합니다. container Report의 preview_text=null과 0유닛 Stats는 부재/빈 텍스트를 구분하며, 통계만 저장하므로 임시 CFB를 해제한 뒤의 포인터를 남기지 않습니다. total_decoded_bytes에는 이 비압축 소비량도 포함합니다.

`scripts/version.zig`와 `scripts/source.zig`는 압축 해제된 입력을 빌려 두 버전 DWORD, 네 UTF-16LE 필드와 -1 종료 표식을 해석합니다. 길이는 u32 코드 유닛이며 NUL 종결·4바이트 패딩은 요구하지 않습니다. 원문과 extra를 보존하며 JS 실행기는 포함하지 않습니다. `container/scripts.zig`는 선택적인 정확한 Scripts 자식 스트림과 kind를 검사하고 기존 stream.decode를 사용합니다. 버전/소스 존재는 각각 optional이고 보고서는 scalar만 소유합니다. 디코드 바이트 전체(꼬리 포함)를 전역 한도에서 차감하며 꼬리는 trailing_bytes로 별도 보고합니다. 미지 버전을 지원 버전으로 보정하거나 스크립트 저장 플래그만으로 스트림 존재를 추정하지 않습니다.

`summary/header.zig`는 HWP FMTID의 단일 property-set envelope만 해석하고, `parser.zig`는 set 크기·속성 디렉터리와 증가/정렬/범위/중복을 검사합니다. 속성 배열만 할당하며 원문 전체·문자열·dictionary·미지원 값·extra는 입력을 빌립니다. `value.zig`는 알려진 typed value, `rules.zig`는 HWP ID별 기대 타입을 소유합니다. 문자열 길이 u32 및 패딩은 DocInfo의 u16 문자열 문법과 다르며 혼용하지 않습니다. PID 0은 별도 dictionary 원문으로 보존하고 일반 태그 1로 읽지 않습니다. container/summary는 optional 정확한 루트 스트림을 소비하고 scalar 통계만 반환하므로 임시 파서/CFB를 모두 해제합니다. 다중 set·다른 FMTID·문자 변환·dictionary 이름 의미 검증은 후속 범위입니다.

요약 파서는 디렉터리 확인 후 PID1을 먼저 읽고 나서 값들을 해석합니다. 선택적인 code_page는 signed VT_I2의 16비트 원형을 보존하고, 문자열보다 뒤에 있다는 이유로 누락하지 않습니다. value는 VT_I2/LPSTR도 지원하며 LPSTR은 코드페이지 식별자와 원시 bytes를 함께 반환합니다. `strings.zig`에서 길이/단위/종결/패딩만 공유하고 문자를 변환하지 않습니다. CP1200 LPSTR도 바이트 길이이며 dictionary는 CP1200이면 UTF-16 유닛 길이와 항목별 패딩, 그 외에는 바이트 길이와 무패딩 항목입니다. dictionary의 Iterator는 raw 이름을 빌리고 실패 시 위치/잔여 개수를 유지합니다. inspect는 ID 범위/중복과 마지막 정렬 바이트를 확인하며 dictionary_structure를 반환합니다. 코드페이지 부재·문자 변환·이름 의미 검증은 아직 별도이며 dictionaries_deferred를 구조 검사 성공만으로 감소시키지 않습니다.

HWP5 기반의 책임 소유자·소유권·미지원 경계·검증 기록은 [HWP5 기반 구현](hwp5-foundation.md)에 모읍니다. 제품 JS ABI는 변경하지 않았고, 테스트 전용 bridge는 코어를 wasm32-freestanding으로 실행하기 위한 어댑터입니다.

DocInfo 리소스는 BinData·글꼴·탭·번호·글머리표·스타일·테두리/배경·글자 모양·문단 모양까지 해석합니다. `border_fill.zig`는 선 배열, `fill.zig`는 채우기 조합, `picture_info.zig`는 이미지 속성 공통 배치를 소유합니다. 문단 모양의 구/신 줄 간격을 임의로 하나로 합치지 않습니다. `resources.zig`는 주요 리소스 개수, `reference_rules.zig`는 ID 기준/부재 값, `references.zig`는 활성 참조 진단을 분리합니다. 알려진 본문 참조는 decoded 문서 진입점에 연결했으며, 외부 스트림 연결·구역 번호 fallback 및 미지원 리소스의 참조는 후속 단계입니다.

저장은 문서 모델 → HWP 레코드 → 압축된 스트림 목록 → 새 CFB 생성 순서로 구현합니다. 기존 파일의 섹터를 제자리 수정하는 기능은 초기 범위에 포함하지 않습니다.

버전별 필드 부재와 기본값을 구분하고, 미지원 레코드·스트림 및 보존에 필요한 CFB 메타데이터를 유지하는 정책을 설계해야 합니다. 단순 재저장도 정보 보존 검증 전에는 무손실이라고 주장하지 않습니다.

구현 순서: CFB 읽기 → 새 CFB 쓰기 → 전체 스트림 왕복 비교 → HWP5 최소 읽기·쓰기 → 편집 후 저장 → HWPX 공통 모델 통합. 각 단계에서 기존 Rust fixture, 독립 리더, 손상 입력 테스트로 검증합니다.

CFB 단계의 현재 경계: 읽기 기본값은 레거시 호환, strict는 명세 검증을 추가합니다. 쓰기는 항상 명세용 이름 비교와 공통 메타데이터 검사를 사용합니다. `writer_directory.zig`는 의미 모델/형제 트리, `writer_layout.zig`는 FAT/DIFAT 수와 Range Lock 예약 배치, `writer.zig`는 바이트 직렬화를 담당합니다. `name_order.zig`와 `entry_rules.zig`는 strict 읽기와 쓰기가 공유하며, JS는 이를 재구현하지 않습니다.

이전 `benchmarks/zig-spike`는 실험이며 제품 파서로 승격하지 않았습니다. 기존 실험은 `legacy/rust/benchmarks/`에서 확인할 수 있습니다.
