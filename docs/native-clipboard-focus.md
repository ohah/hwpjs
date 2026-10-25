# 기본 붙여넣기와 찾기 선택의 포커스

## 계약

Canvas의 확정 anchor/focus를 textarea에 투영한다. 브라우저나 모달 창이 focus 시 이전 DOM range를 복원하더라도, 확정 상태에서는 Canvas 선택 범위를 다시 적용한다. 조합 중인 텍스트, 대기 편집, 비동기 응답과 다른 문단을 가로지르는 선택은 이 단일 문단 복원 경로로 덮어쓰지 않는다. `focusInput()`과 DOM focus 이벤트가 같은 책임을 소유한다.

기본 플랫폼 modifier+V는 사용 가능한 문서 입력창으로 포커스를 옮긴 뒤 브라우저의 실제 paste 이벤트를 허용한다. 편집은 기존 beforeinput/input/lease 경로가 소유하며 별도 clipboard 읽기 명령을 중복 실행하지 않는다. 비활성 기본 binding은 브라우저 기본 동작도 차단한다. 사용자 지정 paste 키와 toolbar는 기존 공개 명령 경로를 사용한다. 이 기능은 clipboard 읽기 권한을 부여하지 않는다.

## 재현과 검증

수정 전 실제 `charshape.hwpx`의 찾기 결과 `진하게`를 선택하고 창을 닫으면 입력창은 focused지만 범위가 기대 3–6 대신 0–0이었다. 실제 paste 이벤트는 발생했지만 Worker splice 요청은 없었다. 근거는 `zig-out/verification/clipboard-public-ui/native-paste-vanilla-hwpx-2026-10-25T09-07-32-440Z/`다. focus 시 DOM 범위를 되돌리는 조건을 별도 단위 검사로 재현했다.

수정 후 `tools/editor-native-paste-matrix.mjs`로 Vanilla/React/Svelte와 HWP/HWPX의 6조합을 직렬 실행했다. clipboard가 공유되므로 병렬 실행하지 않는다. 로컬과 테일스케일 공개 주소 각각 6/6, 총 12개 시나리오가 통과했다.

- 찾기로 `기울임` 복사, `진하게` 선택, 창 닫기 후 범위 3–6과 포커스 확인
- 실제 modifier+V와 trusted paste 이벤트, 정확히 한 번의 splice, readText 권한 오류 부재
- 붙여넣기 후 caret 6, `x` 입력 후 caret 7
- 키보드 undo 두 번·redo 두 번의 내용·선택 범위·포커스
- 실제 Chromium 다운로드와 Worker 저장 bytes 일치, redo 저장 bytes 일치와 재열기
- HWP5 독립 CFB/record 전체 stream 검사, HWPX 독립 ZIP/XML 검사(normal/-O), 잘못된 기대 문자열 거부

실행 근거는 `zig-out/verification/clipboard-public-ui/matrix-2026-10-25T09-12-36-855Z/`와 `matrix-2026-10-25T09-13-09-191Z/`다. 각 하위 실행의 cleanup.json은 소유 브라우저 비활성을 확인한다. 공개 WASM SHA256은 `fc7fb2ab7eeff2bb07ae1463f7e5b12dcc7ebbd49f4c6de9487a85da6900dda4`이며 빌드 파일과 동일하다.

실행 명령은 `node tools/editor-native-paste-matrix.mjs <origin>`이다. 개별 실행은 `node tools/editor-native-paste-browser-audit.mjs <origin> <vanilla|react|svelte> <hwp|hwpx>`다. 도구는 실제 CLI 소유 페이지의 URL·nonce를 확인한 다음 CDP의 고정 native paste key 명령을 사용한다. clipboard 내용이나 권한을 주입하지 않는다. 관측기는 입력 이벤트 종류·길이·범위만 기록한다.

이 결과는 해당 두 fixture의 macOS Chromium 기본 단축키 경로를 증명한다. 모든 fixture, Windows/Linux 브라우저, IME·다중 문단·created-cell paste, 전체 조판 동치 및 전체 목표 완료의 근거는 아니다.
