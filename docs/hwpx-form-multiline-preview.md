# HWP5/HWPX 폼의 여러 줄 원값과 Canvas 화면

행끝 처리와 여러 줄 표시의 초기 검증은 main afdbdf1c(제품 df47 동일)의 소스와 Native ac652edc…de39e0/509를 기준으로 했다. 기존 Surface history·권한 projection·Noori owner 계약을 보존하며 formText/setFormText, Core input lease, CLI/MCP form-text schema를 재사용한다. 행끝 처리 자체는 새 Native ABI를 요구하지 않는다. 폼 조회 인덱스와 결합한 후속 Native의 검증은 아래 초기 검증과 구분한다.

## 행끝의 원값과 편집 정책

Native 조회 문자열이 값의 기준이다. [XML 1.0 §2.11](https://www.w3.org/TR/xml/#sec-line-ends)의 리터럴 CRLF/CR 정규화와 문자 참조의 CR 보존을 구분한다. JS XML 파서나 normalizationSource로 원본을 교체하지 않는다. 같은 값을 저장하면 기존 Native no-op 경로로 원본 XML/CFB 바이트를 보존한다.

[textarea API](https://html.spec.whatwg.org/multipage/form-elements.html#the-textarea-element)의 LF 값은 입력 투영이다. 임시 draft가 원래 CRLF/CR/LF와 투영 UTF-16 위치를 연결한다. 변경하지 않은 부분의 행끝은 유지한다. 새 줄은 원본이 한 종류이면 그 CRLF/CR/LF를 사용하고, 혼합 또는 행끝 없는 값에서는 LF를 사용한다. 이는 명시적 제품 편집 정책이며 공식 명세가 편집 정책까지 지정한다고 주장하지 않는다.

beforeinput의 현재 선택 범위와 종류를 검증해 실제 변경 부분을 대응시킨다. CRLF와 CR이 섞인 연속 빈 줄은 결과 문자열만으로 어느 행끝을 지웠는지 구별할 수 없다. 실제 선택 범위가 없는 모호한 변경은 AmbiguousFormTextEdit로, 혼합 행끝을 포함하는 관측되지 않은 여러 줄 교체는 UnobservedFormTextReplacement로 거절하며 원값을 바꾸지 않는다. DOM historyUndo/Redo는 예산 내 보관한 원값을 사용한다. 임시 history는 최대64개/262144 원값 UTF-16 유닛이며 Native history와 별개다. 입력은 최대65535 유닛이고 초과·잘못된 Unicode는 기존 draft를 바꾸지 않고 거절한다. 최종 MaxLength·형식·권한 검증은 Native writer가 소유한다.

## 현재 Canvas profile

HWPX edit_box와 HWP5 edit에서 명시 multiLine=true, 검증된 inline owner·Native 고정 width/height·font·색·autoSize=false를 지원한다. wordWrap=false이면 명시 행을 고정 frame에서 자른다. wordWrap=true이면 같은 Canvas font와 frame 내부 폭으로 grapheme 행을 측정한다. 공백과 hard line 원값을 보존하고 soft wrap의 LF를 Native 문자열에 넣지 않는다. 보이는 행 수만 그리며 원본 frame을 늘리지 않는다.

입력은 break-spaces와 [CSS Text 3 line-break:anywhere](https://www.w3.org/TR/css-text-3/#line-break-property)를 사용해 공백 앞 경계를 포함한 같은 행 정책을 따른다. Native의 현재 charShapeId와 caption 언어 문맥을 기존 font resolver에 전달한다. 보호 표식 U+FFFC의 언어를 caption 글꼴로 오인하지 않는다. 새 Native snapshot은 입력을 닫고 새 geometry/style/font로 다시 연다. 확대 시 Native 좌표의 입력창 전체를 변환해 글꼴·행간·frame 배율을 맞춘다.

Enter는 줄바꿈, Ctrl/Cmd+Enter는 한 번의 form-text 요청, Escape는 취소다. 조합 중 Enter는 적용하지 않는다. Native token/lease·현재 source owner와 readonly/optional ABI gate는 그대로 사용한다. 필드 표시는 유지하고 readonly/disabled 입력만 막는다.

## 증거와 제한

아래 ac652/509 수치와 GUI 기록은 초기 후보의 검증입니다. 폼 조회 인덱스와 결합한 Native의 후속 검증은 [조회 scope 계약](hwpx-read-observation-scope.md)을 따르며 서로 다른 후보의 결과를 합산하지 않습니다.

결합 후보 Native `87907e0b…`·Worker `2a4f313e…`의 canonical 번들(manifest `b0275f83…`)에서도 같은 17개 GUI 흐름을 다시 확인했습니다. 누리 두 형식의 첫 표는 Vanilla·React·Svelte에서 실제 UI로 행 삽입·원래 행 삭제·undo/redo·FileSave·재열기 6개 흐름을 추가 확인했습니다. Core·Worker·Canvas 권한 주입 없이 실행했으며, 모든 소유 브라우저와 로컬 서버를 종료했습니다. 원자료는 `zig-out/verification/forms-eol-f3-canonical-gui-r1/`이며 공개 서버 배포 검증과 구분합니다. 누리 나머지 표의 미지원 구조까지 지원됐다는 뜻은 아닙니다.

폼 줄바꿈의 prefix 측정은 exponential/binary 탐색을 사용합니다. 선형 길이 측정기를 주입하고 N=32…2048, 폭=N−1로 대조했을 때 측정에 전달한 총 문자열 길이가 226…26626 유닛으로 증가했습니다. 이 경로의 hard O(N)은 아직 충족하지 않습니다. Canvas의 prefix 폭 단조성을 보장하지 않으며, 글자별 폭의 합으로 바꾸면 kerning·ligature가 달라질 수 있어 채택하지 않았습니다. 이 측정은 실제 Canvas shaping 시간이나 전체 문서 입력 지연 수치가 아닙니다. 근거는 `zig-out/verification/forms-eol-linear-main-integration-r1/FORM-WRAP-MEASURE-WORK.json`이며 provider/shaping 검증은 남아 있습니다.

현재 ac652 후보는 EOL 순수 Node9, 두 형식 공개 Core/Native의 단일 history·undo/redo·readonly·정확 save/reopen2, 기존 F2 단일패키지 dist CLI/MCP CRLF/LF2, HWPX Native no-op exact6을 확인했다. 집중 소스 타입과 CLI strict 타입은 오류0이고 웹 SDK4 빌드가 통과했다.

현재 canonical full Demo 번들(manifest `3b0b1b5bad1721a4d56a463aeb8e87bdb7bdc7a641828a28bcad4d63a1527016`, Native ac652/509, Worker a3f1aa)을 로컬 제공하여 17개 GUI 흐름을 순차 검사했다. CRLF 양형식×3framework6, readonly/disabled4, 인접 CRLF/CR 선택 삭제2, wrap/nowrap 양형식4와 HWPX 22pt bold/Georgia 요청 글꼴1이다. 실제 pointer/key와 FileSave/재업로드를 사용했으며 custom Core 권한/harness는 없다. 저장45개를 독립 CFB/XML normal/-O90회 재검사했고 모든 소유 browser/server를 finally 종료했다.

Canvas 호출을 읽기 전용 관측하고 textarea와 같은 DOM 스타일로 행 경계를 측정했다. wrap/nowrap·스타일 fixture의 측정 행과 Canvas 호출 행이 일치했고125% 확대에서 입력 font/frame 배율을 확인했다. 이 결과는 해당 controlled fixture·브라우저의 관측이며 전체 typography/shaping·폰트 파일 식별·모든 브라우저 픽셀 동치로 확대하지 않는다. 스타일 변경 fixture 재열기 근거와 열린 폼에서의 실시간 서식 명령을 구분하며 후자는 이번 GUI 범위에 넣지 않는다. 이전 fa496 후보 GUI 결과는 이번17개에 합산하지 않았다.

실제 archive CLI/MCP는 같은 schema로 CRLF/LF를 그대로 전달하고 expectedText도 정확하게 비교한다. old writer ABI/예산 거절은 쓰기0, 후행 Native 실패는 save0/새 파일 무출력이며 앞선 메모리 편집은 세션 종료로 폐기한다. 독립 CFB/XML normal/-O와 wrong-value 반례를 사용한다. HWP5 저장은 기존 allowStaleLayout:true 계약을 명시하며 Native 재조판 완료를 의미하지 않는다. Native OOM 구현은 변경하지 않았고 기존 Native 검증을 이번 새 실행 수에 합산하지 않는다.

실제 Enter와 synthetic composition guard를 구분하며 OS 한글 IME 실측은 아니다. HWP5 보호 폼 앵커의 이전 fa496 글자 서식 명령 관측은 ProtectedAnchorRange 거절이며, 현재17개 GUI에서 HWP5 live font mutation을 검증했다고 주장하지 않는다. AutoSize=true의 동적 frame, tab 배치, 비기본 password/alignText와 미지 옵션은 이 profile로 확대하지 않는다. Source frame/옵션 조회를 새 Native 기하 API로 추측하지 않는다. 다른 미지원 폼 옵션의 완료를 주장하지 않는다.
