# HWP5 그리기·개체 계약

[모듈 인덱스](hwp5-modules.md) · [과거 공통 기록](hwp5-foundation.md)

이 문서는 해당 주제의 현재 책임·소유권·미지원 경계를 소유합니다. 계약과 새 검증 결과는 해당 주제에서 관리하고, 내용이 커지면 별도 문서로 분리하여 연결합니다.

- `equation.zig`는 EQEDIT 전용 payload이며 eqed의 object_common 헤더를 중복 소비하지 않습니다. 관측 version_only/with_font 배치는 명시적이고 baseline 뒤 미지 u16을 보존합니다. counted UTF-16은 utf16_string을 공유하며 폰트 부재/null과 빈 문자열을 구분합니다. `equation_validation.zig`는 Tree의 직접 부모/서브트리 경계로 eqed당 EQEDIT 하나와 고아·중복·누락을 검사합니다. 문서 equation_layout 기본값은 version_only이고 이후 폰트 바이트는 extra입니다. 수식 언어 실행/조판은 별도입니다.

- `ole.zig`는 SHAPE_COMPONENT_OLE의 spec24/observed26 payload를 명시적으로 구분합니다. 속성은 각각 u16/u32이지만 BinData ID는 두 배치 모두 u16이며 테두리 색을 ID에 섞지 않습니다. `ole_validation.zig`는 첫 ID가 $ole인 SHAPE_COMPONENT의 직접 payload 한 개를 검증합니다. `owned_record.find`는 수식/OLE가 공유하는 직접 자식 검색 SSOT입니다. 문서 ole_layout 기본값은 observed26이며 BinData 해석은 pending_references로 남깁니다. 상위 도형의 전체 계층/기하 의미나 외부 링크·임베디드 프로그램 실행은 검사하지 않습니다.

- `shape_component.zig`는 명시적 single_id/double_id와 42바이트 구성요소 필드를 소유합니다. 동일한 인접 DWORD를 보고 ID 개수를 추정하지 않습니다. `rendering.zig`는 translation 및 scale/rotation 쌍을 소유하고 binary.record_array로 96바이트 쌍의 borrowed 접근을 공유합니다. `shape_validation.zig`는 gso의 직접 구성요소 하나와 $con 아래 그룹 구성요소를 검증하며 부모에 따라 ID 배치를 선택합니다. 이중 ID 불일치·미지 비트·비유한 행렬 값은 별도 진단입니다. 문서 검사에 연결했지만 종류별 꼬리·행렬 합성·조판 의미는 아직 남았습니다.

- `shape_border.zig`는 명시적 spec11/observed13 선 두께 배치와 원문 꼬리를 소유합니다. `line_attributes.zig`는 표 87 비트 view의 SSOT이며 OLE의 borderAttributes도 공유합니다. 예약값·색상 상위 비트·signed 두께를 정규화하지 않습니다. 테두리는 선택된 drawing_style 검사를 통해 문서에 연결합니다.

- `drawing_style.zig`는 관측 테두리→기존 Fill→종류별 alpha→그림자 배치를 조립합니다. Fill의 기본 파서를 복제하지 않습니다. `docinfo/fill_alpha.zig`는 pattern/gradient/image 순서의 선택 원시 바이트, `shadow.zig`는 16바이트 관측 블록을 소유합니다. 미지 Fill 비트가 있으면 뒤 위치를 추정하지 않고 unknown tail로 남깁니다.

- `drawing_style_validation.Report.add`는 그리기 종류 선택과 스타일 진단을 담당합니다. shape_validation.inspectDetailed가 이미 파싱한 Component를 전달하므로 계층/Rendering/ID 배치를 다시 계산하지 않습니다. document.drawing_style=null은 supported 중 unselected로 보고하며 완료로 세지 않습니다. 명시적 옵션을 주면 해당 배치의 오류가 문서/CFB까지 전파됩니다. 활성 이미지 채우기는 reference_rules.one_based와 DocInfo 실측 BinData 수로 범위를 검사하며 image_references에 집계합니다. 미지 Fill/미선택/다른 종류는 이미지 참조 완료로 세지 않으며 조판 의미는 별도입니다.

