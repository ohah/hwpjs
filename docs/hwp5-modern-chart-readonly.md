# 기존 HWP5 OOXML 차트 읽기와 미리보기

이 문서는 기존 파일의 알려진 차트 자원과 물리 소유권을 읽어 표시하는 경로 및 당시 후속 이력을 기록한다. 현재 제한된 own HWP5 차트 데이터 편집은 별도 [편집 계약](hwp5-chart-literal-edit.md)을 따른다. 아래 읽기 전용 속성 후보의 과거 기록을 현재 데이터 편집 전체의 미지원 선언으로 읽지 않는다. HWP5 차트 생성 writer, 생성 권한 또는 두 표현의 값 편집을 추가하지 않는다. `Contents`는 존재 여부만 관측하며 해석하거나 새 문서의 템플릿으로 복사하지 않는다. 생성 파일의 외부 열기 `4100` 문제는 별도 미해결이다.

## 읽기 경로

Session의 `hwp5ChartCandidates`는 현재 구역과 문단 토큰에서 실제 OLE 소유자와 앵커를 연결한다. 요청 단위 BinData 색인은 DocInfo와 CFB 이름을 한 번 읽는다. 알려진 원본 자원만 읽고 생성 자원 overlay나 새 이력 종류를 소유하지 않는다. 후보의 물리 ID·자원 SHA·소유 구역·현재 앵커를 display snapshot에 연결한다. `/OOXMLChartContents`는 엄격한 기존 CFB 및 차트 XML reader로 읽는다. `/Contents`와 직접 루트 표시 stream은 해석 없는 원본 관측이다.

선택형 읽기 WASM export는 `hwp5_edit_chart_display_profile_version`, `hwp5_edit_chart_candidates`, `hwp5_edit_chart_display` 세 개다. 기존 required ABI와 버전은 유지한다. JS facade는 현재 Native epoch·revision·소유자·자원 식별을 검증한다. Core 및 Surface의 `hwp5-chart-display` 읽기를 통해 renderer의 전용 자원 cache와 같은 공용 차트 projector·painter로 연결한다. 이 관측은 쓰기 target이나 object geometry 권한이 아니다.

kind0 OLE는 그 자체로 차트가 아니다. 같은 물리 소유자의 자원이 `modern_chart`로 확인된 경우에만 표시 프레임 후보가 된다. 구성요소의 original/current 좌표와 문서의 최종 크기를 구분하고 기존 Native local matrix 및 공용 affine·drawing geometry 검사를 사용한다. 빠진 행렬을 크기 비율로 만들지 않는다. unknown 회전, 반사, 기울임, 이동, 그룹 offset 및 불완전한 소유권은 계속 거부한다.

표시 metadata가 비어 있는 H5 문서의 COW 및 이력 경로는 공통 temporal transition을 사용한다. 이미 검증된 Native before/current epoch·revision과 baseline stamp가 맞아야만 root stamp를 바꾼다. 그 외 헤더는 전체 비교한다. 차트가 실제로 있거나 오류·미해결 자원이 있는 문서는 기존 full snapshot 경로를 유지한다. 현재 `createdCellTypingScope`의 body ticket·형식·권한 검사를 그대로 보존한다.

## 입력과 검사 경계

새 공식 읽기 양성은 SHA256 `77c06c7027a3cb48265b81f177c9a4dc20769910404b3f6e803a727ef2071e81`, 65,536바이트다. 공개 documented API가 own HWPX를 HWP로 변환했고 공식 UI fresh reopen에서 10·20·30을 관측한 입력이다. 소스 준비의 독립 원시 읽기에서도 내부 OOXML의 숫자 literal 10·20·30과 문자열 literal 가·나·다를 확인했다. 이 파일은 private 검증 입력 역할이며 제품 패치의 binary payload가 아니다. 불투명 Contents stream을 별도로 추출하지 않는다.

과거 `65def...`와 r28의 cached frame fixture는 이전 소스 회귀 자료로만 유지한다. 새 입력에 대한 Native·SDK·Canvas 성공으로 다시 기록하지 않는다. r30 생성 probe도 읽기 성공 증거로 쓰지 않는다.

`test-hwp5-chart-read-only`는 공개 저장소만으로 구성되는 자체 synthetic4를 등록한다. OOXML 자원 소유권·오류·루트 표시 stream 반례 3개와 BinData 이름 색인 1개이며, 비공개 공식 입력을 포함하지 않는다. `test-hwp5-chart-read-source`는 기존 소스 검사와 정규 등록의 비공개 입력 비의존 회귀를 연결한다.

