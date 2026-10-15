# HWPX AVG 분할의 실제 브라우저 검증

## 구성과 범위

2026-10-15 현재 작업 트리의 JS/Canvas UI와 main 격리 빌드 WASM을 조합했습니다. 서버에 지정한 후보 SHA256은 `0980ffc8988bb4af2a3d3790976dbd63cb9c3e8b7b293ef4228b0cfdb0c64482`입니다. 기본 WASM이나 외부 데모 서버를 교체하지 않았습니다. 현재 UI에는 미게시 변경이 있으므로 게시된 UI 전체의 검증으로 확대하지 않습니다. 계산 정책은 [셀 scalar 계약](hwpx-formula-cell-scalars.md)이 소유합니다.

## 실제 입력과 이력

headless 브라우저에서 실제 chart.hwpx를 파일 선택으로 열고 Canvas 편집을 시작했습니다. 찾기 폼에418을 입력해 유일한 결과를 선택한 뒤 Canvas 입력에 Home→Enter를 전송했습니다. keydown은 isTrusted=true였고 Enter 직전 선택은[0,0]이었습니다. Worker 직접 호출이나 합성 DOM 이벤트로 분할하지 않았습니다. Enter는 keydown 처리 경로이므로 beforeinput 발생을 주장하지 않습니다.

문서 상태는175→176문단, 접근성 projection의 AVG 결과는266.00→215.33으로 갱신됐습니다. Ctrl+Z에서175문단·266.00·215.33 부재, Ctrl+Shift+Z에서176문단·215.33을 확인했습니다. 이는 찾기 UI를 통한 선택과 실제 키 입력 경로의 증거이며 해당 셀의 포인터 hit-test·픽셀 위치·IME·원본 한글 조판 동치 검증은 아닙니다.

## 실제 다운로드와 독립 검사

다운로드 버튼을 scrollIntoView한 뒤 브라우저 다운로드로 `browser-avg-edited.hwpx`(178975바이트)를 받았습니다. 원본 XML153번 입력의0분할에 대해 독립 Decimal·전체 대상 XML/비대상 ZIP oracle를 통과했습니다. 같은 후보의 native 재열기에서176문단·왼쪽 빈 문단·오른쪽418·계산 결과215.33과 무변경 저장 바이트 일치를 확인했습니다. 원본 fixture는 변경하지 않았습니다.

기록 디렉터리는 `/tmp/hwpjs-native-current-20261015.QKXKKy`이며 저장본과 `browser-avg-after.png`가 있습니다. 화면 캡처는 다운로드 뒤 도구 모음/문서 일부이며 선택 셀의 시각 위치를 입증하지 않습니다. `browser-avg-evidence.json`은 별도 JS 진단 export의 구문 오류를 담고 있으므로 hash/trace 성공 증거로 사용하지 않습니다. 브라우저 fetch의 네트워크 hash를 직접 확인했다고 주장하지 않습니다.

## 종료 확인

전용 세션 `hwpjs-avg-canvas-20261015`와 포트9017 임시 서버를 종료했습니다. 종료 직후 목록의 일시적 잔여 표시 뒤 재조회에서 세션 부재·listener 부재를 확인했습니다. 다른13개 세션과 다른 프로젝트의 디바이스는 종료하지 않았습니다. 추가 조회를 위해 닫힌 세션에서 페이지 명령을 실행하지 않았습니다.
