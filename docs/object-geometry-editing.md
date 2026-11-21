# 차트·글상자 크기와 위치 편집 계약

이 문서는 차트·글상자 크기와 위치 편집의 소유권 계약과 측정한 범위를 구분합니다. 아래 집중 Native·정상 Core·실제 GUI 증거는 각각 명시한 입력과 경로에 해당하며, 모든 개체·변환의 지원 완료를 뜻하지 않습니다.

공개 DTO의 단일 출처와 패키지 선언 검증은 [공개 타입 경계](object-geometry-public-types.md)를 따릅니다.

개체 속성의 읽기 정보와 변경 권한은 분리합니다. 기존 차트 표시 자원과 글상자 observation은 제목·내용 조회에 사용합니다. 크기·위치 입력은 `getObjectGeometry`가 같은 현재 상태에서 새로 받은 Native frame만 사용합니다. Canvas 사각형이나 이전 preview는 수정 기준이 아닙니다.

Core는 Native selector, 실제 control/component owner, 현재 문단·anchor, source SHA256, package link, frame, Native history revision과 session/serial을 캡처하고 불투명 target을 발행합니다. 다른 editor, 문서 교체, 선택만 바뀐 상태, undo/redo를 포함한 상태 변경 뒤의 target은 거부합니다. 공개 experimental 요청은 typed geometry 경로를 우회하지 못합니다. Native도 write 직전에 session/serial/revision과 owner/source/frame을 재검증합니다.

크기는 양의 u32, 위치 간격은 signed i32 source 단위입니다. UI는 기존 그림의 mm 변환을 재사용합니다. 편집하지 않은 표시 반올림 값은 원본 단위로 역변환하지 않습니다. 글자처럼 취급은 명시적인 별도 입력입니다. 위치 간격만 바꿨다고 floating으로 전환하지 않습니다. 간격은 기존 배치 기준을 유지하며 절대 페이지 좌표를 뜻하지 않습니다.

HWPX 차트는 같은 switch의 chart/OLE 두 geometry를 함께 준비합니다. 크기 선언·current size·행렬을 모두 준비한 뒤 기존 document history가 완전한 Session을 한 번 교환합니다. 저장 과정에 node 번호가 바뀔 수 있으므로 현재 owner를 먼저 확인하고 저장된 source에서 유일한 link와 현재 문단·anchor로 다시 확인합니다. 실패하면 기존 Session을 유지합니다. 원본 좌표계의 크기·점·회전 중심은 기존 그림 resize와 같이 보존합니다.

HWP5 글상자는 고정 길이 control/component payload와 행렬을 준비하고, record topology를 유지하는 section source basis만 교체합니다. 기존 paragraph/table/style intent를 다시 투영하거나 임의로 지우지 않습니다. 기존 history checkpoint가 이전 basis를 소유하므로 undo/redo와 저장에 같은 source가 사용됩니다. 이 경로의 실제 Native 검증 범위는 아래 측정 기록과 남은 감사 항목에서 구분합니다.

크기 변경 후 다시 선택할 때도 현재 Native frame과 실제 꼭짓점·행렬이 일치해야 합니다. 글상자의 양의 축 배율은 기존 `drawingAxisGeometry`로 확인하고 HWP5의 raw/component/local transform 교차검증을 유지합니다. OLE는 선택적인 Native axis frame(원본·현재 크기, 행렬, 각도, flip, local offset)이 현재 geometry와 일치하는 경우에만 같은 축 배율을 배치에 사용합니다. 이것은 표시 증거이며 수정 권한이나 이전 차트 데이터의 재사용 권한이 아닙니다. preview 호환성은 여전히 현재 owner·frame·link를 확인하고 authoritative value는 현재 read 성공 전까지 null입니다.

## 측정한 실행 범위

