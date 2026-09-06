# HWP5 본문·문단·제어·문단 흐름 계약

[모듈 인덱스](hwp5-modules.md) · [과거 공통 기록](hwp5-foundation.md)

이 문서는 해당 주제의 현재 책임·소유권·미지원 경계를 소유합니다. 계약과 새 검증 결과는 해당 주제에서 관리하고, 내용이 커지면 별도 문서로 분리하여 연결합니다.

- `src/hwp5/body/`: 문단 헤더·제어코드 종류/너비·UTF-16 토큰·태그 dispatch를 분리합니다. 토큰 위치는 Unicode 문자 수가 아닌 원본 UTF-16 단위이며, 컨트롤 데이터를 텍스트나 실제 메모리 포인터로 취급하지 않습니다. 계층/DocInfo 참조/개체 연결은 별도 조립 책임입니다.

- 본문 `char_runs.zig`·`line_segments.zig`·`range_tags.zig`는 고정 행 해석, `metadata.zig`는 호출자가 연결한 헤더 개수/위치/글자 모양 ID 검증을 소유합니다. `binary/record_array.zig`는 고정 폭 배열 경계만 공유합니다. 영역 중첩과 signed 줄 값·미지 플래그는 보존하며 페이지를 추정하지 않습니다.

- `control_header.zig`는 4바이트 ID/속성 원본, `list_header.zig`는 문단 수 원값과 명시적 spec6/observed8 배치를 소유합니다. 리스트 배치를 길이·버전만으로 자동 선택하지 않습니다. 컨트롤별 속성과 리스트 소유권 검증은 별도입니다.

- `header_footer.zig`는 관측 head/foot 컨트롤 속성과 리스트 확장의 텍스트 영역을 분리합니다. 제어 헤더 꼬리를 폭으로 추정하거나 누락을 0으로 채우지 않습니다. `header_footer_validation.zig`는 기존 Groups의 직접 소유 관계를 사용하며 section 보고서에 controls/lists/paragraphs/예약 페이지값/꼬리 바이트를 남깁니다. 실제 쪽 배치와 참조 비트 의미 검증은 별도입니다.

- `number_control.zig`는 atno/nwno의 공통 속성·u16 번호, 자동 번호의 장식 코드 유닛을 소유합니다. 표 144의 6바이트 필드 합계/8바이트 총길이 모순은 extra로 보존하며 번호를 u32로 추정하지 않습니다. `number_control_validation.zig`는 구역의 개수/예약 종류/꼬리 진단만 집계합니다. 번호 재계산·표시 모양·각주 번호 의미 검증과 구분합니다.

- `page_number.zig`는 pgnp 속성과 네 WCHAR 원값/꼬리, `page_number_validation.zig`는 구역의 예약 위치·비표준 dash 진단을 소유합니다. 실제 파일의 dash=0을 '-'로 보정하지 않습니다. 위치/모양 비트 추출과 실제 쪽 번호 조판은 별개입니다.

- `index_mark.zig`는 idxm의 두 u16 길이 키워드·dummy·extra를 소유하며 utf16_string을 재사용합니다. 키워드를 정렬·정규화하거나 dummy=0을 강제하지 않습니다. 구역 집계는 index_mark_validation에서 수행하며 실제 찾아보기 페이지 생성은 별도입니다.

- `page_visibility.zig`는 pghd/pgct 속성 원문과 extra를 소유하고 `page_visibility_validation.zig`는 개수·예약 홀짝값·미지 감추기 비트를 집계합니다. 감추기 폭은 명시적 spec16/observed32이며 문서 옵션 hide_layout의 기본값은 observed32입니다. 짧은 입력에서 자동 fallback하지 않으며 실제 쪽 숨김/홀짝 조판과 구분합니다.

- `char_overlap.zig`는 tcps 문자열·선택 속성·signed 크기·글자 모양 배열과 extra를 소유합니다. 배치는 명시적 text_only/full이고 문서 overlap_layout 기본값은 full입니다. 전환 버전은 추정하지 않습니다. `char_overlap_validation.zig`는 기존 reference_rules의 상속 sentinel/범위와 구역 집계를 연결합니다. 원시 테두리/펼침 값을 렌더링 의미 검증으로 해석하지 않습니다.

