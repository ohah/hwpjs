# HWP5 차트 생성 UI 경계

이 UI는 [기존 HWP5 차트 읽기](hwp5-modern-chart-readonly.md)와 별개인 새 생성 요청의 임시 입력과 미리보기를 준비한다. 실제 생성·ABI·Native 자원·Worker·이력은 SDK lane 소유다. 기존 HWPX16종과 wire/disabled 정책을 변경하지 않는다.

브라우저 provider는 기존 renderHwp5ChartCreatePreview와 실제 Canvas만 사용한다. fixture 이미지, cached previewValue, screenshot 또는 PNG data URL을 생성 입력으로 받지 않는다. 임시 Canvas는 converter가 해제한다. UI PNG는 미리보기용이며 최종 생성은 Worker OffscreenCanvas가 fresh current reference/epoch/text를 확인하고 다시 그린다.

입력 lane은 기존 ChartCreateOptions validator로 draft를 비동기 작업 전에 복사한다. 같은 SDK owner/caret current를 Native preview, encode 및 take 직전 확인한다. 취소/문서 교체/폐기/중복 제출은 결과를 버린다. take에는 Native capture와 options만 있고 PNG bytes가 없다.

선택적 readonly port는 정식 hwp5ChartCreatePreviewMessage와 readResource를 사용한다. profile은 명시적으로 제공해야 하고 선택한 profile을 지원하는 hwp5ChartCreateProfileVersion, chartCreationAvailable, 현재 body owner/caret와 History2 및 Core availability가 필요하다. API/권한을 추정하거나 option/disabled를 우회하지 않는다. 명시 HWPX family 옵션을 HWP5 기본 bar로 몰래 바꾸지 않는다.

raster planner는 문서 크기를 보존하며 SDK nearest-pixel half-up 규칙과64..2048/4M 예산을 따른다. 일반 밀도는 기존 HWPUNIT CSS 변환을 사용한다. 극단적 비율이 두 축 범위를 만족하지 못하면 거부한다.

집중 소스 검사는 node --experimental-transform-types --test apps/demo/tests/hwp5-chart-create-input-lane.test.mjs apps/demo/tests/hwp5-chart-create-preview-port.test.mjs apps/demo/tests/hwp5-chart-raster-size.test.mjs 이며 Socrates의 확정 SDK source dependency를 먼저 결합해야 한다. 신규31개와 기존 HWPX11개를 구분한다. 실제 DOM collect/Canvas/PNG 검증은 합성 Native DTO를 사용했으므로 실제 Native 생성·이력·저장·재열기 완료가 아니다.

기존 차트 메뉴는 실제 chartCreationAvailable, 선택한 profile을 지원하는 hwp5ChartCreateProfileVersion, History2, 현재 body caret 및 Core availability를 확인한다. 모달을 여는 시점의 caret owner를 보존하고 미리보기와 비동기 생성 중 같은 owner를 확인한다. 문서나 세대 교체, 취소, 폐기 뒤의 늦은 결과는 기존 대화상자, 상태 메시지 또는 focus에 반영하지 않는다.

HWP5 생성 방식은 빈 선택으로 시작하며 사용자가 기본 세로 막대, 기본 꺾은선, 또는 엔진이 지원하는 가로 묶은 막대 중 하나를 선택한다. 미선택 시 생성과 미리보기를 거부한다. 기존 HWPX 대화상자와 차트 종류는 유지한다. 기존 readonly HWP5 차트 속성은 생성 권한과 별개다.

추가 hwp5-chart-create-wired.test.mjs는 실제 메뉴 port, 입력 도구, grid collector, SDK helper 및 converter 연결을 검사한다. 합성 응답과 mock Canvas 검사이므로 실제 Worker, Native, 브라우저 화면 또는 저장 성공을 대신하지 않는다. 일반 SDK dist를 사용하는 보존 검사와 실제 브라우저 결과는 격리 검증 패킷에 분리한다.

현재 SDK의 spec24 생성과 observed26 읽기는 별개 계약이다. 생성 응답이 성공해도 실제 표시와 저장 후 재열기를 각각 확인해야 한다. 미지원 읽기 profile을 다른 형식으로 바꾸거나 등록을 우회하지 않는다.

## 원형 차트가 있는 본문에 표 삽입

본문의 인라인 HWP5 차트 뒤에 표를 삽입할 때, 생성 표와 저장 후 다시 연 원본 표 모두 기존 차트의 물리 소유자와 본문 앵커를 사용합니다. 표와 차트의 측정은 같은 문단 흐름에 반영합니다. 차트 앵커가 중복되거나 원본 소유자와 일치하지 않으면 기존 배치 거부 정책이 적용됩니다.

공개 원형 차트 예제에서 기본 5×5 표를 삽입하면 이전 구현은 생성 표에서 `UnsupportedCreatedTableHostControls`, 새로 연 저장본에서 `InvalidInlineTableHostAnchors`를 반환했습니다. 현재 회귀 검사는 실제 WASM에서 얻은 삽입 전·삽입 직후·재열기 상태를 사용합니다. 세 상태의 용지 기하와 차트 앵커가 같고, 편집 후 두 상태 모두 25개 셀이 너비 480 CSS 픽셀로 배치됩니다. 독립 CFB 검사로 표의 행·열과 기존 차트 레코드·BinData 보존도 확인했습니다.