공식77c를 사용하는 실제 Session 조회 3개는 정규 제품 시험 파일과 build graph에서 분리한 private reference sidecar다. `hwp5_chart_read_reference_probe.zig`가 정규 synthetic4와 공식 입력3을 합쳐 기존 정확 명명7을 유지한다. 참조 실행에는 제공된 전체 입력의 SHA와 크기를 먼저 검증하고, 별도 불변 실행 소스에만 reference overlay와 전체 입력을 배치해야 한다. 입력이나 reference probe를 정규 CI가 묵시적으로 찾도록 하지 않는다. 참조7의 실제 실행은 아직0이며 정규4만으로 기존7 검증 완료를 주장하지 않는다.

이 문서를 작성한 단계에서는 source JS·TypeScript·format 검사만 수행했다. Native 시험, 공식 Small·정상 SDK 및 실제 Canvas 입력·표시 검증은 아직 실행하지 않았다. 정규 Source test의 등록과 새 optional ABI를 실제로 컴파일·실행하는 검증은 다음 정확 소스·산출물 핀과 Main 승인으로 진행해야 한다. 읽기 소스 후보가 작성됐다는 사실을 차트 쓰기 상호운용이나 전체 기능 완료로 확대하지 않는다.

## 이번 소스 검사 결과

최종 소스 검사 7개 파일에서 49개 통과, 실패·생략 0을 확인했다. 여기에는 이전 자체 작성 평면 배치 Map 반례를 현재 소스에서 다시 실행한 4개가 포함된다. 합성 행·개체 수 32·64·192에서 각 요청의 문단 상자 검사는 한 번, 위치 계산은 개체마다 한 번이었다. 공용 페이지 배치의 개체별 스캔·정렬은 이번 변경에서 수정하지 않았으므로 전체 경로의 선형 시간 완료를 주장하지 않는다.

선택한 Core TypeScript 소스 7개 타입 검사는 통과했다. 기존 Surface 소스 회귀는 같은 후보의 정상 Core dist가 아직 없어 provider 준비 단계에서 실패했다. 옛 SDK로 대체하지 않았으며 해당 검사는 통과로 집계하지 않는다. Native 명명 7개는 미실행이며 WASM ABI 실제 확인, 기존 HWPX 공용 값 조회 회귀, 새 정상 SDK의 COW 실제 40개, 새 공식 입력의 실제 Canvas 미리보기도 남아 있다.

## 정규 등록 전제 교정

이전47 후보는 비공개 공식 입력 시험을 정규 root에서 직접 import했지만 binary는 제품 패치에서 제외해 clean clone에서 컴파일할 수 없는 등록 전제가 있었다. 이 후속은 제품 읽기 동작을 바꾸지 않고 정규 synthetic root와 명시 reference sidecar를 분리한다. 옛 동결과 그 소스 검사는 보존하며 새 Native 성공으로 고치지 않는다.

## 선택형 ABI 등록 소스 후속

새 읽기 export3은 앞 후보의 canonical optional registry에 없었다. 이 후속은 HWP5_CHART_READ_ABI를 이름과 정규 Wasm 시그니처의 단일 출처로 두고 함수 목록을 파생한다. 공식 generate-abi가 Zig의 선택형 이름과 시그니처를 생성한다. 정규 시그니처는 profile과 candidates가 각각 빈 인자에서 i32 하나, display가 i32 두 인자에서 i32 하나다. Native u32의 Wasm 표현이며 새로운 required ABI가 아니다.

JS facade는 같은 그룹 전체 존재와 profile1을 요구한다. 구엔진·부분 누락·다른 버전은 조회 전에 거부하고 DTO도 version1을 요구한다. ABI6 required와 기존 optional 목록 및 프로필 해시는 유지한다. 이 단계의 생성 일치·JS 경계·타입 회귀는 실제 WASM export나 정상 SDK 검증이 아니다. 원r3와 명명7 Session 참조 입력은 그대로 보존하며 정식 optional ABI 실제 컴파일·바이너리 검증과 공개 SDK는 별도다.

정규 소스 타입 회귀는 `bunx --no-install tsc --noEmit --project tools/tests/tsconfig.hwp5-chart-optional-read.json`이다. 직접 공개한 선언의 숫자 인자·두 좌표 필수·DTO version1을 검사하며 정상 umbrella SDK 타입 소비자 검증을 대신하지 않는다.

## 필드 검색과 선택형 ABI의 합성 후보

b972 통합 tree에 필드3bbb 후보를 포트할 때 HWP5 차트 signature map·profile1·read3 및 required ABI6는 그대로 유지한다. 필드 후보는 HWPX 선택형 control-read 목록에 current/identity 두 함수를 추가하고 기존 legacy endpoint는 유지한다. 이름 목록을 별도로 하드코딩하지 않고 원본 JS 스키마에서 차트 시그니처와 readonly/current 읽기 목록을 함께 생성한다.

