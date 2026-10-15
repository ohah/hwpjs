# Canvas 응답 대기 중 입력 의도

## 책임과 기준

`input-intent-queue.mjs`는 아직 native가 반영하지 않은 DOM 입력의 순서·선택 위치·치환만 보관합니다. 문서 모델·서식·구역·저장 바이트·revision 이력은 소유하지 않습니다. 입력 전후 문자열을 textChange로 대조하고 native 응답의 현재 텍스트가 큐 기준과 정확히 같을 때만 다음 의도를 꺼냅니다. 다른 위치에서 같은 글자를 입력해도 하나의 최소 diff로 합치지 않습니다.

base/projected 문자열과 각 치환·선택 메타데이터를 보관하며 각 항목마다 문서 전체 문자열을 복제하지 않습니다. 논리 한도는1024항목·삽입 UTF-16 유닛 합16Mi입니다. OS 물리 메모리 hard cap은 아니며 DOM 입력 한도와 별개입니다. 잘못된 문자열·기준 불일치·한도 오류는 기존 큐를 부분 변경하지 않습니다.

## Canvas 연결

현재는 일반 splice·타이핑 글꼴/속성 splice·생성 셀 text 요청의 pending 중 beforeinput/input을 기록합니다. 새 native 응답으로 source 좌표가 갱신된 다음 원래 순서대로 요청합니다. 생성 셀의 전체 값 setter에도 최종 DOM 초안이 아닌 해당 항목의 afterText만 전달합니다. 권한은 기존 native/query 경계를 유지하며 대기 의도가 남으면 settled/history를 허용하지 않습니다.

첫 요청이 거부되면 그 결과에 종속된 의도는 다른 기준 문서에 재생하지 않습니다. reset/close/새 load도 큐와 임시 선택을 정리합니다. 기준 텍스트 불일치는 명시적으로 알리고 임의 위치로 재기준화하지 않습니다. 한도 초과는 입력 방지 또는 DOM 값 복원과 상태 메시지로 알리며 기존에 수집한 의도를 덮어쓰지 않습니다.

## 검증

2026-10-15 cb5d1b87 후보와 현재 JS의 queue/selection pure·실제 Worker·기존 Canvas 네 파일은33/33·skip0·exit0입니다(handle4475,6156.396542ms). 이 집중 결과를 이미 시작한 전체 native/참조 감사나 실제 브라우저 검증에 소급하지 않습니다.

pure 검사는 반복 문자열의 서로 다른 위치·순서, 반환 선택값의 복사, 잘못된 native 기준·입력 chain·문자열·한도 실패의 원자성, clear/no-op을 확인합니다. 실제 HWP5/HWPX Worker/Canvas 대역은 빠른 반복 타이핑·emoji·커서를 다른 위치로 옮긴 입력·삽입 뒤 backspace/forward delete의 개별 요청과 모든 undo/redo·저장 체크포인트를 확인했습니다. 금지 제어문자로 첫 요청을 거부시켜 종속 요청0회·원문 보존·새 문서 정상 입력도 확인했습니다.

생성 셀은 일반 문단용 selectTextRange가 아니라 실제 controller.insertTable 응답으로 진입해야 합니다. 최초 테스트는 이 경계를 잘못 사용해 false!==true로 실패했고, 실제 생성 흐름으로 수정한 뒤 a→aa→aaa의 개별 native 전체 값과3회undo/redo가 통과했습니다. UI 선택 API를 확대해 테스트를 통과시키지 않았습니다.

추가 서식 경계 회귀는 실제 parashape.hwpx의 Worker 문단5를 메모리에서 `aa`로 바꾸고 두 글자에 각각 기존 charPr0/1을 지정합니다. 응답 대기 중 위치0과1에 `a`를 입력한 저장본은 독립 Python ZIP/ElementTree 해석에서 `[0,0,0,1]`이며, 문자열은 같지만 위치를 잃은 `[0,0,1,1]`과 구분합니다. 일반/-O 실행,2회undo 원본 체크포인트,2회redo 저장 바이트,재열기 후 서식이 일치했습니다. cb5d1b87 후보의 해당 Worker 파일은5/5·skip0·exit0(6985.222167ms)입니다. 이 추가 독립 XML 검증은 HWPX의 이 서식 경계에 한정하며 HWP5 전체 서식·실제 브라우저 입력 완료를 뜻하지 않습니다.

추가 서식 회귀를 포함한 같은 네 파일 재실행은34/34·skip0·exit0(6981.037625ms)입니다. 후보 SHA-256은 `cb5d1b87a04768990c19481ad007c20517ee80e02ed44978989b7dd966617349`로 확인했습니다.