- `ruby.zig`는 tdut의 두 counted UTF-16 문자열과 다섯 u32를 소유합니다. 표 151의 총길이 18과 필드 합계 모순은 기록하고 필드 목록대로 최소 24바이트를 읽습니다. `ruby_validation.zig`는 예약 위치/정렬과 원문 꼬리를 진단합니다. size_ratio/option/style_number를 축소·정규화하거나 style_number의 참조 체계를 추정하지 않습니다. 실제 표본 미확보 상태와 합성 문서/CFB 검증을 구분합니다.

- `hidden_comment.zig`는 tcmt의 직접 문단 리스트 존재/집계와 opaque 헤더·리스트 꼬리를 검사합니다. `list_groups.OwnerCursor`를 머리말/꼬리말과 공유하며 Groups를 다시 만들거나 조상/형제의 리스트를 가져오지 않습니다. 보안 수준에 따른 무효화·숨은 내용 복구를 수행하지 않습니다. control_rules.classifyCode는 명세 tcmt/15와 관측 tcmt/23을 구분하고 control_type_validation의 checked/deferred/observed에 별도로 집계합니다. 다른 ID/코드 불일치로 확장하거나 원본 코드값을 덮어쓰지 않습니다.

- `body/tree.zig`는 level 기반 부모/서브트리 인덱스를 할당·소유하고 payload는 입력을 빌립니다. `paragraphs.zig`는 직접 자식 연결·중복/고아·문단 참조 검증을 소유합니다. 리스트 헤더 뒤 문단은 같은 level의 형제일 수 있으며 리스트를 가짜 부모로 만들지 않습니다. 보고서의 missing/pending/unknown은 완료로 세지 않습니다.

- `section_def.zig`·`page_def.zig`·`page_border.zig`는 구역/용지/쪽 테두리 payload, `section_validation.zig`는 구역 소유권/개수/참조 검증을 소유합니다. 구역 하위 레코드를 본체에 붙은 바이트로 읽지 않습니다. 번호 ID 0은 보류 항목입니다.

- 각주 payload는 `note_shape.zig`에서 추가 해석합니다. 기본 28바이트/i32 구분선 길이, 명시적 spec26 경로를 구분하며 자동 길이 fallback을 금지합니다. `section_validation`은 note_shapes 개수를 보고하고 주석 문단/번호 의미는 별도입니다.

- `note_control.zig`는 위 쪽 단위 모양과 별개인 fn/en 컨트롤 속성을 소유합니다. spec8은 불투명 원문, observed12/observed16은 전체 폭의 관측 필드이며 배치는 호출자가 선택합니다. observed12의 instance_id는 null이고 후속 바이트는 extra입니다. `note_validation.zig`는 Groups/OwnerCursor를 재사용해 직접 리스트 존재와 집계를 검증합니다. 문서 note_layout 기본값은 observed12이며 길이/버전으로 배치를 자동 추정하거나 짧은 입력을 기본값으로 채우지 않습니다.

- `control_links.zig`는 같은 문단의 확장 텍스트 토큰과 컨트롤 헤더를 발생 순서/ID로 연결합니다. `paragraph_children.zig`는 문단 직접 자식 수집/중복 검사의 SSOT이며 paragraphs와 links가 공유합니다. 연결 성공과 개별 컨트롤 의미 검증을 구분합니다.

- [문단 흐름 소유권](hwp5-paragraph-flows.md): LIST_HEADER별 소속 계약과 실제 파일·적대적 검증 기록.

- `column_def.zig`는 cold의 공통 간격/개별 너비·간격 배치를 소유합니다. count 1 또는 동일 너비와 가변 너비를 구분하며, 개별 쌍은 record_array를 재사용합니다. section_validation에서 부모/개수를 검사하고 단위/레이아웃을 임의 보정하지 않습니다.

- `list_groups.zig`는 같은 부모의 리스트 헤더 사이에서 직접 문단을 묶고 count_raw와 대조합니다. 중간 표/개체 레코드가 있다고 그룹을 닫지 않으며, Tree의 부모를 변경하지 않습니다. 그룹 범위/개수 검증과 셀/캡션 속성 검증은 구분합니다.

- `control_rules.zig`는 공식 ID/코드 대응과 MAKE_4CHID의 SSOT, `control_type_validation.zig`는 연결 결과의 종류 검증을 소유합니다. 미지 ID는 deferred로 남기며 접두사나 잘못된 요약 별칭으로 자동 분류하지 않습니다.