- `drawing_style.Style.parseWithTail`은 fill_only/alpha_shadow 배치를 호출자가 명시적으로 선택합니다. fill_only의 꼬리는 raw slice이며 alpha/그림자를 0으로 만들지 않습니다. 기존 parse는 alpha_shadow를 유지하고 짧은 입력에 자동 fallback하지 않습니다. 실제 5.0.0.6/5.0.1.7의 fill_only 표본은 검증했으나 전환 버전이나 문서 자동 선택 규칙은 아직 확정하지 않았습니다.

- `drawing_metadata.zig`는 관측 instance_id(u32)/reserved(u8)/shadow_alpha(u8)의 6바이트를 원자적으로 읽습니다. 명시적 alpha_shadow_metadata 배치에서만 해석하고 기존 alpha_shadow에서는 metadata=null과 전체 extra를 유지합니다. reserved의 비영 값도 보존하며 instance ID의 전역 유일성이나 alpha의 시각적 의미를 추정하지 않습니다.

- `shape_line.zig`는 일반 선의 태그 78 payload(표 92)를 소유합니다. 네 signed 좌표와 u16 속성 원값을 보존하며, 후반부를 속성에 합치거나 bool로 축소하지 않습니다. `line_validation`은 태그 78의 $lin/$col 소유권 분기를 한곳에서 처리하고 owned_record.find로 직접 자식 한 개와 고아/누락/중복을 검사하며 문서/CFB에 연결됩니다. payload 길이로 종류를 추정하지 않습니다. 비boolean 일반 선 속성은 오류가 아닌 원값 진단입니다.

- `shape_connector.zig`는 $col의 관측 태그 78 payload를 일반 선과 분리합니다. Point와 record_array를 공유하며 40바이트 헤더/10바이트 제어점 배열/미지 extra를 보존합니다. 종류 u32와 대상 ID·인덱스 원값을 축소하지 않고 개수는 남은 바이트로 검사한 뒤 곱합니다. 잘린 배열의 개수를 줄이거나 0으로 보충하지 않습니다. line_validation에서 문서에 연결하며 connectors/control_points/unknown_connector_kinds를 집계합니다. extra_bytes는 일반 선과 연결선의 미지 꼬리 합계입니다. pending_subject_slots는 ID 0도 포함한 두 끝의 미검증 슬롯 수이며 대상 개체 참조·조판 검증을 뜻하지 않습니다.

- `group_info.zig`는 표 121의 u16 개수/u32 자식 컨트롤 ID 배열과 명시적 ids_only/with_instance 배치를 소유합니다. record_array로 원본 ID 순서·중복·미지 값을 보존하며 instance 부재와 0을 구분합니다. 실제 $con은 Component의 Rendering 뒤 extra에 이 정보를 담고 있으며 태그 86을 무조건 요구하지 않습니다. `group_validation.Report.add`는 shape_validation이 이미 파싱한 Component를 받아 ids_only 목록과 Tree의 직접 자식 개수/ID 순서를 대조하고 문서에 연결합니다. 자손을 직접 자식으로 세지 않고 개수 오류를 ID 불일치보다 우선합니다. shape_groups는 groups/children/empty_groups/extra_bytes이며 선택하지 않은 instance 등 꼬리는 extra로 남습니다. instance 전역 의미·별도 태그 86 배치는 아직 별도입니다.

- `video_data.zig`는 표 123~126의 로컬/웹 동영상 payload 코어입니다. 로컬의 두 u16 ID와 extra, 웹의 raw UTF-16/썸네일 ID를 보존합니다. WebLayout.specified_remainder는 명세의 나머지 payload 배치이고 explicit_units는 호출자가 별도로 아는 길이이며 새로운 길이 접두사 형식이 아닙니다. 길이 없는 배치의 짝수 잘림/꼬리 모호성을 숨기지 않습니다. utf16_string.readUnits를 counted 문자열과 공유하며 고립 서로게이트·NUL을 치환하지 않습니다. 실제 동영상 표본·문서 소유권·BinData 연결은 미검증이고 웹 태그/URL을 실행하거나 외부 파일에 접근하지 않습니다.