HWP5에도 같은 기존 charShape0/1 경계를 구성해 독립 CFB.js/Node 레코드 해석으로 확인했습니다. 기존 expectedSection을 실제 의도 위치0→1에 순서대로 적용한 **전체 구역 바이트**와 저장 결과가 일치하고, 잘못된 위치0→3은 같은 문자열이어도 구별됩니다. CFB 메타데이터·비대상 stream 불변,2회undo/redo,재열기 후 전체 구역도 확인했습니다. 표61의8바이트 시작 위치/글자 모양ID 쌍을 사용하며 제품 reader의 서식 응답을 oracle로 사용하지 않습니다.

## 대기 중 조합 입력의 위치 손실

`가가`에 일반 입력 위치0→1을 응답 전에 수행하고 위치0에서 `가`를 조합하면, 수정 전 마지막 native 요청은0이 아닌4로 이동했습니다(집중 재현 exit1,92.441166ms). 문자열만 비교하면 놓치는 실제 요청 위치 결함입니다. 조합 시작의 DOM 기준·선택을 보관하고 조합 종료 시 같은 input-intent-queue에 한 번만 추가하도록 수정했습니다. 중간 조합 문자열은 native 명령으로 만들지 않습니다. clearInputIntents가 큐·일반 capture·조합 capture의 정리를 함께 소유해 reset·실패·권한 거부에서 누락되지 않게 합니다.

HWP5/HWPX 각각 조합 중 최초 응답 도착/미도착과 조합 완료/취소의8조합을 검사했습니다. `ㄱ`→`가` 중간 문자열의 요청 없음,완료 위치0/취소 시 추가 요청 없음,기존 입력 순서,모든 undo/redo의 저장 바이트가 일치합니다. queue/selection/Worker/Canvas와 기존 paragraph-composition·canvas-composition·composition-anchor-retention의7파일은41/41·skip0·exit0(10020.105667ms)입니다. cb5d1b87 WASM과 수정 JS의 실제 Worker·DOM 대역 결과이며 OS IME/브라우저 E2E 증거가 아닙니다.

## 거부 뒤 늦은 조합 이벤트와 문서 교체

첫 입력이 금지 제어문자로 거부되어 DOM을 원문으로 돌린 뒤에도 늦은 조합 input/end가 취소된 초안을 다시 제출했습니다(수정 전 집중 재현 exit1,72.592292ms,요청2회 대 기대1회). clearInputIntents는 조합 중 실패/리셋을 무효화 상태로 표시합니다. 그 조합의 후속 beforeinput은 막고 input은 현재 committed로 복원하며 compositionend에서 무효화 상태를 해제합니다. 새 compositionstart는 새 의도로 시작합니다. 별도 native 문서 모델이나 임의 위치 재기준화는 추가하지 않습니다.

HWP5/HWPX 각각 실제 거부 뒤 늦은 조합 요청0회·원문 저장 불변·새 조합 정상 적용을 검사했습니다. HWP5→HWPX와 반대 방향의 load/reset 이후 **새 문단까지 선택한 상태**에서도 이전 조합 이벤트가 새 문서를 변경하지 않고 다음 일반 입력이 정상 적용됩니다. 같은7파일 재실행은43/43·skip0·exit0(10665.341375ms)이며 실제 브라우저 이벤트 계열 인증은 아닙니다.

## 실제 브라우저의 Worker/저장 경계

2026-10-15 분리 게시 디렉터리의 실제 Chrome에서 parashape.hwpx를 파일 선택으로 열고 편집 시작·찾기로 Worker 문단5를 선택했습니다. 실제 keyboard inserttext로 `문단 6`을 `가가`로 바꾼 뒤, 한 JS 이벤트 묶음에서 일반 삽입0→1과 조합 삽입0을 실행했습니다. 묶음 종료 전 native 요청은 첫 입력1건뿐이며 실제 Worker 응답 뒤 기록된 요청은0→1→0의3건,최종 textarea는 `가가가가가`입니다. 조합 이벤트는 브라우저 CompositionEvent/InputEvent로 생성했으므로 OS 한국어 입력기를 직접 조작한 검증은 아닙니다.

실제 다운로드 버튼의 `final.hwpx`에 독립 plain-splice XML/ZIP oracle을 원본 대비 문단5의0..4 교체로 적용했습니다. 일반/-O 모두 전체 XML·비대상 ZIP payload/메타데이터 검사가 통과하고 잘못된4글자 기대는 Whole XML mismatch로 거부했습니다. UI undo 버튼4회는 각 응답을 기다려 원문 `문단 6`을 복원하고 다운로드 `undo.hwpx`가 원본과 byte-exact입니다. redo4회 다운로드 `redo.hwpx`는 final과 byte-exact입니다. final을 다시 파일 선택으로 열고 편집 시작·찾기에서 같은 문단의5글자를 확인했습니다. `/tmp/hwpjs-pending-input-ui.ZyL30q/reopened.png`를 직접 열어 선택한 Canvas 문자열을 확인했으며 브라우저 errors 출력은 비어 있었습니다.

