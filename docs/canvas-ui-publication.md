# Canvas 편집 UI 게시 검증

2026-10-10 게시 후보 tree `57fe8f8b56f37dfbf3e8b3aaceee70b94665b594`는 app/Worker의 실제 ESM static import/export464모듈, HTML/CSS, 서버 및 집중 검사 의존성을 함께 선택했습니다. 별도 export `/tmp/hwpjs-ui-publication.QAt3cS`의 ReleaseSafe 빌드와464모듈 연결이 exit0입니다. WASM SHA256은 `7e70bbc74b7665553cd4f7e1b6a90aeb81a2e14c6c705e332d0ddac495e645e8`입니다. 모듈 body는 연결 검사에서 실행하지 않습니다.

현재 작업 트리와 별도 export 양쪽에서 Canvas editor/edit·history controls·document save·reader Worker5파일215/215·skip0·exit0을 확인했습니다. 실제 HWP5 입력·저장·재열기와 이력, 보호된 제어문자 삭제 거부 후 원래 caret/선택 방향 복원, 다문단 편집·탭/캡션/중첩 문단, 다운로드 바이트 보존과 늦은 Worker 응답 거부를 포함합니다. DOM/Canvas 대역 검사는 실제 브라우저 E2E나 OS IME 완료와 구분합니다.

RHWP 참조의 `rhwp-studio/src/ui/menu-bar.ts`는 메뉴를 CommandDispatcher로 연결하고 현재 상태에 따라 활성 여부를 갱신합니다. `toolbar.ts`는 글꼴·크기·강조·정렬 등의 도구를 분리합니다. 현재 UI도 메뉴·도구 모음에서 기존 편집 명령을 호출하는 방향을 유지하지만, RHWP 메뉴의 hover 전환·전체 명령·외형과 동작 동치를 검증한 것은 아닙니다. 참조 코드를 복사한 구현으로 해석하지 않습니다.

기본 데모 WASM은 이 게시로 자동 교체하지 않습니다. 장시간 전체 native/public gate는 별도 snapshot이며, 전체 픽스쳐의 모든 편집 명령·원본 조판·브라우저/IME 전수 지원은 아직 미완료입니다. 직접 입력 계약과 실제 브라우저 기록은 [Canvas 직접 입력](canvas-direct-input.md)이 소유합니다.
