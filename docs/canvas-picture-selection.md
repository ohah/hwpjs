# Canvas 그림 선택

## 데모 개체 속성 대화상자 계약

이 절은 개체 속성 UI 후보의 단일 계약입니다. 기존 그림 선택·드래그 및 Native resize의 지원 범위를 확대하지 않습니다. 별도 대화상자 명세 문서는 만들지 않습니다.

지원 대상은 현재 선택한 그림 중 기존 `pictureResizeTarget`이 허용하고, 원본 너비·높이가 모두 명시된 양의 절대 크기이며 비회전인 경우입니다. 보호·읽기 전용·미지원 상대 크기·그룹 파생 크기·자동/0/부재 값은 추정하거나 기본값으로 채우지 않습니다. 위치·회전·자르기·도형 및 표 속성은 이 창의 편집 대상이 아닙니다. 기존 Native가 다른 경로에서 지원하는 기능과 이 UI의 좁은 적격성을 구분합니다.

mm 표시는 반올림하지만 원본 HWPUNIT 정수는 별도로 보존합니다. 수정하지 않은 축은 표시 문자열을 역변환하지 않습니다. 열고 바로 확인하거나 최종 두 정수가 원값과 같으면 요청과 이력 변경은 0입니다. 너비만 수정해도 두 축을 요구하는 기존 API에는 높이 원값을 정확히 보냅니다. 숫자 문법은 기존 `exactParagraphNumber`, 단위 환산은 기존 `hwpUnitPixels`, 크기 적격성은 기존 그림 helper가 소유합니다. 비율 잠금은 원본 두 정수의 비율로 종속 축을 계산하며 잘못된 입력을 0이나 임의 경계값으로 보정하지 않습니다.

열 때 문서·token·section·pictureNode 및 실제 resize 대상 recordNode와 원값을 캡처합니다. 적용 때 현재 선택 identity, 문서/token, 원값과 최신 capability를 다시 검사합니다. 다른 그림 선택·문서 교체·undo 뒤에는 옛 초안을 새 대상에 전송하지 않고 다시 열도록 거부합니다. API가 주지 않는 opaque 객체 ref나 새 Native 권위를 만들지 않습니다.

확인은 기존 공개 SDK의 `requestExperimental`을 통한 `picture-resize` 단일 요청이며, 두 축을 여러 명령으로 나누거나 문서 모델을 직접 변경하지 않습니다. 실제 변경의 undo/redo는 기존 큐와 History가 소유합니다. 메시지·token·전송 함수와 호스트 콜백 접근을 끝낸 뒤 마지막 SDK 상태 identity를 확인하고, 요청 전 추가 외부 대상/초안 getter를 읽지 않습니다. 기존 SDK의 전송·token·Native 소유권 검증을 대체하지 않습니다.

`committed-refresh-required`는 반영 후 화면 확인 필요로 안내하고 자동 재시도하지 않습니다. 알 수 없는 실패를 미적용으로 단정하지 않습니다. 대기 중 창을 닫아도 접수된 편집 취소를 약속하지 않으며, 문서 교체·종료 후 늦은 결과는 새 문서의 안내나 포커스를 덮지 않습니다. 창은 기존 공용 dialog-layer의 키보드·IME·포커스 수명을 재사용합니다.

그림 우클릭에는 문서 명령과 `object-properties`만 추가합니다. 본문·선택 없음에는 이 명령을 추가하지 않으며 표 전용 명령과 별도 분기로 합성합니다. 전체 허용 목록 등록은 실행 권한이 아닙니다. 실행 시 기존 runtime availability와 현재 대상 검증이 남습니다.

개체 속성 단위 회귀45개와 registry/context 회귀29개는 별도 계약의 검사이며 합산한 전체 제품 시험 수로 안내하지 않습니다. [정규 명령](development-commands.md#object-properties-ui-tests)의45개는 공개 workspace package resolver와 명시 Runtime 대역을 사용합니다. 실제 격리 통과는 기존 SDK05 thin 연결에서 확인했으며 새 Core 빌드의 타입·실행 성공을 뜻하지 않습니다. SDK05 정확 핀 확인 sidecar1개는 별도 로컬 증거로 보존하고 정규45에 중복 합산하지 않습니다.

실제 UI·저장본 검증은 아래의 별도 범위를 따르며 인쇄·OS IME·전체 SDK/앱 strict는 포함하지 않습니다. 과거 그림 resize의 Native/Worker 통과 기록을 이 대화상자 E2E 성공으로 상속하지 않습니다.

### 그림 재선택과 비텍스트 이력

이전 R4 진단의 첫 재선택 비활성/두 번째 클릭 활성화와 R5의 텍스트 caret 대기는 후속 검증과 구분한다. 현재 R6 HWP5/HWPX 그림 UI에서 최초 단일 재선택, 우클릭 개체 속성, no-op과 너비만 변경, 메뉴 undo/redo와 반대 버튼 fence, Canvas 초점의 실제 키보드 undo/redo, 저장·새 Reader 재열기를 확인했다. 최초 textarea 전용 focus assertion 실패는 원자료에 보존했고 제품 변경이나 강제 포커스 없이 Canvas 초점 계약으로 고친 사례가 통과했다.

텍스트 위치 없는 결과와 포커스·이력의 단일 계약은 [비텍스트 이력](canvas-edit-history.md#텍스트-선택-없는-크기-편집-뒤의-이력)이 소유한다. 실제 UI의 표시169.7→입력170.7mm·높이21.64mm와 저장 raw 값은 별도 증거다. UI 관측만으로 picture ordinal·grouped 여부·원본 record를 확정하지 않는다. 공개 API stale/문서 교체/undo 대상 음성, 본문·표·none 컨텍스트 음성, 비율 편집·인쇄·OS IME는 이 실제 브라우저 검증에 포함하지 않았다.

### 그림 크기 저장본의 독립 검증

두 다운로드를 원본과 독립 비교해 원값48104×6134→48387×6134 HWPUNIT와 높이 정수6134의 정확 보존을 확인했다. HWP5는 section0의 picture ordinal0/component13, HWPX는 section0.xml의 비그룹 picture node31이 원본에서 유일하게 대응함을 독립적으로 확인했다. 이는 저장 oracle의 식별이며 UI의 raw 관측으로 취급하지 않는다.

HWP5는 CFB 디렉터리 의미 메타데이터·전체13스트림 이름과 대상 section 전체 레코드에서 허용한 현재/표시 크기·resize 행렬 변경만 비교했고 비대상 스트림은 바이트 동일했다. HWPX는 크기·행렬 및 조상 line cache1개 제거를 허용한 전체 XML 기대 트리와 다른14개 ZIP payload의 정확 보존을 일반 실행/Python `-O`에서 확인했다. 높이6135의 잘못된 기대는 양 형식에서 거부됐고 HWPX는 두 모드 모두 거부했다. 입력4개의 SHA는 전후 같았다. 기존 행렬 oracle의 수치 허용오차를 유지하며 물리 CFB 섹터·ZIP 압축/아카이브 메타데이터·픽셀/글꼴/전체 조판 동등성은 주장하지 않는다.

React/Svelte는 HWP5 로드·선택·표 모달 열고 닫기·개체 명령 존재·marks 복원의 제한 smoke만 확인했다. 두 adapter에서 그림 편집/저장 전체나 HWPX 경로를 모두 입증한 것은 아니다.