- `shape_rectangle.zig`는 태그 79의 round_rate와 네 꼭짓점을 소유합니다. specified_axes/observed_points를 명시적으로 선택하며 대칭 좌표나 길이로 추정하지 않습니다. `shape_point.Point.read`는 signed XY 읽기를 일반 선과 공유하고 실패 시 커서를 보존합니다. `rectangle_validation`은 owned_record.find로 $rec의 직접 자식 한 개와 고아/누락/중복을 검사하며 문서 rectangle_layout 기본값은 observed_points입니다. round_rate>100은 원문을 보존하는 진단이며 조판 유효성 오류로 강제하지 않습니다.

- `shape_ellipse.zig`는 태그 80의 속성과 center/axis1/axis2/start1/end1/start2/end2를 소유하고 Point.read를 공유합니다. bit 0/1/2~9 view와 unknownBits를 제공하되 원시 u32·모든 signed 좌표를 보존합니다. isArc=false여도 시작/끝 좌표를 지우지 않습니다. `ellipse_validation`은 $ell의 직접 자식 한 개와 고아/누락/중복을 문서에서 검사합니다. `owned_record.componentChild`를 사각형과 공유하며 좌표/속성 해석을 복제하지 않습니다. arcs/interval_updates는 독립 비트 진단이며 조판 의미 검증이 아닙니다.

- `shape_arc.zig`는 태그 81의 명시적 specified_u32(28바이트)/reference_u8(25바이트) 배치를 구분합니다. Header tagged union으로 속성/종류 필드의 원시 폭을 보존하고 세 Point와 extra를 빌립니다. 명세 표 참조의 불일치를 타원 비트 규칙으로 추정 보정하지 않습니다. `arc_validation`은 owned_record.componentChild로 직접 소유권·누락·중복·고아를 항상 검사합니다. 문서 arc_layout 기본값 null은 unselected/원문 길이로 보고하며 parsed로 세지 않습니다. 명시적 배치 선택 시 잘림이 문서/CFB까지 전파됩니다. 실제 호 표본·조판 검증은 아직 없습니다.

- `shape_polygon.zig`는 태그 82의 specified_i16_axes/observed_i32_points 개수·좌표 배치를 명시적으로 구분합니다. 음수 개수는 오류이며 입력에 맞춰 clamp하지 않습니다. `shape_points.Points`는 사각형과 공유하는 borrowed XY 배열·축별 배열 view이며 Reader/record_array/Point.read를 재사용합니다. 개수는 남은 바이트로 나눈 한도와 비교한 뒤 곱하며 읽기 실패 시 커서를 유지합니다. 0/1/2점·반복점·원문 순서와 extra를 보존하고 최소 3점/닫힘/꼬리 4바이트를 임의로 강제하지 않습니다. `polygon_validation`은 공통 owned_record.componentChild로 직접 소유권·누락·중복·고아를 문서에서 검사합니다. 문서 polygon_layout 기본값은 실제 짝 대조한 observed_i32_points이며 short_point_sets는 3점 미만의 개수 진단이지 조판 오류가 아닙니다.

- `shape_curve.zig`는 태그 83의 점 배열·구간 종류·extra를 소유합니다. 다각형과 CountedLayout/Points.readCounted를 공유하며 signed 개수·배치·음수 검사를 복제하지 않습니다. 0/1점은 인접 구간이 없고 n>=2는 n-1개의 구간 바이트가 필요합니다. 알려지지 않은 종류도 u8로 보존하며 잘린 필드를 0으로 채우지 않습니다. 실제 곡선 꼬리 4바이트의 의미는 미확정이고 원문 extra로 보존합니다. `curve_validation`은 공통 owned_record.componentChild로 직접 소유권·누락·중복·고아를 문서/CFB에서 검사합니다. 문서 curve_layout 기본값은 실제 짝 대조한 observed_i32_points이며 short_point_sets/unknown_segments는 원값 진단입니다. 곡선 보간·닫힘·조판 의미는 별도입니다.

