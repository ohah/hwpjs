# 문서 메뉴와 명령 검색의 공통 실행 경계

rhwp 참조 커밋 `e8800c8def63449808a4092798442652ed460552`의 `rhwp-studio/src/ui/command-palette.ts`는 registry/dispatcher를 소비하고, 명령·이력 지침은 문서 mutation이 공통 편집 라우터를 통과하도록 요구합니다. UI 코드나 포맷 모델을 섞지 않고 이 책임 분리만 참고합니다. 참조 저장소는 수정하지 않았습니다.

현재 `createDocumentMenuControls`가 메뉴 delegate를 소유합니다. `commands()`는 실제 버튼 ID/라벨과 기존 target의 현재 disabled/상위 fieldset 상태로 활성 여부를 반환합니다. 버튼 ID가 없으면 순번 기반 로컬 키를 쓰며 중복 키는 리스너 등록 전 거부합니다. 명령 목록은 UI용 snapshot이고 실행 권한 캐시가 아닙니다.

`execute(id)`는 현재 상태를 다시 갱신·검사한 뒤 원래 메뉴 클릭과 동일한 delegate를 정확히 한 번 호출합니다. 새 Worker/native 명령·이력·선택·보호 판단을 독립 구현하지 않습니다. unknown/disabled/닫힌 controller는 실행하지 않습니다. 사용자 작업 종료 시 기존 리스너·popup과 함께 정리합니다.

명령 metadata/일반 메뉴와 같은 실행·stale 활성 값·상위 fieldset 비활성·disabled에서 활성 전환·unknown·반복 close·중복 ID, 기존 메뉴/서식/패널/Escape 회귀8/8·skip0·종료코드0입니다. 이는 명령 검색창 자체의 완성이나 실제 browser palette/모든 rhwp UI 기능 완료가 아닙니다. 다음 UI는 이 snapshot과 실행 경계를 소비하며 명령 정의·허용 조건·native dispatch를 두 번째로 소유하지 않습니다.