집중 Native 코호트는 이름 있는 7개와 import된 익명 3개를 구분해 모두 통과했습니다. HWPX 차트·글상자와 HWP5 글상자의 실제 원본 변경, 저장·undo/redo·재열기 및 해당 시험의 거부·할당 실패 검사를 포함합니다. 앞선 컴파일 오류와 signed 위치 직렬화 실패 코호트는 보존했으며, 성공한 후속 실행으로 덮지 않았습니다. 통합 첫 실행의 원본 fixture 누락은 제품 동작 실패와 분리했고, 정확한 원본을 포함한 새 코호트에서 실행했습니다. 이 수치는 전체 Native suite 통과를 뜻하지 않습니다.

정상 빌드의 Small WASM SHA256 `fe6092257efb40ff93b92c7de59bb9bd75c3828ebde6db48116a3fe219225334`(4,709,323 bytes)을 공식 loader와 현재 profile로 연 정상 Core 시험 3개는 HWPX 차트·글상자와 HWP5 글상자의 typed frame, 변경, 저장·undo/redo·재열기를 확인했습니다. 기준 저장은 target 발급 전에 수행합니다. target을 발급한 뒤 저장하여 상태가 바뀐 경우의 stale 거부를 완화하지 않습니다. HWP5 기본 저장의 `LayoutReflowRequired` 거부와 Native revision 유지, 명시적 `allowStaleLayout` 저장도 별도로 확인합니다. 시험의 source Core/public Core 이중 import로 생긴 command symbol 불일치는 제품 권한 변경 없이 공개 진입점을 통일했습니다.

같은 정상 엔진을 제공한 Vanilla 데모의 실제 파일 입력·마우스·P·폼·다운로드 경로로 세 문서를 확인했습니다. 차트는 110×65mm, 간격 3/2mm 및 글자처럼 취급 해제를 적용하고 두 거래의 undo/redo를 확인했습니다. HWPX/HWP5 글상자는 50×25mm, 간격 37/42mm를 적용하고 undo/redo를 확인했습니다. 세 저장 파일을 페이지 reload 후 다시 업로드하여 현재 속성값과 개체·본문 표시가 유지되는 것을 확인했습니다. HWP5에서는 기본 저장이 실제 UI에서 거부된 뒤, 사용자가 ‘줄 배치가 달라질 수 있는 HWP 저장 허용’을 직접 선택한 후 저장했습니다. 이는 외부 한컴 응용 프로그램에서 연 결과의 증거는 아닙니다.

GUI 진입은 현재 Canvas 차트 또는 글상자 테두리를 선택한 뒤 P입니다. 차트 첫 클릭 직후 선택 없음이 관측됐지만, 추가 클릭 없이 이후 P로 속성이 열렸습니다. 이 관측을 즉시 P 또는 pending 입력 경쟁의 검증으로 해석하지 않습니다. 이 GUI 코호트 당시 ribbon/menu의 ‘개체 속성’ 명령은 그림 전용 연결이었으므로, 이 결과로 후속 공통 명령의 실행까지 증명하지 않습니다. 글상자 내부 caret/P 회귀도 이 세 문서 GUI 코호트에 포함하지 않았습니다.

실행별 원본·실패·입력 해시·저장 파일·화면 증거는 각 소유 검증 패킷에서 관리합니다. SDK/Core 실행과 GUI는 별도 코호트이며 소스 시험 통과 수와 합산하지 않습니다.

## 남은 감사·실행 gate

- HWP5의 임의 OLE를 차트로 간주하지 않습니다. 실제 chart owner와 binary link를 구별하는 경로는 아직 미완료입니다.
- 그룹, 회전, flip, shear, 알 수 없는 변환과 상대 크기는 현재 후보가 완료했다고 주장하지 않습니다. 기존 거부를 임의로 항등 변환으로 치환하지 않습니다.
- HWPX source-basis 교체 후 원본 package와 달라진 tree의 chart association, pending table의 저장 후 owner 전환은 Native 집중 검증 대상입니다.
- Native source parser·atomic rollback/OOM·저장/undo/redo/reopen 시험, 정상 WASM/JS 합본, 실제 속성 입력·적용·재선택·재열기 GUI는 별도로 측정합니다. JS 대역 시험과 타입 검사는 이를 대신하지 않습니다.

