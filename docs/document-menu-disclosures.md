# 문서 메뉴 열림 상태

`document-menu-disclosures.mjs`는 메뉴 popup 상호작용만 소유합니다. `details.open`을 단일 상태로 사용하며 별도 열린 메뉴 캐시를 만들지 않습니다. 문서 메뉴에 공통 native `name`을 부여해 한 그룹으로 묶습니다. 열린 메뉴가 있을 때 다른 summary의 mouse/pen pointerenter는 이전 메뉴를 닫고 대상 메뉴를 엽니다. 닫힌 상태의 hover와 touch pointerenter는 메뉴를 열지 않습니다.

ownerDocument의 바깥 pointerdown은 메뉴를 닫되 preventDefault하지 않아 Canvas/입력의 원래 포커스 동작을 유지합니다. target과 composedPath 양쪽의 내부 노드를 검사합니다. close는 listener를 제거하고 메뉴를 닫으며, 이후 이벤트는 새 상태를 변경하지 않습니다.

명령·활성 상태·pressed/expanded 반영과 Escape 포커스 복원은 기존 `document-menu-controls.mjs`가 소유합니다. popup 모듈은 명령을 실행하지 않습니다. RHWP 참조의 메뉴 hover 전환/바깥 클릭 닫기 방식과 같은 사용자 흐름을 보완한 것이며 코드 복사·전체 메뉴 동치 구현이 아닙니다.

2026-10-10 DOM 대역의 기존 메뉴5검사와 신규 hover/touch/내부 composedPath/바깥 입력/정리 검사1개가6/6·skip0·exit0이고466모듈 static 연결이 성공했습니다. native name 그룹 동작·실제 포인터/키보드 브라우저 검사는 후속 gate이며 unit 통과만으로 GUI 완료를 주장하지 않습니다.