- `shape_picture.zig`는 태그 85의 테두리·4점·자르기·안쪽 여백·그림 정보와 선택 고정 확장을 소유합니다. Points.read/Picture.read/line_attributes를 공유하며 좌표 배치는 separate_axes/interleaved, prefix는 base73/with_opacity74/with_instance78을 명시적으로 선택합니다. 부재는 null이며 길이/버전으로 자동 전환하거나 잘린 값을 0으로 채우지 않습니다. 실제 밝기/명암 비영 값은 짝 HWPX로 검증했고 미지 effect/꼬리는 보존합니다. 그림 효과·추가 크기/투명도는 별도 picture_tail 코어로 해석합니다. BinData 항목 범위는 picture_validation에서 검사하며 이미지 내용·외부 링크 검증은 별도입니다.

- `picture_validation.zig`는 owned_record.componentChild로 $pic의 직접 태그 85 한 개·누락·중복·고아를 검사하고 문서에 연결합니다. 기본 Options는 interleaved/base73/tail=null이며 선택하지 않은 꼬리는 extra_bytes로 남깁니다. tail 선택은 with_instance78 prefix를 요구하며 옵션 검증 규칙을 공유합니다. 선택한 확장의 오류는 문서/CFB까지 전파합니다. DocInfo 개수가 없으면 pending_references, 있으면 공통 optional_one_based 규칙으로 ordinal_references/absent_references를 구분하고 범위 초과를 거부합니다. 그림 ID 0의 부재를 다른 활성 이미지 채우기 규칙으로 일반화하지 않습니다. ordinal은 항목 범위 검증이지 이미지 디코딩/외부 링크/스트림 해결 완료가 아닙니다. parsed_tails/additional_properties/alpha_values는 명시적으로 읽은 단계의 개수입니다.

- `picture_color_effect.zig`는 표 114~115의 signed 종류/float 원시 비트와 알려진 종류 view를 소유합니다. `picture_color.zig`는 관측 type 0의 4바이트 색상 값과 counted 효과 배열을 원자적으로 읽으며 record_array를 공유합니다. 미지 종류·NaN·음의 0은 보존하고 배열 개수는 남은 바이트 한도와 비교한 뒤 곱합니다. 미확정 색상 타입은 UnsupportedPictureColorType이며 실패 시 커서를 유지합니다. RGB/CMYK 등의 타입 번호·채널 의미나 효과 조판을 임의 추정하지 않습니다.

- `picture_effect_fields.zig`는 그림자 44/네온 8/반사 56바이트의 이름 있는 고정 필드를 소유하며 float는 원시 u32 비트로 보존합니다. `picture_effects.zig`는 flags의 그림자→네온→soft edge→반사 순서와 optional 블록 조립을 소유하고 색상은 picture_color를 재사용합니다. 표 112의 53바이트 총길이를 필드 합계 56바이트 대신 쓰지 않습니다. 미지 효과 비트/색상 타입은 명시적 오류이며 중간 실패도 호출자의 커서를 유지합니다. 확장 크기·투명도나 그림 payload 배치를 자동 선택하지 않습니다.

- `picture_additional.zig`는 최초 이미지 크기 u32 두 개와 선택 INT8 투명도를 소유합니다. dimensions8/with_alpha9를 명시적으로 선택하며 null과 0·-1을 구분합니다. alphaByte는 같은 비트의 unsigned view이지 백분율 변환이 아닙니다. `picture_tail.zig`는 명시적 instance-id prefix 이후의 Effects→선택 Additional 조립을 소유하고 두 읽기 전체의 커서를 원자적으로 갱신합니다. 효과가 가변 길이인데 마지막 바이트나 고정 offset에서 크기/투명도를 추정하지 않습니다.

- `object_common.zig`는 tbl/gso/eqed 헤더의 공통 속성만 해석합니다. ID는 control_rules를 공유하고 UTF-16 길이 검사는 utf16_string을 재사용합니다. 설명 부재/빈 값, signed 위치와 unsigned 크기, 원시 플래그/꼬리를 보존하며 캡션·셀·도형 자식 레코드를 인라인 속성으로 소비하지 않습니다.