서버는 cb5d1b87 후보를 명시적으로 제공했고 controller는 c4fbcf96의 현재 파일과 cmp로 일치했습니다. final SHA-256은 `c50370ca063c43e64974c0a0fadb09a1f459f60e5585f77d1099bd67c2bf7019`입니다. 원격 기본 WASM·전체 페이지 조판·HWP5 브라우저·OS IME 완료로 소급하지 않습니다. HWPJS 전용 세션 hwpjs-fixture-qa-35c54947528a는 close 후 active=false/pid=null/runtime=null이며 임시19148 서버PID30950은 종료코드143으로 끝났습니다. 다른 프로젝트 세션은 종료하지 않았습니다.

## 게시 검증 이력

HWP5 parashape.hwp에도 같은 분리 JS/cb5d1b87 후보로 실제 파일 선택·편집 시작·문단5 찾기·keyboard inserttext의 `가가` 교체와 대기 일반0→1/자동 조합0을 수행했습니다. Worker 요청 위치0→1→0,4회undo/redo의 각 응답·다운로드 원본/최종 byte-exact,final 재열기에서5글자와 동일 문단을 확인했습니다. 기본 저장은 LayoutReflowRequired로 거부했고 `allow-stale-layout`을 실제 체크한 뒤 저장했습니다. 동의를 우회하거나 재조판 완료로 계수하지 않습니다.

다운로드 `/tmp/hwpjs-hwp5-pending-ui.R5sBoQ/final.hwp`는 기존 독립 CFB.js/Node expectedSection으로 원본 문단5의0..4 교체 및0→1→0 삽입을 순서대로 재구성한 **전체 구역 바이트**와 같았습니다. CFB 메타데이터·stream 목록·비대상8stream 불변과 잘못된4글자 기대의 거부도 확인했습니다. final SHA-256은 `f9c5cc41dda3dad8551d3bc1034778d13c2748ba9c81d9b6bc0ca66459ac15e8`입니다. 같은 디렉터리 reopened.png를 직접 열어 Canvas 선택 문자열을 확인했고 브라우저 errors 출력은 비어 있었습니다. 조합은 자동 CompositionEvent/InputEvent이며 OS 입력기/한글 원본 조판/전체 HWP5 전수 완료가 아닙니다. 전용 브라우저는 active=false/pid=null/runtime=null,임시 서버PID48231은 종료코드143,19148 listener 없음으로 정리했습니다.

f5045308 기준 Git archive에 Canvas controller·이 Worker 회귀 파일만 적용한 첫 분리 실행은 기존 import의 `transformed-box-hit.mjs` 파일 누락으로 실패했습니다. 이 의존 파일과 checkbox 변환/clip 회귀는844ac307로 별도 커밋했습니다. 게시 대상 controller·Worker 회귀와 해당 의존 파일을 적용한 분리 디렉터리에서, run-selected-node-tests의 실제5파일 목록을 확인한 검사는39/39·skip0·exit0(9952.720167ms)입니다. 후보 WASM은 같은 cb5d1b87 외부 절대 경로를 사용했고 나머지 JS는 archive의 커밋본입니다. 현재 작업 트리의7파일43/43 결과와 게시 단위5파일39/39를 합산하지 않습니다.

초기 분리 명령은7경로를 직접 Node에 전달했지만 archive에 없는3파일이 실제 실행 목록에서 빠졌으므로7파일 통과로 해석하지 않습니다. 그 뒤 존재를 검사하는 공통 선택 wrapper로5파일을 명시해 검증했습니다. 게시 변경은 Canvas 의도 큐 연결·조합/거부 처리와 회귀 검사이며 native form 지원·다른 로컬 renderer 변경·기본 WASM 승격을 포함하지 않습니다.

이 검증은 실제 OS/브라우저 이벤트 타이밍, pending 도중 조합 입력·서식 명령·구조 변경 전체의 지원 완료가 아닙니다. native 거부를 JS 허용으로 덮어쓰거나 원본 캐시를 편집 모델로 만들지 않습니다. 큐·pure diff를 게시한 f5045308과 이 문서에 동반한 Canvas 통합/Worker 검사 게시 단위를 구분하며, 기본 WASM 승격은 여전히 별도입니다.
