# 문단 정렬 메뉴

후속 신규 객체 생성의 모델·이력 경계는 [표 삽입 계획](table-insertion-plan.md)을 따릅니다. 기존 정렬 명령 연결과 신규 표 삽입 완료는 별도입니다.

RHWP 로컬 `rhwp-studio/src/ui/toolbar.ts`의 `setupAlignButtons`는 정렬 버튼을 기존 dispatcher 명령에 연결합니다. 소스 책임 구성을 참고했으며 코드를 이식하거나 RHWP 전체 기능 동등성을 주장하지 않습니다.

우리 서식 메뉴의 여섯 정렬 항목은 기존 `paragraph-format-form`의 data-alignment 버튼에 click을 위임합니다. enum/선택/native 요청/이력/저장은 기존 paragraph-format-controls와 공개 편집 API가 계속 소유합니다. 메뉴는 native 명령과 별도 서식 상태를 만들지 않고 disabled·aria-pressed를 기존 컨트롤에서 읽습니다.

문서 메뉴 컨트롤은 자체 disabled뿐 아니라 `matches(':disabled')`로 부모 fieldset의 비활성 상태도 검사합니다. 상태 표시와 클릭 직전 재검사를 같은 함수로 처리하며 기존 DOM 아닌 명령 어댑터도 유지합니다. 지연 갱신 이전에 보호/대기 상태가 바뀌면 명령을 실행하지 않습니다.

2026-10-11 기본67dc85ca WASM·현재 UI로 메뉴 컨트롤/연결/팝업/양쪽 독립 저장6파일14/14·fail/skip0·exit0(284.817584ms)입니다. 실제 외부 Chromium의 parashape.hwpx에서 `문단1` 찾기 선택→메뉴 CENTER→undo JUSTIFY→redo CENTER를 조건 대기로 확인했습니다. 텍스트 유지·메뉴 닫힘과 브라우저 오류 출력 부재도 확인했고 테스트 브라우저를 종료했습니다. 첫 메뉴 클릭은 스크롤된 도구 영역이 status에 가려져 실패했고 summary를 scrollintoview한 뒤 정상 클릭했습니다. 강제 클릭하지 않았습니다. HWP5 정렬 메뉴 GUI·전체 여섯 모드·원본 조판·OS IME는 별도입니다.