## 속성 명령 진입

Canvas가 확인한 현재 개체 선택은 표시 identity이며 Native 변경 target이 아닙니다. P, double-click과 명시적인 속성 명령은 같은 현재 token·원본 membership 확인과 형식별 속성 도구를 사용합니다. command는 `getSelectedObject()`의 현재 선택만 표시하며 target을 별도 캐시하지 않습니다. 선택이 없는 본문 caret·pending pointer intent에서 명령을 호출해도 대상이나 Native 권한을 만들지 않습니다.

속성 버튼과 그 버튼이 있는 메뉴의 제목만 명시적으로 Surface에 등록합니다. 등록된 컨트롤 자체, 하위 입력, 상위 FORM·editable 및 shadow host를 포함한 전체 composed path의 편집 입력 경계에서는 포커스 보존을 거부합니다. Canvas에 포커스가 있고 현재 선택이 확인된 trusted primary pointerdown만 이 컨트롤에서 포커스를 유지합니다. 전체 popup이나 다른 메뉴 명령을 선택 보존 영역으로 등록하지 않습니다. 키보드 Tab으로 다른 요소에 포커스를 옮기는 경우, 다른 외부 클릭·실제 Window blur·현재 viewport scroll·문서/상태/lease/원본/frame/modal 변경은 기존 선택 취소 규칙을 따릅니다. 컨트롤 등록은 선택을 만들거나 stale token을 복구하지 않습니다.

명시적 command도 P와 같은 private dispatch에서 선택을 소비한 뒤 원본과 현재성을 다시 검사합니다. 이 후속의 source-unit·type 결과는 새 entry를 반영한 정상 GUI 결과와 구분하며, 적용 전 GUI3 증거를 toolbar/menu 실행 증거로 재사용하지 않습니다.

## 일반 웹 빌드의 리본·메뉴 검증

후속 일반 빌드에서는 리본과 표 메뉴의 개체 속성도 현재 Canvas 선택의 단일 소유 경로를 사용한다. HWPX 차트·글상자와 HWP5 글상자에서 속성 열기, 크기·위치 적용, undo/redo, 실제 파일 다운로드와 다시 열기의 값 및 화면을 확인했다. 기존 그림은 같은 진입점에서 기존 그림 속성 도구로 연결된다. 외부 선택 상자로 Tab 이동한 경우와 실제 스크롤로 viewport가 바뀐 경우에는 선택이 취소되며, 새로 선택하기 전에는 속성을 열 수 없는 것도 확인했다.

이 검사는 새 일반 SDK·데모의 실제 입력 경로 증거이며, Native 코드는 앞서 검증한 같은 엔진을 사용했다. 전체 개체·모든 변환 및 전체 문서 조판의 완료를 뜻하지 않는다.

## HWPX 글상자의 본문 배치

기존 HWPX 문서의 본문에 직접 배치된 독립 글상자에서 사각형 어울림, 위아래 배치, 글 뒤, 글 앞을 변경하는 계약이다. 사각형 어울림에서는 양쪽, 왼쪽, 오른쪽, 넓은 쪽을 선택할 수 있다. 다른 배치 모드에서는 원본 방향 값을 유지한다.

조회로 얻은 개체 식별 정보, 문서 이력 번호, 배치 원값이 현재 문서와 일치할 때만 적용한다. 크기·위치·바깥 여백은 별도 명령을 사용한다. 잠긴 개체, 그룹·회전 개체, 글자처럼 취급되는 글상자, 캡션이나 중첩 개체가 있는 글상자는 이 경로에서 편집할 수 없다. 내부 텍스트의 편집 여부와 개체 자체의 위치 편집 권한은 각자의 원본 속성을 따른다.

한 번 적용하면 실행 취소 한 단계가 생긴다. 같은 값을 적용하면 이력은 유지된다. 배치 변경을 저장한 HWPX에서는 해당 개체의 `textWrap`과 `textFlow`만 바꿀 수 있다. 정상 저장과 재열기에서 바깥 여백, 개체 크기와 위치, 목차 등의 다른 ZIP 항목이 유지되는지 검사한다.

