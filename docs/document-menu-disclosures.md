# 문서 메뉴 열림 상태

## 키보드 포커스 탐색 (2026-10-13)

`document-menu-keyboard.mjs`는 방향키 위/아래·Home·End의 포커스 이동만 소유합니다. summary에서 방향키는 첫/마지막 활성 항목으로 열고, 열린 popup의 항목에서는 순환 또는 양끝으로 이동합니다. 비활성 버튼과 native 대상의 최신 eligibility는 기존 controller가 먼저 refresh해 제외합니다. 키보드 탐색은 클릭/편집 명령을 실행하지 않습니다. 이미 소비한 이벤트·조합 입력·229·Alt/Ctrl/Meta 및 외부 입력에는 개입하지 않습니다.

열림 상태는 계속 `details.open` 하나입니다. controller는 기존 popup layer를 동기 refresh한 뒤 포커스를 옮겨 native toggle 이전의 숨은 popover에 focus하는 것을 피합니다. listener/정리 수명은 기존 controller에 유지하며 close 이후 이벤트는 포커스를 바꾸지 않습니다. Escape 동작은 기존 경로를 유지합니다.

메뉴 keyboard/controls/command-registry/disclosures/popup-layer 다섯 파일17/17, 실패/skip0을 확인했습니다. 방향키 순환·Home/End·동적 disabled·소비/조합/수정키·외부 타겟·빈 목록·close 반례를 포함합니다. DOM 대역 검증이며 실제 브라우저/접근성 트리·전체 RHWP UI 동치의 근거는 아닙니다. 실행 중 전체 문서 감사가 읽는 코어/도구는 이 UI 변경으로 바꾸지 않았습니다.

## 실제 DOM 반례와 후속 수정

외부 Chromium의 최초 실행에서 hover 전환은 확인됐으나 바깥 클릭 후 메뉴가 열려 있었습니다. composedPath의 Window도 contains에 전달하는 경로를 찾았고 실제 Chromium에서 `document.body.contains(window)`가 TypeError임을 직접 확인했습니다. DOM nodeType을 가진 입력만 contains에 전달하도록 수정했습니다. 대역 contains도 비노드에서 TypeError를 발생시키도록 강화해 Window가 포함된 경로를 검사합니다. 기존/신규6/6·skip0·exit0입니다.

수정 후 로컬8080 실제 Chromium에서 hover 전환 `[false,true,false,false]`, 바깥 클릭 후 모두 닫힘·find-input 포커스 유지, Escape 후 모두 닫힘·해당 summary 포커스를 확인했습니다. DOM 열린 값을 eval로 읽었으며 모델/상태를 직접 설치하지 않았습니다. 오류 목록은 비어 있고 브라우저는 종료했습니다. agent-browser 스킬의 실제 포인터/키보드/준비 조건 흐름을 사용했습니다.

외부 후속 실행은 카탈로그103옵션 준비 조건이25초 시간 초과했고 name/옵션이 초기 상태여서 성공으로 계수하지 않았습니다. 외부466모듈 HTTP/MIME/원문 해시 검사 자체는 모두 일치했습니다. 브라우저 앱 초기화 실패와 메뉴 동작 검증을 분리하며 HTTP2 등 특정 원인을 확정하지 않습니다.

`document-menu-disclosures.mjs`는 메뉴 popup 상호작용만 소유합니다. `details.open`을 단일 상태로 사용하며 별도 열린 메뉴 캐시를 만들지 않습니다. 문서 메뉴에 공통 native `name`을 부여해 한 그룹으로 묶습니다. 열린 메뉴가 있을 때 다른 summary의 mouse/pen pointerenter는 이전 메뉴를 닫고 대상 메뉴를 엽니다. 닫힌 상태의 hover와 touch pointerenter는 메뉴를 열지 않습니다.

ownerDocument의 바깥 pointerdown은 메뉴를 닫되 preventDefault하지 않아 Canvas/입력의 원래 포커스 동작을 유지합니다. target과 composedPath 양쪽의 내부 노드를 검사합니다. close는 listener를 제거하고 메뉴를 닫으며, 이후 이벤트는 새 상태를 변경하지 않습니다.

명령·활성 상태·pressed/expanded 반영과 Escape 포커스 복원은 기존 `document-menu-controls.mjs`가 소유합니다. popup 모듈은 명령을 실행하지 않습니다. RHWP 참조의 메뉴 hover 전환/바깥 클릭 닫기 방식과 같은 사용자 흐름을 보완한 것이며 코드 복사·전체 메뉴 동치 구현이 아닙니다.

2026-10-10 DOM 대역의 기존 메뉴5검사와 신규 hover/touch/내부 composedPath/바깥 입력/정리 검사1개가6/6·skip0·exit0이고466모듈 static 연결이 성공했습니다. native name 그룹 동작·실제 포인터/키보드 브라우저 검사는 후속 gate이며 unit 통과만으로 GUI 완료를 주장하지 않습니다.
