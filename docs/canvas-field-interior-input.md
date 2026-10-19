# 실제 누름틀 중간 입력의 Canvas 왕복

## 책임과 범위

실제 `task1749/saved_bounds_cumulative_page_break.hwpx`의45번 문단을 검사합니다. 원본 SHA256은 `2fd531b3e235a714c3fef1a59ddcd9d23225f68f5c492adb17500d23f5cbfe2f`입니다. 현재 Canvas/Worker의 필드 범위 선택과 입력 연결을 검증하며 새 native 명령이나 별도 UI 편집 상태를 만들지 않습니다. RHWP처럼 UI가 명령 경계에 위임하는 방향은 유지하지만 RHWP 전체 UI/명령 동치 주장은 아닙니다.

`document-menu-cases.mjs`가 원본·문단·기대 문자열·범위를 소유하고 공통 `document-menu-roundtrip.mjs`가 기존 열기·메뉴·이력·저장·재업로드 수명을 소유합니다. `input-origin.mjs`의 범위 선택은 실제 시작 이동/방향키/Shift+방향키만 사용합니다. DOM selection은 증거로만 읽고 설정하지 않으며 UTF16 정수/상한·서로게이트 경계·실제 최종 문자열/선택 불일치를 거부합니다.

원문의 `2026년 서울청년정책네트워크`에서2..4를 선택해 `중간😀<&`로 치환합니다. Worker 요청의 section0/0기반 문단44/start2/end4를 검사합니다. 원본 fieldBegin은 native 범위 조회와 독립 XML inventory를 교차 대조하며 저장은 원본 전체 XML/ZIP을 Python normal/-O에서 확인합니다. 잘못된 기대 문자열은 같은 검사기로 거부합니다. undo/redo 후 실제 다운로드와 재업로드에서도 정확히 같은 문단·전체 수정 문자열을 확인합니다. 현재 helper의 제한 밖 긴 선택·복잡한 grapheme/OS IME·모든 필드/조판은 별도 검증입니다.

## 기존 일반 입력 회귀

같은 사본/후보의 `plain-compat.jsonl/.stderr`도 exit0·stderr0·verified=true·cleanup.success=true입니다. 기존 일반 문단/픽스쳐 선택·Ctrl/Cmd+S·메뉴 이력/저장·독립 XML/ZIP·재업로드를 유지했습니다. 로그 SHA256은 `33a672d16a80a13b43cddf2be3f6b71e3b54eafbdf5b648d0a1a32972f71906b`, 저장본은 `ee2e1133b8357e70e3d94a6ccb69240210835abd64c96bb2e0617ba2ea0f7c1b`입니다. 소유 세션 `hwpjs-menu-mnemonic-7db0e7347f66`도 inactive/pid=null·포트58863 미수신을 확인했습니다. 새 필드 사례와 합산해 전체 UI 검증으로 부르지 않습니다.

## 실제 실행

e9aa1141 제품 소스에 task1749 API 회귀와 이 브라우저 도구 변경만 추가한 분리 사본은 `/tmp/hwpjs-field-interior-browser.DVJV5s`입니다. WASM 후보 SHA256은 `9e75fd8bab9b879b3883f4703a7a8c2ffe100f98cd48c68a511eed797840b468`이며 기본 제품/외부 데모와 구분합니다.

`field-browser-guards.log/.stderr`는28/28·fail/cancel/skip/todo0·exit0·stderr0입니다. `field-interior.jsonl/.stderr`는 exit0·stderr0·verified=true·cleanup.success=true이며 원본/후보/선택 UI와 도구 해시를 실행 전후 대조했습니다. 로그 SHA256은 `829ab373fbec2b11b01c4b90be97dd9601823140ce7c7d83bc559304cedb0351`, 저장본은 `ed1910bf6b2d510d3f1071afc46386daf5b8ec00c7e12b316c32a9266942dc7e`입니다. 재업로드 caret은 `0:44:8`입니다.

직접 확인한 캡처는 `/var/folders/51/mr5cjhg13v324f1vgg9m237c0000gn/T/hwpjs-field-interior-browser-qGT4lv/reopened.png`입니다. agent-browser 스킬의 격리 세션·신뢰된 실제 입력·소유 브라우저/서버 종료 확인을 따랐습니다. 종료 응답의 알려진 소켓 소멸 경합은 종료 후 inactive 재조회로 확인했고, 별도 session info도 `hwpjs-field-interior-7db0e7347f66`의 active=false/pid=null·포트58870 미수신을 확인했습니다. doctor는7pass/0warn/0fail입니다. 전체 최신 native/등록 gate·모든 fixture 편집·원본 조판 완료로 확대하지 않습니다.
