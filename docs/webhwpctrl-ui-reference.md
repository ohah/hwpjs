# WebHwpCtrl 공개 UI 비교 기준

2026-10-25 사용자 제공 [공식 웹한글 기안기 데모](https://webhwpctrl.cloud.hancom.com/webhwpctrl/)를 실제 브라우저로 열었습니다. 제공받은 쿠키를 사용하지 않았고 문서를 업로드하지 않았습니다. 공개 초기 문서의 iframe 안에서 메뉴·도구 모음·Canvas·글꼴/크기/줄 간격·쪽 상태를 확인했습니다.

찾기는 숨겨진 메뉴의 같은 이름 항목이 아니라 화면에 보이는 도구 모음 항목을 실제 포인터로 눌렀습니다. 열린 창에서 다음 구성을 확인했습니다.

- 찾을 내용 입력창
- 찾을 방향: 아래로(초기 선택), 위로, 문서 전체
- 다음 찾기, 닫기

산출물은 `zig-out/verification/webhwpctrl-reference/`의 initial/find-dialog 스크린샷, snapshot/find-dialog JSON, cleanup JSON입니다. 초기 자동화의 exact text 조회는 hidden/iframe 대상 구분에 실패했고, visible bounding box를 사용한 최종 포인터 실행에서 실제 찾기 창을 확인했습니다. 소유 브라우저는 inactive=true입니다.

우리 데모는 검색 입력·순방향 다음 찾기·선택 바꾸기가 연결됐지만, 위로/문서 전체 방향 선택 UI는 아직 없습니다. 이 차이를 현재 구현 완료로 계산하지 않습니다. 원본 기안기에서 각 방향의 경계/선택 범위·wrap 동작, 바꾸기 창 전체 옵션, 단축키 사용자 설정 UI까지 동작 검증한 것으로 확대하지 않습니다. core/host API 대응은 [공식 API 대조](headless-api-coverage.md), 우리 JSON 키 설정은 [단축키 계약](editor-keymap.md)이 소유합니다.
