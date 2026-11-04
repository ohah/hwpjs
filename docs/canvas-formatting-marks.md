# 조판 부호 일부 표시

Canvas 표시 설정은 저장 문서와 분리한다. `canvas-display-options.mjs`의 기존 `paragraphMarks`는 완전한 본문 문단 끝 표시만 제어한다. 기존 호출에 공백·탭 등의 새 그림을 추가하지 않는다. 선택 옵션 `formattingMarks`는 본문 공백·배치된 탭·강제 줄바꿈 표시를 추가하고 기존 문단 끝 표시를 포함한다. 실제 문단 끝 표시 여부는 `paragraphMarks || formattingMarks`이며, 조판 부호를 꺼도 별도의 문단 부호 선호는 보존한다.

## 지원 범위와 책임

`formatting-mark-plan.mjs`는 현재 문단 원문과 행의 UTF-16 시작·끝·문자열·경계 좌표가 일치하는 경우에만 계획을 만든다. 일반 공백 U+0020은 측정 폭 안에 점으로 표시한다. 탭은 해당 원문 단위에 유일한 `placed` 배치와 양의 폭이 있는 경우에만 화살표를 표시한다. LF/CR/CRLF는 실제 0폭 경계에서 아래 방향 화살표로 표시하며 자동 줄바꿈에는 만들지 않는다.

탭 배치는 첫 유효 탭 경계에서 호출당 한 번 `Map`으로 색인한다. 유닛이 중복되면 상태와 무관하게 거부하며, 미일치·중복 항목의 상태 getter는 읽지 않는다. B개 경계·T개 배치·L개 텍스트 단위에 대해 Map 평균 상수 조회를 전제로 O(B+T+L), 추가 공간은 O(B+T)이다. 탭이 없는 행에서는 배치 getter 자체를 읽지 않는다. 이 범위는 한 행의 표시 계획 비용이며 전체 프레임 선형화나 지연 개선의 증거가 아니다.

`formatting-mark-paint.mjs`는 이 계획을 Canvas에 덧그리고 그리기 상태를 복원한다. `renderer.mjs`는 기존 행 클립·스크롤·확대 경로 안에서만 호출한다. 새 측정, 저장 문자열 삽입, Native 명령, 커서·선택·hit-test·IME 좌표 변경을 추가하지 않는다. 실제 저장·다시 열기 및 인쇄 경로 검증은 별도이며 인쇄 제외가 입증된 것으로 취급하지 않는다.

기존 본문 표시와 함께 원본 표 셀의 공백·배치된 탭·강제 줄바꿈만 제한적으로 지원한다. 현재 원문/표/셀 membership가 유일하고 현재 행 참조·section/paragraph/table/list가 정확히 일치하며 명시 좌표와 완전한 원문 경계를 확인해야 한다. `table.partial === true`이면 완전해 보이는 셀도 표 전체의 부호를 숨긴다. windowed/split/generated 표 전체를 지원하는 것이 아니다. 잘린 문단·부분 원문·변환 행·각주·도형 텍스트·캡션은 표시 계획을 만들지 않는다. NBSP 등 특수 공백, 개체 U+FFFC, 붉은 `[그림]`·`[표]` 및 머리말·필드 등의 제어 앵커는 위치·종류를 추정하지 않는다. 이는 전체 조판 부호 지원이 아니다.

## 보기 도구와 단축키

기존 보기 메뉴와 버튼의 `toggle-marks`를 같은 호스트 표시 옵션에 연결한다. `toggle-paragraph-marks`는 독립 선호를 유지한다. 조판 부호가 켜진 동안 문단 부호 표시는 포함되므로 문단 메뉴는 선택 상태로 보이고 개별 변경은 비활성화한다. 조판 부호를 끄면 문단 선호를 다시 변경할 수 있다. 이 비활성화 방식은 후보 UI 정책이며 공식 UI의 동일한 클릭 동작을 입증한 것은 아니다. 조판 부호를 켤 때 현재의 부분 지원 범위를 상태 메시지로 알린다.

문서 입력 영역에서 Ctrl+G 다음 C는 조판 부호, Ctrl+G 다음 T는 문단 부호를 요청한다. macOS에서도 Command가 아닌 Control이다. 1.5초가 지나거나 다른 키·포커스 이동·IME 시작이 발생하면 대기를 취소한다. 설정된 기존 단축키가 Ctrl+G를 사용하면 그것을 우선하며, 폼 입력·조합·AltGraph·반복 키는 가로채지 않는다. 이 처리는 `formatting-marks-shortcut.ts`가 맡고 메뉴와 같은 action을 호출한다.

## 공식 참조와 차이