Core의 `getObjectBodyFlow()` 관측과 `SET_OBJECT_BODY_FLOW_COMMAND`는 기존 개체 속성 창에서 사용한다. 공개 payload는 `{target, flow: {textWrap, textFlow}}`이며, 현재 편집기와 상태가 발급한 불투명 target만 받는다. 내부 요청은 기존 geometry V1의 owner SHA256 배열32, frame, historyRevision, session/serial과 빈 patch, 관측한 expectedFlow, 새 flow를 함께 전달한다. 현재성 확인과 단일 Native history 거래를 재사용하며 같은 값도 Native 검증을 건너뛰지 않는다.

선택적 ABI 버전은 1이고 이름은 `hwpx_edit_object_body_flow_version`, `hwpx_edit_object_body_flow`, `hwpx_edit_set_object_body_flow`다. 세 함수가 없거나 version이 다르면 미지원으로 처리하며, 구 엔진의 기능 부재를 성공으로 처리하거나 필드를 기본값으로 채우지 않는다. query는 geometry/flow를 반환하고 set 결과 0/1/2/3은 거부/적용/no-op/불확실을 뜻한다. 불확실한 거래를 자동 재시도하지 않는다.

Native 집중 검사는 배치 변경·실행 취소·다시 실행·저장 재열기와 보호 조건을 포함한다. 새 WASM으로 실제 HWPX를 열어 글 뒤·글 앞·위아래 배치와 사각형 방향 변경으로 저장한 파일을 원본 ZIP 항목과 비교했다. 개체 속성 창을 통한 브라우저 편집은 별도 검증 대상이다.


## 본문에 가려진 글 뒤 글상자의 명시적 선택

뒤 배치의 글상자 테두리 위에 본문이 있으면 기본 클릭은 본문을 우선한다. 실제829d 관측의 테두리 좌표에서도 본문 행과 글자 영역이 겹쳐 기본 개체 query가 null이었다. 이는 떨어진 최근접 행을 잘못 선택한 사례와 구분한다.

별도 소스 후속은 도구 모음과 표 메뉴의 ‘글 뒤 개체 선택’ 명령을 제공한다. HWPX의 현재 화면에서 명령을 선택한 뒤 글상자 테두리를 한 번 클릭하고 P 또는 기존 개체 속성을 사용한다. 이 명령은 다음 선택 의도만 준비하며 곧바로 속성을 열거나 Native 변경 권한을 만들지 않는다. 일반 클릭·double-click·보조키의 동작은 유지한다.

명시적 경로도 현재 Native owner, 원본 membership, 축 변환, 현재 그린 화면, lease·문서·상태·token·modal을 검사한다. 테두리 내부의 일반 영역, 다른 개체에 가려진 곳, 복수 owner가 겹친 테두리는 선택하지 않는다. 앞쪽 그림·차트를 관통해 뒤 글상자를 선택하지 않는다. 읽기 전용 및 입력·이력 대기 중에는 거부한다.

Escape, Window blur, 외부 포커스·클릭, 입력/IME, 스크롤, 문서 변경 및 해제는 준비 중인 의도를 취소한다. 선택을 위한 pointerdown부터 pointerup·완료 확인까지의 기존 엄격한 화면 검증은 유지한다. pointerdown 전의 caret 등 표시만 다시 그린 경우에만 동일한 비공개 scene certificate와 새 현재 화면을 확인해 준비 의도를 이어갈 수 있다. 레이아웃이나 자원·확대·문서가 바뀐 화면에는 이 확인을 재사용하지 않는다.

집중 소스 시험은 실제 보존 관측의28개 테두리를 오프라인으로 재생하여 기본 query가 모두 null이고 명시적 query만 같은 owner를 반환하는 것을 확인한다. 이는 새 브라우저에서의 trusted 입력이나 정상 SDK 검증이 아니다. 새 공식 gallery에서 실제 명령 선택·테두리 클릭·P·속성 변경·저장·재열기 검증은 별도로 수행해야 한다.
