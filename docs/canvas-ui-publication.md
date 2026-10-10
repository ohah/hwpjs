# Canvas 편집 UI 게시 검증

준비 지연/실패 화면과 외부 요청 관측의 한계는 [초기화 상태](preview-startup.md)가 소유합니다.

후속 메뉴 hover/바깥 클릭과 상태 책임은 [메뉴 열림 상태](document-menu-disclosures.md)가 소유합니다.

선택 가능한 문서 목록은 [전체 데모 픽스쳐](demo-fixture-inventory.md)의 명시적 inventory를 따릅니다.

이 문서의 기본 미반영 기록은 당시 상태입니다. 후속 기본/외부 교체 상태와 복구 사본은 [현재 데모 WASM](current-preview-artifact.md)이 소유합니다.

## 실제 브라우저에서 찾은 픽스쳐 경로 불일치

수정 후 외부 데모를 별도로 확인했습니다. 기존8080 서버는 이미 준비된 정적 픽스쳐를 제공하고 있어11개 GET이200·원본 해시 일치였습니다. 따라서404 재현을 외부 서버에도 발생한 현상으로 소급하지 않습니다. 최신 경로 처리기를 적용하기 위해 cwd와 명령을 확인한 데모 서버 PID24237만 정상 종료하고 PID79172로 같은8080 loopback 서버를 다시 실행했습니다. Tailscale 설정은 바꾸지 않았습니다. 재시작 후 외부 HTTPS의464모듈은 MIME/원문 해시가 모두 일치했습니다. 기본 WASM은 여전히 `f38c60ad10344e982e95dbfc5662d03f161add1a02caffe84e64617a01efb760`이며 후보 교체와 구분합니다.

게시 export의 실제 Chromium에서 `aligns.hwpx` 선택/열기가404로 실패했습니다. UI 카탈로그는 `/web/preview/demo-fixtures/aligns.hwpx`를 만들지만 서버 responder는 `/demo-fixtures/aligns.hwpx`만 처리했습니다. 서버가 `demoFixturePrefix`와 `fixtureUrl`을 카탈로그에서 재사용하도록 수정했고 구형 서버 경로는 호환 별칭으로 유지했습니다. 누락된 정적 파일을 복사하는 방식으로 우회하지 않았습니다.

카탈로그11파일의 GET/HEAD·원본 바이트, 구형 경로, 양쪽 경로의 traversal/추가 suffix/바뀐 realpath 거부3/3·skip0·exit0을 확인했습니다. 수정한 loopback 서버8084에서 위 게시 WASM을 사용한 Chromium으로 `aligns.hwpx` 열기·Canvas 편집 시작·실제 포인터 클릭·`브라우저😀` 입력을 확인했습니다. `left 0`이 `l브라우저😀eft 0`이 됐고 버튼 undo/redo 후 각각 원문/편집문으로 돌아올 때까지 DOM 조건으로 기다려 확인했습니다. 브라우저 오류 목록은 비어 있었고 사용한 브라우저와 서버를 종료했습니다. agent-browser 스킬의 실제 포인터·키보드·상태 대기 흐름을 사용했습니다. 외부 기본 산출물 반영·HWP5 GUI·다운로드/재열기·OS IME·전수 조판은 이 검사 범위가 아닙니다.

2026-10-10 게시 후보 tree `57fe8f8b56f37dfbf3e8b3aaceee70b94665b594`는 app/Worker의 실제 ESM static import/export464모듈, HTML/CSS, 서버 및 집중 검사 의존성을 함께 선택했습니다. 별도 export `/tmp/hwpjs-ui-publication.QAt3cS`의 ReleaseSafe 빌드와464모듈 연결이 exit0입니다. WASM SHA256은 `7e70bbc74b7665553cd4f7e1b6a90aeb81a2e14c6c705e332d0ddac495e645e8`입니다. 모듈 body는 연결 검사에서 실행하지 않습니다.

현재 작업 트리와 별도 export 양쪽에서 Canvas editor/edit·history controls·document save·reader Worker5파일215/215·skip0·exit0을 확인했습니다. 실제 HWP5 입력·저장·재열기와 이력, 보호된 제어문자 삭제 거부 후 원래 caret/선택 방향 복원, 다문단 편집·탭/캡션/중첩 문단, 다운로드 바이트 보존과 늦은 Worker 응답 거부를 포함합니다. DOM/Canvas 대역 검사는 실제 브라우저 E2E나 OS IME 완료와 구분합니다.

RHWP 참조의 `rhwp-studio/src/ui/menu-bar.ts`는 메뉴를 CommandDispatcher로 연결하고 현재 상태에 따라 활성 여부를 갱신합니다. `toolbar.ts`는 글꼴·크기·강조·정렬 등의 도구를 분리합니다. 현재 UI도 메뉴·도구 모음에서 기존 편집 명령을 호출하는 방향을 유지하지만, RHWP 메뉴의 hover 전환·전체 명령·외형과 동작 동치를 검증한 것은 아닙니다. 참조 코드를 복사한 구현으로 해석하지 않습니다.

기본 데모 WASM은 이 게시로 자동 교체하지 않습니다. 장시간 전체 native/public gate는 별도 snapshot이며, 전체 픽스쳐의 모든 편집 명령·원본 조판·브라우저/IME 전수 지원은 아직 미완료입니다. 직접 입력 계약과 실제 브라우저 기록은 [Canvas 직접 입력](canvas-direct-input.md)이 소유합니다.