- [한컴 조판 부호](https://help.hancom.com/hoffice110/ko-KR/Hwp/view/control_code.htm)는 Ctrl+G,C, 파란 공백·문단 끝과 붉은 제어 앵커, 문단 부호 포함 및 독립 선호 보존을 설명한다.
- [한컴 문단 부호](https://help.hancom.com/hoffice110/ko-KR/Hwp/view/displaying_hard_return.htm)는 Ctrl+G,T, Enter와 Shift+Enter의 다른 의미를 설명한다. 강제 줄바꿈은 이 문단 부호 도움말에도 속한다. 기존 API의 좁은 동작을 보존하기 위해 이번에는 새 `formattingMarks`에서만 추가한다. 문단 모드 전체 동등성은 미지원이다.
- [웹한글 단축키](https://webhwpctrl.cloud.hancom.com/webhwpctrl/js/rights/shortcut/shortcut.htm)는 Windows Ctrl+G,C / macOS Control+G,C와 브라우저 단축키 충돌 경계를 명시한다.

조회한 공식 본문에서는 탭의 표시 모드 소속을 명시적으로 확인하지 못했다. 탭 화살표는 현재 모델의 검증된 배치에 한정한 후보 표현이며 공식 모양·분류와 완전히 같다고 주장하지 않는다. 데스크톱 문서 설명과 실제 웹한글 시각 검증도 구분한다.

## 검증 경계

명시 순수 테스트는 옵션 호환·계획 좌표·실제 layout 경계·그리기 상태 복원·보기 상태·두 독립 선호 복원·순차 단축키를 검사한다. 원문/행 불변은 이 범위에서 확인한다. Native·실제 Canvas 브라우저·저장 원본·인쇄·실제 IME 회귀는 이 검사 결과에 포함되지 않는다.

[명시 정규 명령](development-commands.md#canvas-formatting-marks-tests)의27개는 기존 표시 옵션6개와 조판 부호21개입니다. 실제 Canvas/Native/저장·인쇄 및 정규 strict 타입 검증과 구분합니다.

### 실제 문서에서 확인한 표시와 입력

별도 R3 Noori HWP5/HWPX 실제 브라우저에서 조판 부호 켜기·끄기를 확인하고, 표시 전환 전후 원문·캐럿이 유지됨을 확인했습니다. HWP5는 모달을 닫은 상태에서 실제 trusted 입력8회→실행 취소8회로 원문과 caret unit2를 복원한 뒤 `r` 입력으로 unit3과 현재 그리기 상태를 확인했습니다. 이8입력 회귀를 HWPX에도 수행한 것으로 합산하지 않습니다.

이는 Ctrl+G 순차 키의 모든 OS 조합·OS IME·인쇄·모든 제어 앵커의 검증이 아닙니다. Native issue/ACK는 계측하지 않았고 지연·성능 측정도 아닙니다. 단순 UI 상태를 paint 완료로 오인한 앞선 실패를 보존하며, 후속 성공 사례는 실제 paint 상태 확인 범위로 구분합니다. 표 셀 다운로드의 독립 저장 결과를 이 보기 옵션의 저장·인쇄 제외 증거로 상속하지 않습니다.

R6의 별도 실제 브라우저에서도 HWP5/HWPX C 전환과 원문/캐럿 보존을 확인했고, HWP5는 trusted8입력→held undo8→r의 현재 paint·포커스 회귀를 확인했다. 독립 T=true 상태·전체 layout/source-save 불변·OS IME·인쇄는 추가 범위다. 앞선 R3 표본과 합산하거나 C 전환 성공을 전체 제어 앵커 구현으로 확대하지 않는다.

## 원본 표 셀 표시의 범위

추가는 `formattingMarks`의 공백·탭·강제 줄바꿈뿐이다. 별도 `paragraph-mark-paint.mjs`의 셀 거부는 그대로이므로 셀의 문단 끝 ¶는 지원하지 않는다. 기존 `paragraphMarks` 단독의 좁은 의미와 독립 T 선호도 바꾸지 않는다.

범위 factory는 현재 content와 layout 행 참조만 캡처한다. 화면 밖 행을 제외한 뒤 실제로 계획할 첫 적격 셀에서만 paragraph/table/cell/membership와 현재 row 참조를 한 번 색인한다. 본문만 그리거나 원문·경계·기본 owner/좌표가 먼저 거부되는 경우 이 색인은 읽지 않는다. 새 그리기마다 새 범위를 만들며 mutable provenance의 cross-frame 캐시·측정값·원문·편집 모델 복사를 추가하지 않는다.

필요할 때 그리기당 O(P+C+M+R), 행당 기존 평균 O(B+T+L)를 유지한다. 현재 source와 행 owner 판정은 상수 조회이고 탭 Map은 행당 한 번이다. row의 table/list 누락을 문단 값으로 보충하지 않으며, 중복 source/list/membership·이전 row·부분 source·surrogate 중간 경계와 transform을 거부한다. 기존 그리기 clip/scroll/scale을 재사용하고 픽셀 위치를 추정하지 않는다.

최초 source-only 검사는 기존27(옵션6+표시21)과 신규10으로37pass·0fail·0skip이었다. 후속 안내 문자열 정정 뒤에도 명시37건이 다시 통과했다. 옵션6과 신규 셀10은 같고, 기존 표시21 중 기대 문자열1개만 바뀌었으므로 기존27 전체의 바이트 불변을 주장하지 않는다. 신규 양성은 실제 셀 측정/페이지 투영 함수가 만든 행 metadata를 보충하지 않고 소비한다. 기존 body-only 계획기는 같은 첫 양성에서 실패했고 원본 기록을 보존했다. source/index/getter 계수는 모형의 방문 횟수이며 실제 Native·Noori 픽셀·브라우저·저장·인쇄·IME·지연 증거가 아니다. 이 source-only 실행 자체는 실제 두 형식의 셀 C on/off·T=true·현재 caret·저장 불변을 검증하지 않았다. 후속 저장 근거는 아래 별도 절을 따른다.

현재 행의 기존 pageClip 보존은 모든 셀 내용 사각형 안의 잉크 containment나 픽셀 보장이 아니다. 실제 셀 경계 유출 반례와 새 P2는 아직 확정하지 않았으며, 실제 셀 공백의 한정된 paint 근거는 아래 최종 브라우저 절을 따른다. 이 문단은 새 cell-rect clip이나 제품 수정을 요구하는 계약이 아니다.

### 셀 보기 옵션 저장본의 독립 불변 확인

HWP5/HWPX에서 C/T 보기 조작 전후 실제 UI가 각각 저장한 서로 다른 before/after 파일을 비교해 양 형식 모두 전체 바이트 동일을 확인했다. HWP5 두 파일 SHA는 b18be0217a5d9f81e587705edc0c514cdd11e6314bbe434f17d256aa21b75a7f, HWPX 두 파일 SHA는 6ee9014f23650987803481e7aa51b3b2201f91f549dccfe34880469621d62aab다. 허용 변경0·입력4개 SHA 불변이며, 전체 바이트 비교가 성공해 별도 CFB stream/XML 의미 비교 fallback은 실행하지 않았다. 이는 저장 불변 근거이며 Native API 호출·조회 횟수나 모든 문서의 인쇄 불변을 입증하지 않는다.

최종 브라우저 영수증93266548은 Noori 두 형식의 source 문단15(HWP5 table81/list82, HWPX table202/list209)에서 공백 계획4개를 확인했다. 실제 source-over·alpha1을 관측한 진단 뒤 breakpoint 제거·resume·Debugger 해제·detach를 마쳤고, 비정지 상태에서 각 형식20개 변경 픽셀 모두 공통 C의 정확 정수 AA 모델과 일치했다. C를 끈 동일 ROI는 바이트 단위 원상복원됐고 T=true·원문·caret을 유지했다. 이는 실제 backend 버전 인증이나 AA 제품 수정이 아니다. 실제 픽셀 근거는 공백에 한정하며 탭·강제 줄바꿈·셀 문단 끝 ¶로 확대하지 않는다. 기존 하네스 실패3건을 보존했고 판정 허용오차는0이다. HWP5 Surface 그림 적용·undo/redo 및 trusted8입력·undo8·r 양성 회귀도 통과했으며 소유 프로세스는 남지 않았다. 전체 기능 완료 판정은 false이고, 320px/모든 셀 경계 clipping·인쇄·OS IME·본문/제어 음성 전체·전체 조판 불변은 입증하지 않았다. 실제 Native 거부 UI E2E와 Native API 호출 수 증거도 아니다.

### 보기 안내 문자열의 후속 정정

화면 안내가 본문만 지원한다고 남아 있던 부분은 view-options-bridge.ts의 문자열1개로 정정했다(3362948a). 같은 기대 문자열1개를 바꾼 정규 시험은 df24a9e3이며, 옵션6+표시21+셀10의37건이 통과했다. 이는 표시 안내를 실제 좁은 지원 범위에 맞춘 변경이며 API shape나 셀 문단 끝 ¶ 지원을 추가하지 않는다.

정정 public/private generation680c2653의 manifest는 각각 f77109e4/7eea8077이다. 양쪽 renderer/Surface compiled chunk4개는 기존 QA9e487과 b83b28aa로 정확히 같아 기존93266548 픽셀·양성 증거는 그 동일 chunk 범위로 연결한다. 후속 HWP5 일반 비정지 UI smoke7fe6f689에서 정정 안내 문자열·T=true·원문/caret·Canvas geometry가 유지됐고, 기존 관측 ROI의 geometry 일치와20/20 정수 AA 대조·C off 원상복원을 확인했다. 새 CDP 소유권 관측은 하지 않았으며, 저장·비율 검사를 반복하지 않았다. 기존93266548 소유권/픽셀 범위와 별도 f878c5c7 저장 불변을 같은 compiled chunk 근거로 연결한다. 소유 Chrome은 inactive·pid null·잔류0으로 종료했다. 원716e 메타데이터의 Surface1ab 항목은 보존된 잘못된 기준값이고, 정정 dd480db0과 실제 Surface2c5f6dd7이 기준이다. 코드 불변4개와 안내1개 정정을 구분하며, 운영 전환·공개 게시·배포 CI 완료는 이 빌드 영수증의 증거가 아니다.
