# HWP5 현재 caret의 명시 차트 생성 transport

제품 통합 기준은 dcc4652b08c4adb8fda7e640100c0e141e843e02이며 현재 각주·검색을 보존한 chart overlay다. 독립 Native5+익명1의 기준은 be97d3b211e54a8a47a551c7d56bb5e0934ab812다. 그 Native 증거는 Section/Session·파일 재열기·managed History의 별도 근거이며, 이 ABI/SDK 파생 후보의 WASM 또는 built package 통과를 뜻하지 않는다. Root·공유 index·배포는 변경하지 않는다.

## optional ABI

js/abi-schema.mjs가 단일 출처다. tools/generate-abi.mjs로 src/wasm/abi_schema.zig를 생성한다. ABI6 필수 함수와 기존 hwp5_edit export 시그니처는 유지하며 다음3개만 추가한다.

| export | Wasm params | result |
|---|---|---|
| hwp5_edit_chart_create_profile_version | 없음 | i32 |
| hwp5_edit_chart_create_preview | ref_ptr, ref_len, request_ptr, request_len: i32 | i32 |
| hwp5_edit_create_chart_current | 위4개 + PNG_ptr, PNG_len: i32 | i32 |

profile_version1은 기본값 없는 실험 profile `spec24-registered-png-presentation-v1`만 뜻한다. 2D clustered column authored data만 받으며 HWPX의 다른 chart-family profile을 HWP5로 전달하지 않는다. profile_version2는 기존 막대 profile과 `spec24-registered-png-presentation-line-v1` 표준 2D 꺾은선 profile을 함께 노출한다. 새 SDK는 version1 엔진에서 막대만 노출하고 version2 엔진에서 두 형식을 노출한다. version1만 인식하는 구형 SDK는 version2 WASM에서 HWP5 차트 생성을 활성화하지 않으므로 같은 번들의 SDK와 WASM을 함께 사용한다. PNG는 shared painter의 실제 Canvas encoder 결과이며 OLE 안의 등록 PNG presentation에 저장된다. 외부 HWP 앱 지원은 아직 미증명이다.

preview 입력은 `{start,profile,data}`이고 결과는 기존 Native create_preview.zig의 JSON bytes다. schemaVersion1, scope hwp5-chart-create-preview, executionAuthority false, authored XML SHA256과 실제 chart display_values를 포함한다. owner/reference·열린 Session·HistoryV2가 필요하며 읽기만 한다. 결과가 삽입 권한을 부여하지는 않는다.

create 입력은 `{start,profile,width,height,expected_text_utf16le,data,source_xml_sha256,pixel_width,pixel_height}`와 별도 PNG bytes다. unknown/duplicate JSON 필드는 거부한다. 현재 view epoch의 source reference를 해석하고, 실제 Session 명령에 현재 History ticket을 전달한다. body/field/lock·current source witness·XML hash·PNG·직렬화 보존·원자적 게시 검사는 be97 Native 명령에 그대로 남는다. code0은 거부,1은 적용,3은 불확실/poison이며 불확실 결과를 자동 재시도하지 않는다.

전송의 명시 한계는 reference1KiB, preview request4MiB, create JSON16MiB, PNG8MiB, expected UTF16 bytes1MiB다. 이는 기존 Session semantic text budget이나 read retained budget의 재정의가 아니다.

## JS와 현재 owner 수명

createHwp5CurrentReferenceApi가 기존 encode/reference scope를 공유한다. 새 helper가 scoped reference를 다시 만들거나 scope를 제거하지 않는다. cell reference는 거부한다. 생성 전 실제 Native current UTF16 bytes를 소유 복사하고 PNG 인코딩 전후마다 같은 reference/epoch/text와 host current를 검사한다. 다른 editor·닫힌 editor·도중 epoch 변경이면 Native mutation에 도달하지 않는다.

`editor.chartCreatePreview(request)`는 읽기 전용 JSON wire bytes를 반환한다. `await editor.createChart(request,{createCanvas,current})`는 기존 renderHwp5ChartCreatePreview와 공통 projector/painter를 직접 실행한다. 외부 precomputed PNG를 public JS 요청에 넣을 수 없다. final PNG는 재검사 후 Native에 전달하며 completion/cleanup/poison 분류는 기존 applyNativeEdit를 재사용한다.

## 공개 SDK와 Runtime

Hwp5ChartCreateOptions는 `{profile,width,height,categories,series,preview:{width,height}}`다. 공개 CREATE_CHART_COMMAND의 기존 payload `{target,selectionVersion,options}`를 재사용한다. HWP5는 현재 display caret의 source currentReference와 display→raw unit 변환을 사용한다. Native paragraph ordinal이나 HWPX owner를 꾸며내지 않는다. capability·History2·readOnly·현재 token/selection·full document·body owner 검사를 Core 큐와 Runtime에서 반복한다. 기존 HWPX wire는 그대로다.

