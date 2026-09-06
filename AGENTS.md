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
- `hwp5/summary/`: header는 HWP FMTID/단일 set envelope, parser는 속성 offset/중복/배열 수명, value는 알려진 typed value, rules는 ID별 기대 타입을 소유합니다. PID 0 dictionary는 TypedPropertyValue로 읽지 않습니다. LPWSTR 문자열 길이는 u32 코드 유닛이며 NUL 종결/패딩을 검사하되 원문·extra·64비트 FILETIME을 보존합니다. `container/summary.zig`는 제어문자 0x05를 포함한 정확한 루트 경로와 전역 한도만 연결합니다. 미지원 타입/ID·dictionary·꼬리를 완료로 치환하지 않습니다.
- `hwp5/scripts/version.zig`는 버전 두 DWORD, `source.zig`는 u32 길이의 네 UTF-16 필드와 -1 종료 표식을 소유합니다. summary의 NUL/패딩 규칙을 재사용하지 않습니다. `container/scripts.zig`는 정확한 선택 경로·공통 stream.decode·전역 소비 한도를 연결하며 scalar 보고서만 반환합니다. 미지 버전/꼬리는 보존·보고하고 스크립트를 실행하지 않습니다.
- `hwp5/xml_template/string.zig`는 표 10~12의 decoded 문자열 envelope, `template.zig`는 세 선택 입력의 총 한도/부재를 소유합니다. Scripts와 `utf16_string.read32`를 공유하며 두 길이 폭 모두 실패 시 커서를 보존합니다. XML 문법/스키마 검증·외부 엔터티 로드·CFB 압축 자동 판별은 포함하지 않습니다. 실제 XMLTemplate 표본은 아직 확보하지 못했습니다.
- `hwp5/history/record.zig`는 BYTE tag + UINT byte length의 별도 framing, `value.zig`는 공식 태그/포함 비트/알려진 payload, `item.zig`는 한 decoded VersionLog의 시작·끝·포함 비트를 소유합니다. 시작 payload는 spec_flag_first/observed_option_first를 명시적으로 선택합니다. SYSTEMDATE는 레이아웃 미정의로 raw deferred이며 마지막 문서 연결·DiffML/HWPML·암호화는 별도입니다. 일반 본문 record 헤더나 압축 정책을 자동 적용하지 않습니다.
- summary `strings.zig`는 counted 문자열의 경계·종결·패딩을 공유합니다. LPWSTR 길이는 UTF-16 유닛, LPSTR 길이는 바이트이며 CP1200일 때도 바이트입니다. parser는 PID1의 VT_I2를 먼저 확인해 뒤에 있는 코드페이지도 적용하며 u16 비트패턴을 보존합니다. `dictionary.zig`는 명시된 코드페이지에서 항목 경계/ID만 검사합니다. 이름 인코딩·중복 의미는 별도이며, 코드페이지가 없는 HWP dictionary에 자동 기본값을 적용하지 않습니다.
- `src/hwp5/body/`: 문단 헤더·제어코드 종류/너비·UTF-16 토큰·태그 dispatch를 분리합니다. 토큰 위치는 Unicode 문자 수가 아닌 원본 UTF-16 단위이며, 컨트롤 데이터를 텍스트나 실제 메모리 포인터로 취급하지 않습니다. 계층/DocInfo 참조/개체 연결은 별도 조립 책임입니다.
- 본문 `char_runs.zig`·`line_segments.zig`·`range_tags.zig`는 고정 행 해석, `metadata.zig`는 호출자가 연결한 헤더 개수/위치/글자 모양 ID 검증을 소유합니다. `binary/record_array.zig`는 고정 폭 배열 경계만 공유합니다. 영역 중첩과 signed 줄 값·미지 플래그는 보존하며 페이지를 추정하지 않습니다.
- `control_header.zig`는 4바이트 ID/속성 원본, `list_header.zig`는 문단 수 원값과 명시적 spec6/observed8 배치를 소유합니다. 리스트 배치를 길이·버전만으로 자동 선택하지 않습니다. 컨트롤별 속성과 리스트 소유권 검증은 별도입니다.
- `header_footer.zig`는 관측 head/foot 컨트롤 속성과 리스트 확장의 텍스트 영역을 분리합니다. 제어 헤더 꼬리를 폭으로 추정하거나 누락을 0으로 채우지 않습니다. `header_footer_validation.zig`는 기존 Groups의 직접 소유 관계를 사용하며 section 보고서에 controls/lists/paragraphs/예약 페이지값/꼬리 바이트를 남깁니다. 실제 쪽 배치와 참조 비트 의미 검증은 별도입니다.
- `number_control.zig`는 atno/nwno의 공통 속성·u16 번호, 자동 번호의 장식 코드 유닛을 소유합니다. 표 144의 6바이트 필드 합계/8바이트 총길이 모순은 extra로 보존하며 번호를 u32로 추정하지 않습니다. `number_control_validation.zig`는 구역의 개수/예약 종류/꼬리 진단만 집계합니다. 번호 재계산·표시 모양·각주 번호 의미 검증과 구분합니다.
- `page_number.zig`는 pgnp 속성과 네 WCHAR 원값/꼬리, `page_number_validation.zig`는 구역의 예약 위치·비표준 dash 진단을 소유합니다. 실제 파일의 dash=0을 '-'로 보정하지 않습니다. 위치/모양 비트 추출과 실제 쪽 번호 조판은 별개입니다.
- `index_mark.zig`는 idxm의 두 u16 길이 키워드·dummy·extra를 소유하며 utf16_string을 재사용합니다. 키워드를 정렬·정규화하거나 dummy=0을 강제하지 않습니다. 구역 집계는 index_mark_validation에서 수행하며 실제 찾아보기 페이지 생성은 별도입니다.
- `page_visibility.zig`는 pghd/pgct 속성 원문과 extra를 소유하고 `page_visibility_validation.zig`는 개수·예약 홀짝값·미지 감추기 비트를 집계합니다. 감추기 폭은 명시적 spec16/observed32이며 문서 옵션 hide_layout의 기본값은 observed32입니다. 짧은 입력에서 자동 fallback하지 않으며 실제 쪽 숨김/홀짝 조판과 구분합니다.
- `parameters/field_name.zig`는 관측 0x021b Set의 직접 0x4000 문자열 규칙을 소유하며 셀과 책갈피가 공유합니다. `body/bookmark.zig`는 bokm의 직접 CTRL_DATA 소유 관계와 이름 진단을 담당합니다. sources.inspectBodyDetailed는 기존 ParameterSet 파싱 결과를 재사용하고 section은 parameters/bookmarks 보고서를 함께 연결합니다. 이름 부재·빈 문자열·미지 Set·미지원 타입을 구분하며 이름 중복의 문서 전역 의미나 탐색 위치는 별도입니다.
- `char_overlap.zig`는 tcps 문자열·선택 속성·signed 크기·글자 모양 배열과 extra를 소유합니다. 배치는 명시적 text_only/full이고 문서 overlap_layout 기본값은 full입니다. 전환 버전은 추정하지 않습니다. `char_overlap_validation.zig`는 기존 reference_rules의 상속 sentinel/범위와 구역 집계를 연결합니다. 원시 테두리/펼침 값을 렌더링 의미 검증으로 해석하지 않습니다.
- `ruby.zig`는 tdut의 두 counted UTF-16 문자열과 다섯 u32를 소유합니다. 표 151의 총길이 18과 필드 합계 모순은 기록하고 필드 목록대로 최소 24바이트를 읽습니다. `ruby_validation.zig`는 예약 위치/정렬과 원문 꼬리를 진단합니다. size_ratio/option/style_number를 축소·정규화하거나 style_number의 참조 체계를 추정하지 않습니다. 실제 표본 미확보 상태와 합성 문서/CFB 검증을 구분합니다.
- `hidden_comment.zig`는 tcmt의 직접 문단 리스트 존재/집계와 opaque 헤더·리스트 꼬리를 검사합니다. `list_groups.OwnerCursor`를 머리말/꼬리말과 공유하며 Groups를 다시 만들거나 조상/형제의 리스트를 가져오지 않습니다. 보안 수준에 따른 무효화·숨은 내용 복구를 수행하지 않습니다. control_rules.classifyCode는 명세 tcmt/15와 관측 tcmt/23을 구분하고 control_type_validation의 checked/deferred/observed에 별도로 집계합니다. 다른 ID/코드 불일치로 확장하거나 원본 코드값을 덮어쓰지 않습니다.
- `body/tree.zig`는 level 기반 부모/서브트리 인덱스를 할당·소유하고 payload는 입력을 빌립니다. `paragraphs.zig`는 직접 자식 연결·중복/고아·문단 참조 검증을 소유합니다. 리스트 헤더 뒤 문단은 같은 level의 형제일 수 있으며 리스트를 가짜 부모로 만들지 않습니다. 보고서의 missing/pending/unknown은 완료로 세지 않습니다.
- `section_def.zig`·`page_def.zig`·`page_border.zig`는 구역/용지/쪽 테두리 payload, `section_validation.zig`는 구역 소유권/개수/참조 검증을 소유합니다. 구역 하위 레코드를 본체에 붙은 바이트로 읽지 않습니다. 번호 ID 0은 보류 항목입니다.
- 각주 payload는 `note_shape.zig`에서 추가 해석합니다. 기본 28바이트/i32 구분선 길이, 명시적 spec26 경로를 구분하며 자동 길이 fallback을 금지합니다. `section_validation`은 note_shapes 개수를 보고하고 주석 문단/번호 의미는 별도입니다.
- `note_control.zig`는 위 쪽 단위 모양과 별개인 fn/en 컨트롤 속성을 소유합니다. spec8은 불투명 원문, observed12/observed16은 전체 폭의 관측 필드이며 배치는 호출자가 선택합니다. observed12의 instance_id는 null이고 후속 바이트는 extra입니다. `note_validation.zig`는 Groups/OwnerCursor를 재사용해 직접 리스트 존재와 집계를 검증합니다. 문서 note_layout 기본값은 observed12이며 길이/버전으로 배치를 자동 추정하거나 짧은 입력을 기본값으로 채우지 않습니다.
- `equation.zig`는 EQEDIT 전용 payload이며 eqed의 object_common 헤더를 중복 소비하지 않습니다. 관측 version_only/with_font 배치는 명시적이고 baseline 뒤 미지 u16을 보존합니다. counted UTF-16은 utf16_string을 공유하며 폰트 부재/null과 빈 문자열을 구분합니다. `equation_validation.zig`는 Tree의 직접 부모/서브트리 경계로 eqed당 EQEDIT 하나와 고아·중복·누락을 검사합니다. 문서 equation_layout 기본값은 version_only이고 이후 폰트 바이트는 extra입니다. 수식 언어 실행/조판은 별도입니다.
- `ole.zig`는 SHAPE_COMPONENT_OLE의 spec24/observed26 payload를 명시적으로 구분합니다. 속성은 각각 u16/u32이지만 BinData ID는 두 배치 모두 u16이며 테두리 색을 ID에 섞지 않습니다. `ole_validation.zig`는 첫 ID가 $ole인 SHAPE_COMPONENT의 직접 payload 한 개를 검증합니다. `owned_record.find`는 수식/OLE가 공유하는 직접 자식 검색 SSOT입니다. 문서 ole_layout 기본값은 observed26이며 BinData 해석은 pending_references로 남깁니다. 상위 도형의 전체 계층/기하 의미나 외부 링크·임베디드 프로그램 실행은 검사하지 않습니다.
- `shape_component.zig`는 명시적 single_id/double_id와 42바이트 구성요소 필드를 소유합니다. 동일한 인접 DWORD를 보고 ID 개수를 추정하지 않습니다. `rendering.zig`는 translation 및 scale/rotation 쌍을 소유하고 binary.record_array로 96바이트 쌍의 borrowed 접근을 공유합니다. `shape_validation.zig`는 gso의 직접 구성요소 하나와 $con 아래 그룹 구성요소를 검증하며 부모에 따라 ID 배치를 선택합니다. 이중 ID 불일치·미지 비트·비유한 행렬 값은 별도 진단입니다. 문서 검사에 연결했지만 종류별 꼬리·행렬 합성·조판 의미는 아직 남았습니다.
- `shape_border.zig`는 명시적 spec11/observed13 선 두께 배치와 원문 꼬리를 소유합니다. `line_attributes.zig`는 표 87 비트 view의 SSOT이며 OLE의 borderAttributes도 공유합니다. 예약값·색상 상위 비트·signed 두께를 정규화하지 않습니다. 테두리는 선택된 drawing_style 검사를 통해 문서에 연결합니다.
- `drawing_style.zig`는 관측 테두리→기존 Fill→종류별 alpha→그림자 배치를 조립합니다. Fill의 기본 파서를 복제하지 않습니다. `docinfo/fill_alpha.zig`는 pattern/gradient/image 순서의 선택 원시 바이트, `shadow.zig`는 16바이트 관측 블록을 소유합니다. 미지 Fill 비트가 있으면 뒤 위치를 추정하지 않고 unknown tail로 남깁니다.
- `drawing_style_validation.Report.add`는 그리기 종류 선택과 스타일 진단을 담당합니다. shape_validation.inspectDetailed가 이미 파싱한 Component를 전달하므로 계층/Rendering/ID 배치를 다시 계산하지 않습니다. document.drawing_style=null은 supported 중 unselected로 보고하며 완료로 세지 않습니다. 명시적 옵션을 주면 해당 배치의 오류가 문서/CFB까지 전파됩니다. 활성 이미지 채우기는 reference_rules.one_based와 DocInfo 실측 BinData 수로 범위를 검사하며 image_references에 집계합니다. 미지 Fill/미선택/다른 종류는 이미지 참조 완료로 세지 않으며 조판 의미는 별도입니다.
- `drawing_style.Style.parseWithTail`은 fill_only/alpha_shadow 배치를 호출자가 명시적으로 선택합니다. fill_only의 꼬리는 raw slice이며 alpha/그림자를 0으로 만들지 않습니다. 기존 parse는 alpha_shadow를 유지하고 짧은 입력에 자동 fallback하지 않습니다. 실제 5.0.0.6/5.0.1.7의 fill_only 표본은 검증했으나 전환 버전이나 문서 자동 선택 규칙은 아직 확정하지 않았습니다.
- `drawing_metadata.zig`는 관측 instance_id(u32)/reserved(u8)/shadow_alpha(u8)의 6바이트를 원자적으로 읽습니다. 명시적 alpha_shadow_metadata 배치에서만 해석하고 기존 alpha_shadow에서는 metadata=null과 전체 extra를 유지합니다. reserved의 비영 값도 보존하며 instance ID의 전역 유일성이나 alpha의 시각적 의미를 추정하지 않습니다.
- `control_links.zig`는 같은 문단의 확장 텍스트 토큰과 컨트롤 헤더를 발생 순서/ID로 연결합니다. `paragraph_children.zig`는 문단 직접 자식 수집/중복 검사의 SSOT이며 paragraphs와 links가 공유합니다. 연결 성공과 개별 컨트롤 의미 검증을 구분합니다.
- `control_identity.zig`는 exact와 관측 메모 연결을 구분합니다. code 3의 %%me 토큰/%unk 헤더와 bounded 필드 command의 정확한 UTF-16 MEMO/ 표식만 관측 연결로 인정하며 두 ID를 Link에 그대로 보존합니다. 다른 불일치를 wildcard로 허용하지 않습니다. `field_start.zig`는 표 152의 공통 속성·command·instance ID·extra를 소유하며 명령을 실행하지 않습니다. 구역 observed_field_links를 별도로 보고하고 메모 명령의 전체 문법/번호 의미는 보류합니다.
- `field_validation.zig`는 control_rules에서 code 3으로 정의한 알려진 필드만 공통 파서로 검사하고 구역 개수·command 길이·속성 진단·꼬리를 집계합니다. '%' 접두사나 요약의 '%%%%'를 wildcard로 쓰지 않습니다. 읽기 전용 수정/수정됨/업데이트 종류는 원시 비트 view이며 실제 권한·링크 상태로 단정하지 않습니다. 전역 instance ID 유일성과 명령 종류별 의미 검증은 별도입니다.
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
- `BinData.target`은 embedding/storage의 파일 ID·확장자·꼬리 해석을 소유합니다. 기존 parse의 명세 envelope/extra는 바꾸지 않습니다. container.storage_layout 기본 observed_optional_extension은 storage 꼬리 부재를 허용하지만 존재하는 counted prefix가 잘리면 오류입니다. specified는 storage 꼬리를 확장자로 읽지 않습니다. paths.binary의 길이·문자·정확한 경로 규칙을 재사용하며 다른 이름으로 재검색하지 않습니다.
- `docinfo/compatible_document.zig`는 대상 프로그램 원값/미지 enum, `layout_compatibility.zig`는 다섯 DWORD와 꼬리를 소유합니다. reader의 태그 30/31 dispatch와 레벨 0/1 검사가 SSOT입니다. 레이아웃 비트 의미는 명세에 정의되지 않아 자동 보정하거나 유효값 마스크를 추정하지 않습니다.
- `docinfo/compatibility_owner.zig`는 최근 level 0 루트가 compatible_document인지 추적합니다. document/docinfo가 이를 연결해 고아 layout을 거부합니다. 중간 level 1/2 레코드를 새 루트로 오인하지 않으며 개별 payload reader에 문서 전체 상태를 넣지 않습니다.
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

테스트용 문서 보고서의 기대 바이트 간격/필드 위치는 `tests/hwp5/document-report-wire.mjs`에서 공유합니다. 제품 serializer로부터 생성하지 않아 독립 대조를 유지하며, 다른 테스트에 구역 stride·필드 offset 숫자를 다시 복제하지 않습니다. 구역 인덱스 정렬 검증은 서로 다른 진단값을 가진 입력으로 수행합니다.

## 작업과 커밋

- 한국어로 변경 결과와 남은 제한을 간결하게 설명합니다.
- 기존 사용자 변경을 보존하고, 무관한 변경은 커밋에 포함하지 않습니다.
- 검증 후 별도 브랜치·PR 없이 `main`에 직접 커밋·푸시합니다.
- 푸시 전 원격 변경을 확인하며, 강제 푸시나 스냅샷 일괄 승인은 하지 않습니다.
- 커밋 메시지는 `commit-rules.md`를 따릅니다.