기존 차트 registry digest 시험은 HWPX 선택형 목록의 이 의도된 확장에서도 실패했다. 최초 실패 로그와 원 digest를 보존하고, 새 세 항목의 정확한 전체 배열을 단언한 뒤 legacy 한 항목으로 투영한 과거 registry 전체에 같은 digest를 검사한다. legacy/current/identity 각각의 누락·추가·순서 변경 및 required/다른 optional 변경을 거부하는 음성 회귀도 추가한다. digest를 새 값으로 바꾸거나 선택형 목록 검사를 제외하지 않는다.

이는 합성 소스의 경계 검사다. 기존 frame fixture는 이전 자체 관측 소스 회귀로만 사용하며 공식77c의 새 Native/SDK/Canvas 증거로 세지 않는다. 필드3bbb의 별도 집중 Native boundary5와 budget6 성공은 새 b972 포트의 컴파일·Native 성공으로 승계하지 않는다. 포트 이후 새 Native 실행은0이다.

## HWP5 차트 더블클릭 읽기 전용 속성 후보

351899 기반 격리 후보는 기존 painted HWP5 차트의 controlNode 주소로 속성을 연다. HWPX wrapper 주소로 바꾸지 않는다. 현재 display capability, 유일한 metadata owner, component/ole/본문 앵커, source epoch와 history revision이 일치해야 한다. provisional paint는 객체 선택 근거가 아니다.

HWP5 전용 port는 현재 StateToken으로 hwp5-chart-display를 다시 읽고, 응답의 section/controlNode/history 및 기존 hwp5ChartDisplayMatchesTarget으로 물리 소유자와 자원 SHA를 확인한다. 응답 대기 중 문서나 상태가 바뀌면 게시하지 않는다. 별도 모달은 제목과 Native 너비/높이만 보여주며 크기/위치/데이터 편집 명령은 제공하지 않는다. 문서 교체와 dispose는 창과 구독을 정리한다.

집중 검사는 `node --experimental-transform-types --test apps/demo/tests/hwp5-chart-properties.test.mjs`이며 합성18개다. 기존 객체122개와 합쳐140개가 통과했다. 같은 source로 normal4 및 공식 public producer/verify를 실행하고 기존 WASM221694를 재사용했다. Native 컴파일이나 새 ABI/권한 등록은 없다.

실제 loopback browser에서 공식77c 입력 SHA와 Canvas 좌표480/530을 수정 전후 동일하게 유지했다. 수정 전 trusted dblclick의 속성 창은0개였고, 후보는 HWP5 차트 속성의 제목과127mm/77.61mm를 표시했다. 새 resource 응답은 controlNode17, component18, ole19를 유지했고 history revision0 및 전체 historyStats가 같았다. HWPX 차트 속성도 같은 후보에서 다시 열렸다. 공개119에 private 입력을 추가하지 않았다.

HWP5 단일 클릭 후 P는 이번 실제 관측에서 current selected-object 모드가 확정되지 않아 창이 열리지 않았다. 이 후보의 브라우저 완료 범위는 더블클릭 읽기 전용 속성이다. P/toolbar 동등성, HWP5 차트 편집이나 모든 배치 종류 지원으로 확대하지 않는다. Root 통합과 배포는 별도이며 소유 browser/server는 종료했다.

## 생성 spec24 차트의 표시 프레임

Native가 읽은 spec24 소유자는 observed26의 kind 필드를 가지지 않는다. 표시 프레임은 spec24에서 알려진 content aspect attrs=1과 같은 소유자의 modern_chart 자원이 함께 있을 때만 허용한다. 다른 low bits, moniker 또는 미지원 속성을 넓게 허용하지 않는다. observed26의 기존 kind0/1 및 resource 조건은 그대로 유지한다. 이 분기는 표시 전용이며 쓰기 target, 생성 권한 또는 Native 소유자를 만들지 않는다.

두 형식 모두 기존 Native owner/local transform, 원본과 현재 크기, component offset 및 matrix, body anchor 연결 검사를 계속 통과해야 한다. 누락/다른 owner/중복 transform과 미해결 자원은 거부한다.

chart-read-frame-affine.test.mjs는 직접 생성한 633 Worker의 spec24 관측과 독립 크기 기대값을 사용한다. attrs 양성/음성, resource 부재, 다른 소유권, 기존 observed26의 30-byte 프레임 전체 동치와 projection을 검사한다. 관측 fixture에는 자체 생성 파일의 SHA와 Native SHA를 기록한다. 기존30 동치는 수정 전 모듈의 전체 frame을 고정해 비교한다. 이 소스 검사는 실제 Canvas의 후속 통과나 외부 한글 호환성 완료를 대신하지 않는다.
