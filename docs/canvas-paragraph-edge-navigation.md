# Canvas 문단 경계 단축키

## 중첩 원본 사이의 일반 좌우 커서 이동

`paragraph-navigation.mjs`는 기존 `paragraphSelectionOwner`를 공유해 현재 소유권의 원본 순서상 다음/이전 문단을 찾습니다. 원본 배열을 바꾸거나 중첩 문단을 삭제하지 않습니다. 같은 소유권의 clipped 문단·구역 경계·중복 ID·미지 소유권·생성 셀은 거부합니다. renderer는 도착 위치의 실제 caret geometry가 있는지도 검사합니다. Canvas의 **일반 접힌 커서** 이동만 이를 사용하며 Shift 범위 선택과 편집·삭제·병합 권한은 기존 검사를 유지합니다.

실제 table-bug 본문0→2·4→73에서 중간에 다른 소유권 문단이 있어 수정 전 ArrowRight가 멈추는 실패를 재현했습니다. 같은 원본의 양방향 이동·Shift 확장 거부·native 요청0·원본 무편집 저장과 순수 helper의 clipped/구역/중복/생성 셀 거부를 기존 정규 등록 파일 `canvas-navigation-ownership.test.mjs`에서 검사합니다. 최초 primary4파일 실행은 명시적 `HWPJS_TEST_WASM` 환경변수 누락으로 `ExplicitCanvasKeyCandidateRequired`1실패/1skip이며 제품 이동 실패로 분류하지 않습니다. 재실행은 명시적 bacf 후보를 사용합니다. 로그는 `/tmp/hwpjs-navigation-publish.KsSYcz/horizontal-before.log` 및 `horizontal-primary-regression.log`이고 분리 후보는 `/tmp/hwpjs-paragraph-navigation.B3Mcjv`입니다.

일반 좌우 이동 최종 primary 재실행과 분리 후보의4파일은 각각274/274·실패/cancel/skip0·exit0·stderr0입니다. `primary-regression-retry.log`와 `clean-regression.log`가 근거이고 분리 로그 SHA256은 `201eb0441169e000de97439d49f7c4aa80c8ced764921fd1ad2f5c7d226801c6`입니다. 분리 소스는 게시 HEAD 위에 이번5파일 변경만 포함하며 실제 브라우저 키 입력/모든 문단·객체/OS IME 검증과 구분합니다.

## 세로 이동의 소유권 후보 선택

`text-navigation.mjs`의 선택적 `acceptRow`는 위치 계산에 소유권 정책을 주입합니다. Canvas는 기존 `renderer.selectionRanges`로 해당 anchor에서 후보 줄까지의 선택 가능 여부를 확인합니다. 다른 소유권의 줄을 최단 거리로 먼저 선택한 뒤 거부해 멈추지 않고, 허용되는 후보 중 가까운 줄을 선택합니다. 기존 구역·반복 페이지·변환 프레임 조건과 최종 선택 범위 검사도 유지합니다. 이미 허용한 줄보다 먼 후보에는 불필요한 소유권 조회를 하지 않습니다. 형식별 소유권 규칙이나 저장 모델을 이동 모듈에 복제하지 않습니다.

실제 `table-bug.hwp`의 문단13/17/208에서 아래 방향의 첫 표시 후보11/16/219는 다른 소유권이지만 같은 소유권의 다음 문단14/18/209가 존재합니다. 수정 전 ↓는 원래 위치에 멈추는 실패를 `navigation-owner-before.log`로 재현했습니다. `canvas-navigation-ownership.test.mjs`는3원본 위치×일반/Shift6이동의 정확한 도착·선택 경계 유지·native 요청0·무편집 원본 저장을 검사합니다. 순수 위치 검사에서는 위/아래 양 방향·전부 거부·anchor 유지·입력 불변·불필요한 먼 줄 조회 부재를 확인합니다. Home은 여전히 표시 줄의 시작이며 문단 시작과 혼용하지 않습니다.

중간 구현의 primary/분리 소스 회귀는 각각4파일272/272·실패/cancel/skip0·exit0·stderr0입니다. 로그는 `/tmp/hwpjs-table-canvas-publish.EhN4M1/navigation-owner-regression.log`와 `/tmp/hwpjs-navigation-publish.KsSYcz/clean-regression.log`입니다. 사용 WASM은 bacf 후보입니다. 최종 후보는 먼 줄 조회 최적화 이후 별도 재실행하며 중간 결과로 대체하지 않습니다. 실제 Worker/WASM·모사 DOM/Canvas의 증거이며 실제 브라우저/OS 키보드·모든 객체/조판 완료가 아닙니다.

세로 소유권 최종 분리 소스도4파일272/272·실패/cancel/skip0·exit0·stderr0으로 종료했습니다. 근거는 `/tmp/hwpjs-navigation-publish.KsSYcz/clean-final-regression.log`이며 먼 후보 조회 최적화와 그 부정 기대를 포함합니다. primary의 무관한 기존 Canvas 변경은 이 분리 소스에 포함하지 않았습니다.

2026-10-19 기본 Tailscale10000의 실제 Chromium에서 table-bug 원본을 업로드하고 편집을 활성화한 뒤 찾기로 문단13의 `□ 25년 활동`을 선택했습니다. 신뢰된 ArrowLeft로 `[0,0)`에 접고 ArrowDown으로 문단14/unit0, ArrowUp으로 문단13/unit0, Shift+ArrowDown으로 문단14/unit0 도달을 확인했습니다. 네 키 모두 isTrusted=true/defaultPrevented=true이며 관측 중 Worker 요청0입니다. `browser-owner-selection.png`를 직접 확인해 문단13의 선택 강조와 아래 셀 줄의 caret를 확인했습니다. 이 브라우저 실행은 한 소유권 범위의 양방향 이동/선택 표시이며 테스트의3원본 위치 전수·OS IME·다운로드 보존 검사를 대신하지 않습니다.

브라우저 스킬의 소유 세션 `hwpjs-navigation-owner-35c54947528a`를 close하고 후속 info의 inactive/pid=null을 확인했습니다. 별도 HTTP 대조에서 기본10000의 text-navigation/canvas-editor/WASM은 primary 파일과 전체 SHA256이 일치했습니다. primary Canvas에는 무관한 미게시 변경도 있으므로 이 실행을 깨끗한 main 전체의 브라우저 검증으로 확대하지 않습니다. 사진은 `/tmp/hwpjs-navigation-publish.KsSYcz/browser-owner-selection.png`입니다.

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
