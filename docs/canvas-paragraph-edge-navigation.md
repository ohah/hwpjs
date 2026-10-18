# Canvas 문단 경계 단축키

## 호스트가 처리한 키와 AltGraph 보호

HWPX의 같은 보호는 `canvas-preview.test.mjs`에서 실제 parashape 원본→Worker/native→Canvas로 확인합니다. seed 편집/undo 뒤 8조합에서 선택·UI 요청0·저장 원본 바이트를 유지하고 redo가 seed 저장본을 복원해야 합니다. 정상 Ctrl+A의 선택은 별도로 허용합니다. cad92271에 이 회귀만 추가한 tree `4e5db694e60ac3387791d42b72f73d5fa93b6f30`의 `/tmp/hwpjs-hwpx-keys-clean.7z2qJU`에서 게시 afb7 후보·Node24.20.0으로 HWP5 Canvas/HWPX preview 두 파일213/213·fail/cancel/skip0·exit0·stderr0(22257ms)입니다. 추적 fixture 전수 읽기 검사를 위해 사본에 추출한 fixture만 임시 Git index에 등록했습니다. `key-tests.log/.stderr`가 근거입니다. 사본에서 보호 guard만 제거한 음성 대조는 consumed/a에서 선택1:2가0:4로 바뀌어 exit1(`negative-key-tests.log/.stderr`)이고, guard 복원 후 집중1/1·exit0입니다. 실제 OS/브라우저 E2E 또는 전체 fixture 편집 완료는 아닙니다.

Canvas의 공통 keydown 진입점은 `defaultPrevented` 또는 `getModifierState("AltGraph")`인 이벤트를 선택 이동·명령 해석 전에 반환합니다. 이미 다른 UI가 처리한 Ctrl+A/방향키를 다시 실행하거나 AltGraph를 전체 선택·이력·줄 나누기로 해석하지 않습니다. 기존 IME/229 거부와 일반 Ctrl/Meta 단축키는 유지하며 키 반복/단어 이동의 별도 규칙을 바꾸지 않습니다.

`canvas-editor.test.mjs`의 실제 HWP5/native harness에서 consumed/AltGraph × a/z/Enter/ArrowRight 8조합을 검사했습니다. 수정 전 consumed/a·consumed/ArrowRight는 선택이 바뀌고 AltGraph a/z/Enter도 가로채는 실패를 재현했습니다. 수정 후 선택·요청0·원본 저장 바이트 불변을 확인했습니다. 게시7a07c1a8에 이 수정/회귀만 적용한 tree `e3bf558215938a95f40f02d66e6082ccd2774ad9`의 `/tmp/hwpjs-canvas-key-clean.PCCGeY`에서 게시 afb7 후보·Node24.20.0으로 해당 Canvas 파일 전체207/207·fail/cancel/skip0·exit0·stderr0(2314ms)입니다. 로그는 `canvas-key-tests.log/.stderr`입니다. 실제 native 문서를 연결한 이벤트 harness 검사이며 OS AltGraph 키보드나 실제 Chromium E2E로 확대하지 않습니다. 기본 데모 산출물은 바꾸지 않았습니다.

## 계약

플랫폼별 키 해석은 `web/preview/navigation-intent.mjs`가 소유하고 실제 위치 계산은 기존 `text-navigation.mjs`가 담당합니다. macOS Cmd+위/아래는 `Home`/`End`와 `paragraphEdge=true`로 변환합니다. 일반 위/아래는 표시 줄 이동이며 Cmd+좌우는 표시 줄 Home/End를 유지합니다. Shift 확장은 기존 anchor를 보존합니다. macOS Control 키 조합은 호스트에 위임합니다.

이는 현재 편집 문단의 경계 이동입니다. 문서 전체 처음/끝 이동이나 문단 간 탐색 완료를 의미하지 않습니다.

## 재현과 검증

대형 HWP 문서의 문단 50000을 실제 Chromium에서 선택한 검증 중, 단순 Home은 줄바꿈된 표시 줄의 시작에 도착해 삽입 위치가 0이 아닌 4가 됐습니다. 원본 좌표대로 입력된 결과이며 저장 데이터 손상으로 분류하지 않습니다. Cmd+위로 변경한 추가 검사는 `BrowserInputOriginNotReached`로 실패했습니다. 기존 키 해석이 `ArrowUp`에 `paragraphEdge=true`만 붙였으나 실제 위치 계산은 Home/End에서만 해당 플래그를 적용한 것이 원인입니다.

`tests/hwp5/canvas-edit.test.mjs`의 너비 16px·텍스트 `1,498 ` 회귀는 3줄 이상 줄바꿈을 확인한 뒤 Cmd+위/아래의 양쪽 경계, Shift anchor, 일반 위 및 호스트 Control 위 동작을 검사합니다. 이 파일은 기존 정규 편집 검증에 등록돼 있습니다. 수정 전에는 ArrowUp/Home 대응 assertion이 실패했고 수정 후 같은 계산 경로가 통과했습니다.

분리 JS 후보에서 정확한 5개 테스트 파일(`canvas-edit`, `browser-input-origin`, `reference-browser-arguments`, `browser-click-target`, `browser-session-close`)을 실행한 결과 37/37, 실패·취소·건너뜀 0, 종료 코드 0입니다. 실제 브라우저의 후속 실행은 신뢰된 beforeinput/input 이벤트와 Worker 입력 범위 0..0을 확인하고 다운로드 파일의 독립 Section·메타데이터 대조와 native 재열기에 성공했습니다. 전체 브라우저 재업로드·종료 판정과 구간 UI 게시 여부는 별도입니다. 이 커밋은 키 해석과 등록된 회귀만 변경하며 전체 구간 UI를 게시하지 않습니다.

이 검사는 모든 키보드 접근성·실제 OS IME·한글 조판 동치의 완료 근거가 아닙니다.

후속 실제 Chromium 검증은 동일 원본의 구간 선택·신뢰된 입력·undo/redo·다운로드·독립 전체 Section/스트림/메타데이터 비교·native 재열기·브라우저 재업로드까지 통과했습니다. `market-real-browser-navigation-fixed.log`의 최종 `browser-audit-complete.success=true`, 전용 세션 `active=false`·`pid=null`, 서버 종료를 확인했습니다. 주입 WASM SHA256은 `1a359d6459cc8c8ec13df8067eec40752c48e2adb668580458cdc32b91e0eb3b`입니다. 분리된 구간 UI 후보의 실제 경로 근거이며 기본 데모 산출물 승격은 아닙니다.