픽셀 각 변64..2048/총4M을 유지한다. 임의 HWPUNIT 크기는 정수 PNG와 정확한 기약비를 갖지 않을 수 있으므로 긴 변을 기준으로 짧은 변을 가장 가까운 정수 픽셀로 반올림한다. half-up 정수식을 JS와 Native ABI에서 공유하며 문서 width/height는 바꾸지 않는다. 예:20001x12000과270x162는 허용,270x163은 거부한다. 실패 기대를 없앤 것이 아니라 새 exact-ratio 정책의 불필요한 거부를 독립 반례로 교정했다.

`hwp5ChartCreatePreviewMessage(payload,state)`는 동일 admission으로 `{kind:'hwp5-chart-create-preview',request}`를 만든다. 공개 Core.readResource(message,{token})로 보내면 RuntimeReply.preview가 Uint8Array다. history/revision·내용 mutation은 없다. UI의 DOM Canvas PNG는 미리보기 전용이다.

최종 create-chart는 Worker reader-runtime이 소유한 OffscreenCanvas를 주입한다. Runtime의 editor identity/History2/poison current 검사와 JS의 Native reference/epoch/text 검사가 비동기 구간을 함께 보호한다. OffscreenCanvas가 없으면 chartCreationAvailable은 false다. content.hwp5ChartCreateProfileVersion, 선택한 profile 및 chartCreationAvailable을 함께 확인해야 한다. 실험 profile을 UI에서 자동 opt-in하지 않는다.

## 증거와 열린 gate

Node transport mock11개, Bun Core source10개(직접 admission7/실제 공개 dispatch/readResource 큐3)는 별도 증거다. Node의 최초 Core import 실패2건은 누락된 own 추적 defaults.json과 JSON import attribute 문제였으며 원 오류를 보존했다. own baseline JSON을 정확히 materialize한 뒤 CI와 같은 Bun으로 전체 Core source imports를 검사했다. 이것은 Node built package/declaration 통합 검사로 대체하지 않는다.

기본 HWP5 chart read 경로는 여전히 observed26이다. be97의 spec24 출력은 명시 layout Native 조회가 필요하다. 이 후보는 혼합24/26과 fresh-open UI 표시를 해결했다고 선언하지 않는다. Peirce의 UI는 별도 변경이며 기존 options/disabled를 자동으로 풀지 않는다. spec24 표시 adapter·실제 UI→Worker→WASM·실제 PNG 시각 일치·full Command OOM 및 외부 앱 gate는 열린다.

새 artifact hash를 Native module profiles에 자동 등록하지 않는다. whole WASM 컴파일·실제 optional/기존 시그니처 비교, 등록 기준 검증, 정상 built package 산출물 후 Node 선언/import/SDK 실행과 real UI는 각 별도 승인·증거가 필요하다. 이번 준비에는 새 Native/WASM/browser/배포 실행이 없다.


## 레코드별 읽기 후보와 기존 raw 호환

b9ab 파생 소스 후보의 기본 candidates/display는 각 owned tag84를 독립 선택한다. 정확24바이트는 spec24, 26바이트 이상은 기존 observed26 prefix와 borrowed opaque tail을 유지한다. 0..23 및25바이트는 UnexpectedEnd다. 문서 전체 재시도나 tail 내용 추측은 없다. attributes/aspect/baseline/objectKind/reserved bit에 새 허용목록을 추가하지 않는다. 기존 validator 진단, owner/anchor/ordinal/resource 검사와 registry는 유지한다. 명시 WithLayout 조회와 optional ABI 시그니처는 불변이다.

사용자 승인 local77c의 payload30은 observed26 본문과 4바이트0 꼬리다. exact24/26 초안은 이를 거부하므로 폐기했으며 최초 초안 증거는 패킷에 보존한다. 승인7a4 raw에는 tag84가 없어 legacy OLE 표시 근거로 세지 않는다. 새 own 저장681855는 payload24이며 observed26 최종 필드가2바이트 부족한 최초 실패를 보존한다.

opaque tail은 기존처럼 원시 보존할 뿐 차트 소유권이나 자원 실행 권한이 아니다. 새 허용목록이나 tail 제한은 별도 근거 없이 도입하지 않는다. synthetic mixed24/26/30 및 미지 tail/raw enum, 잘림·잘못된 ordinal 반례와 실제681855/77c sidecar parity를 준비한다. 이 절은 소스 계약이며 Native/WASM/UI 실행 통과 선언이 아니다.
