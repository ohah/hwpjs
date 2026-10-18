# 문서 메뉴 키 입력과 실제 브라우저 검증

공통 실행 흐름으로 분리한 후의 일반 문서/보호 개체 재검증은 [unknownObj 브라우저 검증](hwpx-unknown-object-browser.md)을 따릅니다. 아래28개는 분리 전 시점이며 현재 메뉴 회귀는31개입니다.

## 현재 계약

열린 메뉴에서만 단일 문자 키를 기존 명령으로 위임합니다. `index.html`의 `data-menu-key`가 키 정의의 단일 출처이며 CSS 표시와 `aria-keyshortcuts`도 이를 사용합니다. 키 해석은 `document-menu-mnemonic.mjs`, 포커스 이동은 `document-menu-keyboard.mjs`, 최신 활성 상태와 명령 위임은 `document-menu-controls.mjs`가 소유합니다. native/Worker 편집 명령이나 별도 메뉴 상태를 추가하지 않습니다.

파일O/S·편집U/R/F/C/X/V/D·보기P·서식B/I/U/S 및 정렬L/C/R/J/D/N·삽입T입니다. 입력칸/SELECT/contenteditable·조합 입력·229·수정키·반복·이미 소비된 이벤트·중복 활성 키·종료된 controller는 실행하지 않습니다. 최신 disabled는 실행 직전에 다시 확인합니다. 열린 메뉴나 활성 키가 없는 상태를 전역 단축키로 해석하지 않습니다.

기존 미반영 작업 트리의 구현을 분리 소스에서 검증해 채택했습니다. 비교한 MIT 참조 `reference/rhwp/rhwp-studio/src/ui/menu-bar.ts`도 열린 메뉴의 shortcut 표시를 dispatcher에 위임합니다. 참조 코드를 복사하지 않았으며 전체 메뉴·서브메뉴·리본 UI 동치를 주장하지 않습니다.

## 2026-10-18 실제 Chromium

`eb989d1d` 기반 `/tmp/hwpjs-menu-ui-current.BMpEtt`에 메뉴 controller/helper, CSS 두 줄, HTML의 키 속성21개만 적용했습니다. 다른 미반영 app/HTML 기능은 포함하지 않았습니다. 명시적 WASM SHA256은 `2589a92e5e53b0fa222d373f78cba64900a1ae623f19a9c4ea6195df1290634c`입니다. 기본 WASM 승격은 하지 않았습니다.

`menu-browser-pinned.jsonl/.stderr`는 exit0·stderr0·verified=true로 종료했습니다. 보기P 두 번의 패널 열기/닫기와 닫힌 메뉴의P 무시, 문서가 없을 때U/S 거부를 먼저 검사했습니다. 실제 charshape.hwpx 첫 문단에서 신뢰된 키보드 입력 `메뉴검증😀<&`를 넣고 U→원문, R→편집문, S→저장 요청을 확인했습니다. splice/undo/redo/save 요청은 각각1회이며 문서 keydown에서 실제 trusted/consumed 키도 관측했습니다. 관측기는 명령을 실행하거나 편집 상태를 설치하지 않습니다.

메뉴 다운로드 파일은 독립 Python normal/-O에서 전체 XML과 비대상 ZIP payload를 비교했고 틀린 기대 텍스트는 정확히 exit1·complete XML mismatch로 거부했습니다. 파일을 실제 입력에 다시 올려 편집문을 찾았고 `reopened.png`도 직접 확인했습니다. 입력 SHA256은 `7905b94f6720e7d56f06239ba4cb029ff2fb8509a6ae7feda9dccc9506074b78`, 저장 SHA256은 `ee2e1133b8357e70e3d94a6ccb69240210835abd64c96bb2e0617ba2ea0f7c1b`입니다. 출력은 `/var/folders/51/mr5cjhg13v324f1vgg9m237c0000gn/T/hwpjs-menu-browser-IoBh9M`입니다. fixture·후보 WASM·기록한 UI/oracle/tool 소스 해시는 실행 전후 불변입니다.

세션 `hwpjs-menu-mnemonic-ae9385add999`는 종료 후 별도 조회에서도 active=false·pid/runtime=null입니다. 임시 서버 종료와58863 listener 부재를 확인했습니다. agent-browser 스킬의 실제 키 입력·클릭 도달 검사·소유 세션 종료 절차를 사용했습니다. 최초 실행도 성공했지만 source hash/음성 oracle 판정을 강화한 위 최종 실행과 별개이며 합산하지 않습니다. 브라우저 시작 전 잘못된 임시 도구 경로로 끝난 준비 시도는 검증 성공으로 세지 않습니다.

같은 UI/tool 소스에서 기존 기본 WASM을 명시한 별도 `menu-browser-default.jsonl/.stderr`도 exit0·stderr0·verified/cleanup=true입니다. WASM SHA256은 `cbaaf27f858229fedd01b9996ce152bd31aa6d6f346481b7887bcc510ef68346`이고 저장 바이트는 위 후보 결과와 같습니다. 실제 입력·메뉴U/R/S·독립 normal/-O·잘못된 기대값 거부·재업로드를 각각 다시 수행했으며 후보와 결과를 합산하지 않습니다. 출력은 `/var/folders/51/mr5cjhg13v324f1vgg9m237c0000gn/T/hwpjs-menu-browser-GvnMO0`입니다. 이 좁은 기존 기본 산출물 호환성 검사가 최신 파서 전체 승격을 뜻하지 않습니다. 종료 후 별도 session info와 listener 부재도 다시 확인했습니다.

분리 소스의 `document-menu*.test.mjs` 10파일28/28·fail/skip/cancel0·exit0을 확인했습니다(`menu-unit-final.log`). 활성 상태 변경·입력 초점·IME·중복 키·종료 중 재진입·ARIA 키 갱신/제거·메뉴별 연결·팝업·필수 CLI·gate 누락/중복/주석 변조를 검사합니다. 이10파일을 HWPX gate에 각각1회 등록했습니다. focused 결과는 전체 HWPX/native gate 완료나 모든 fixture 편집·실제 한글 조판 동치의 증거가 아닙니다.

재현은 검증할 소스 루트에서 `HWPJS_TEST_WASM=/absolute/candidate.wasm node tools/document-menu-browser-audit.mjs`입니다. 별도 agent-browser 세션이 이미 활성화돼 있으면 거부하며, 추가 인자로 검사를 생략할 수 없습니다.28개 회귀는 `node --test tests/hwpx/document-menu*.test.mjs`입니다. 이후 파일 추가에 따라 총수는 달라질 수 있습니다.
