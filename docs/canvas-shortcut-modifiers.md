# Canvas 단축키의 수정키 경계

## 수정키+Enter의 잘못된 문단 분할 방지

RHWP의 로컬 page 명령에서는 Ctrl+Enter가 쪽 나누기, Ctrl+Shift+Enter가 단 나누기이며 별도 native 명령으로 위임합니다. 현재 이 프로젝트에 해당 명령을 구현한 것은 아닙니다. 기존 Canvas는 Control/Command/Alt+Enter도 일반 Enter로 해석해 문단 분할을 요청했습니다. 이제 이 조합은 textarea 기본 개행도 취소하고 미지원 안내와 함께 문서/선택을 보존합니다. 일반 Enter와 기존 Shift+Enter 경로는 바꾸지 않습니다. 쪽/단 나누기 자체는 후속 native 원자적 명령·저장·이력·UI 검증이 필요한 미완료 기능이며, 이 거부를 기능 지원 성공으로 세지 않습니다.

7개 수정키 조합 회귀는 수정 전 모두 split을 요청해 자식7개/부모1개 실패·exit1을 재현했습니다(`modified-enter-red.log/.stderr`). 일반 Enter가 이어서 정상 split을 요청하는 양성 대조도 포함한 Canvas 전체 `modified-enter-fixed.log/.stderr`는232/232·fail/cancel/skip/todo0·exit0·stderr0(2600.426875ms)입니다. 실행 사본은 `/tmp/hwpjs-task1749-ranges.9Y1P1R`의9b03e1c8 게시 코드에 이 guard/감사 변경만 적용했고, 종료 로그 SHA256은 `602a7c1da4bf461eb3e0ed2c9e5bf73ad2964499f4317b9f32ecb6fd96711235`입니다. 진행 중인 다른 두 검증 소스는 변경하지 않았습니다.

agent-browser 스킬의 실제 Chromium에서도 Control+Enter/Command+Enter/Alt+Enter/Control+Shift+Enter 네 조합의 trusted·정확한 수정키·명시적 소비·미지원 안내·선택/문자열/Worker 요청 불변을 확인했습니다. `modified-enter-browser.jsonl/.stderr`는 exit0·stderr0·verified=true·cleanup.success=true이며 기존 Alt 조합·입력·U/R/S·실제 저장 단축키·독립 XML/ZIP·재업로드도 유지했습니다. 로그 SHA256은 `d9ff315b4bcbab3bd05b7bb28a3a7ac2fc807045c57252b97a94b83acf1798ed`, 검증 Canvas 소스는 `883e05b31fdfe6ccb058275416599b82a5aaaae38a05a8d9c3d45441bebe91ca`입니다. 저장본은 기존 일반 사례와 같은 `ee2e1133b8357e70e3d94a6ccb69240210835abd64c96bb2e0617ba2ea0f7c1b`입니다. 소유 세션 `hwpjs-menu-mnemonic-2c454345548e`의 inactive/pid=null과 포트58863 미수신을 재확인했습니다. 전체 fixture·OS IME·RHWP 기능/조판 동치 또는 기본 배포 승격 증거로 확대하지 않습니다.

## 수정과 책임

Canvas의 전체 선택은 Control/Command+A이면서 Alt·Shift가 없는 경우만 처리합니다. undo/redo는 Control/Command+Z/Y이면서 Alt가 없는 경우만 처리하며 기존 Shift+Z redo는 유지합니다. 기존 소비 이벤트·AltGraph·IME/229 거부는 그대로입니다. 단축키 판정은 기존 Canvas keydown 한 곳만 소유하고 별도 명령 상태/문서 모델/이력 저장은 추가하지 않습니다.

수정 전에는 Alt가 섞인 A/Z/Y와 Shift+A도 처리했습니다. `canvas-editor.test.mjs`에 Control/Command 각각 네 거부 반례와 기존 A/Z/Shift+Z/Y 네 성공 대조를 추가했습니다. 분리 사본의 `shortcut-modifiers-red.log/.stderr`는 반례8개와 부모1개 실패, 성공 대조8개 통과·exit1로 재현했습니다. 반례는 이벤트 비소비·선택/문서/요청 불변을, 성공 대조는 전체 선택과 정확한 undo/redo 요청을 검사합니다.

## 검증

`/tmp/hwpjs-field-interior-browser.DVJV5s`의 e9aa1141 기반 제품/UI에 이 조건 두 줄과 현재 브라우저 감사 변경만 추가했습니다. 사용자 작업 트리의 currentReference 전달 두 줄은 포함하지 않았습니다. `shortcut-modifiers-fixed.log/.stderr`는 Canvas 전체224/224·fail/cancel/skip/todo0·exit0·stderr0(2472.383583ms)이며 로그 SHA256은 `ff721f938c79bf10aa8d5fab900b1a9551130a1bf84db134ac2acacde1d32074`입니다. 모사 DOM/Canvas·실제 native WASM 검증과 실제 브라우저를 구분합니다.

실제 Chromium의 `shortcut-modifiers-browser.jsonl/.stderr`도 exit0·stderr0·verified=true·cleanup.success=true입니다. 일반 문단 사례에서 Control/Command+Alt+A/Z/Y 여섯 조합의 trusted/수정키/비소비와 선택·문자열·Worker 요청 수 불변을 확인합니다. 기존 입력·메뉴 U/R/S·실제 Ctrl/Cmd+S 파일·독립 XML/ZIP normal/-O·재업로드도 유지했습니다. Canvas 소스 자체를 실행 전후 UI 해시에 추가했습니다. 사용 후보는 `9e75fd8bab9b879b3883f4703a7a8c2ffe100f98cd48c68a511eed797840b468`, 검증 UI Canvas 소스는 `0b7ccd824ebe4ca4963ec8a90ee1ac22224918153dac28109141619d7cdfcf47`, 로그는 `61e03656fced33e379a070906832caa2f4ed350ef4e62ab85648d8ca5c933738`입니다.

agent-browser 스킬의 격리·실제 키 입력·종료 확인을 따랐습니다. 캡처 `/var/folders/51/mr5cjhg13v324f1vgg9m237c0000gn/T/hwpjs-menu-browser-fbXEBq/reopened.png`를 직접 확인했고 소유 세션 `hwpjs-menu-mnemonic-7db0e7347f66`은 inactive/pid=null·포트58863 미수신, doctor7pass/0warn/0fail입니다. 알려진 close 소켓 소멸 경합은 종료 후 inactive 재조회로 확인했습니다. 실제 Shift+A의 브라우저 고유 UI·물리 OS IME·모든 단축키/fixture/조판·전체 최신 gate 완료 증거는 아니며 기본 WASM과 외부 데모를 교체하지 않았습니다.
