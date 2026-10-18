# 제목·책갈피 라벨의 실제 Canvas 입력

## 범위와 실행

`HWPJS_TEST_WASM=/absolute/candidate.wasm node tools/hwpx-title-field-browser-audit.mjs`를 검증할 소스 루트에서 실행합니다. 추가 인자를 받지 않으며 loopback58862와 worktree 전용 세션을 사용합니다. 활성 세션이나 점유된 서버를 인수/종료하지 않습니다. 기본 WASM과 외부 데모도 교체하지 않습니다.

대상은 `reference/rhwp/samples/추진일정.hwpx`의 구역0/문단1(Worker 문단0), BOOKMARK ID1126376209입니다. [제목 필드 계약](hwpx-title-field-label.md)의 한 라벨만 편집하며 일반 문단·서식 편집 권한을 확대하지 않습니다.

브라우저 조작·HTTP WASM 해시·trusted 입력·이력·다운로드·재업로드·finally 종료는 `tools/browser/field-label-roundtrip.mjs` 한 곳에서 소유합니다. `field-label-cases.mjs`는 메모/제목 fixture와 원본 좌표·oracle만 소유하며 기존 메모 CLI는 같은 공통 흐름의 얇은 진입점입니다. 자세한 공통 검증 절차는 [기존 메모 검사](hwpx-memo-browser-roundtrip.md)의 검증 경로를 따릅니다.

## 실제 Chromium 결과

1ad19b14의 동결 JS/웹 소스에 공통 감사 모듈을 반영한 `/tmp/hwpjs-title-field-browser.ioRYFw`에서 실행했습니다. 후보는2589a92e5e53b0fa222d373f78cba64900a1ae623f19a9c4ea6195df1290634c이며 HTTP로 제공한 WASM도 같은 해시입니다.

`title-browser.jsonl/.stderr`는 exit0·stderr0·verified=true·browserClosed=true·serverExited=true입니다. 원본 해시는0a025754efc239ecc20f291f7a9f065e8d73d1a5352b75096811242e0df93954, 저장 사본은e3073a4d250810257e9890bb426fb7f7d87be758db788924c0fdb7c00964de80입니다. 업로드→편집 시작→문단 창/찾기→키보드 입력 `브라우저제목😀`→undo/redo→다운로드 독립 XML/ZIP 비교(normal/-O)→재업로드/같은 문단 선택을 확인했습니다. beforeinput/input의 isTrusted와 실제 splice의0/0/0/0 좌표를 검사하며 JS에서 편집 명령을 직접 주입하지 않습니다.

세션hwpjs-title-field-f73653170389의 inactive와 port58862 listener 부재를 별도로 확인했습니다. `/var/folders/51/mr5cjhg13v324f1vgg9m237c0000gn/T/hwpjs-title-field-browser-tNj3Rf/reuploaded.png`도 직접 확인했고 라벨과 입력 문자열이 표시됩니다. 화면의 일반 글자 서식 비활성은 라벨 전용 권한과 일치합니다.

실패 단계/관측 로그를 추가한 최종 공통 도구도 `title-browser-final.jsonl/.stderr`에서 exit0·stderr0·verified/cleanup 성공을 재확인했습니다. 원본/저장 해시는 같고 최종 재업로드 화면은 `/var/folders/51/mr5cjhg13v324f1vgg9m237c0000gn/T/hwpjs-title-field-browser-ZYmgDb/reuploaded.png`이며 직접 확인했습니다. 같은 원본의 반복 검증이지 다른 제목 유형의 coverage를 추가한 결과가 아닙니다.

## Worker/Canvas 반례

`tests/hwpx/title-field-canvas.test.mjs`는 실제 Worker/WASM과 모의 DOM이며 실제 Chromium 검사와 구분합니다. 동결 소스의 `title-clean-canvas-negative.log`와 현재 작업 소스의 `title-canvas-negative.log`는 각각2/2·fail/skip/cancel0·exit0입니다. 양성을 중복 합산하지 않습니다.

실제 제목 라벨의 입력·저장 독립 대조·이력·저장본 재열기와 함께 미지 필드 종류/빈 인라인/직접 run 컨트롤/자식이 있는 제목 표식 네 반례를 검사합니다. 반례는 읽기 전용·범위 입력 거부를 유지하고, 거부된 입력 뒤 다른 일반 문단의 대기 redo와 저장 ZIP이 그대로여야 합니다.

메모/제목 CLI·미지/프로토타입 사례 이름·클릭/종료 guard 묶음은12/12·fail/skip/cancel0·exit0입니다(`browser-shared-guards.log`). UI가 완성됐다는 근거나 모든 필드 브라우저 coverage가 아닙니다. OS IME 조합 입력, HWPX 물리 쪽 배치와 한글 조판 동치, 전체 fixture 편집·전체 native gate는 아직 별도입니다.
