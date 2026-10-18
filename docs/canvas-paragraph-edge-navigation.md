# Canvas 문단 경계 단축키

## 계약

플랫폼별 키 해석은 `web/preview/navigation-intent.mjs`가 소유하고 실제 위치 계산은 기존 `text-navigation.mjs`가 담당합니다. macOS Cmd+위/아래는 `Home`/`End`와 `paragraphEdge=true`로 변환합니다. 일반 위/아래는 표시 줄 이동이며 Cmd+좌우는 표시 줄 Home/End를 유지합니다. Shift 확장은 기존 anchor를 보존합니다. macOS Control 키 조합은 호스트에 위임합니다.

이는 현재 편집 문단의 경계 이동입니다. 문서 전체 처음/끝 이동이나 문단 간 탐색 완료를 의미하지 않습니다.

## 재현과 검증

대형 HWP 문서의 문단 50000을 실제 Chromium에서 선택한 검증 중, 단순 Home은 줄바꿈된 표시 줄의 시작에 도착해 삽입 위치가 0이 아닌 4가 됐습니다. 원본 좌표대로 입력된 결과이며 저장 데이터 손상으로 분류하지 않습니다. Cmd+위로 변경한 추가 검사는 `BrowserInputOriginNotReached`로 실패했습니다. 기존 키 해석이 `ArrowUp`에 `paragraphEdge=true`만 붙였으나 실제 위치 계산은 Home/End에서만 해당 플래그를 적용한 것이 원인입니다.

`tests/hwp5/canvas-edit.test.mjs`의 너비 16px·텍스트 `1,498 ` 회귀는 3줄 이상 줄바꿈을 확인한 뒤 Cmd+위/아래의 양쪽 경계, Shift anchor, 일반 위 및 호스트 Control 위 동작을 검사합니다. 이 파일은 기존 정규 편집 검증에 등록돼 있습니다. 수정 전에는 ArrowUp/Home 대응 assertion이 실패했고 수정 후 같은 계산 경로가 통과했습니다.

분리 JS 후보에서 정확한 5개 테스트 파일(`canvas-edit`, `browser-input-origin`, `reference-browser-arguments`, `browser-click-target`, `browser-session-close`)을 실행한 결과 37/37, 실패·취소·건너뜀 0, 종료 코드 0입니다. 실제 브라우저의 후속 실행은 신뢰된 beforeinput/input 이벤트와 Worker 입력 범위 0..0을 확인하고 다운로드 파일의 독립 Section·메타데이터 대조와 native 재열기에 성공했습니다. 전체 브라우저 재업로드·종료 판정과 구간 UI 게시 여부는 별도입니다. 이 커밋은 키 해석과 등록된 회귀만 변경하며 전체 구간 UI를 게시하지 않습니다.

이 검사는 모든 키보드 접근성·실제 OS IME·한글 조판 동치의 완료 근거가 아닙니다.

후속 실제 Chromium 검증은 동일 원본의 구간 선택·신뢰된 입력·undo/redo·다운로드·독립 전체 Section/스트림/메타데이터 비교·native 재열기·브라우저 재업로드까지 통과했습니다. `market-real-browser-navigation-fixed.log`의 최종 `browser-audit-complete.success=true`, 전용 세션 `active=false`·`pid=null`, 서버 종료를 확인했습니다. 주입 WASM SHA256은 `1a359d6459cc8c8ec13df8067eec40752c48e2adb668580458cdc32b91e0eb3b`입니다. 분리된 구간 UI 후보의 실제 경로 근거이며 기본 데모 산출물 승격은 아닙니다.
