# 셀 크기의 표시 단위와 원값 보존

## 현재 범위

셀 크기 대화상자의 mm·pt 선택은 새 SDK·데모 빌드와 실제 Noori HWP5·HWPX의 Vanilla 브라우저 검증까지 통과했습니다. 공개 사이트의 배포 후 확인은 별도 단계입니다. 이전 pt UI의 셀 크기 검증은 [원본 셀 서식](headless-original-cell-formatting.md#원본-표-셀-크기-ui)의 별도 기록입니다.

`apps/demo/src/table-cell-size-units.ts`는 표시와 임시 입력만 소유합니다. 원본 크기는 Native의 HWPUNIT 정수이며, 선택 권위·소유자·수명·변경 접수는 기존 `table-cell-properties-port.ts`가 유지합니다. 새 Native 모델이나 별도 저장 캐시를 만들지 않습니다. 기본 표시는 mm, 다른 선택은 pt입니다. 공식 웹한글의 단위 전환 UI나 반올림 정책과 동일하다는 주장은 아닙니다.

## 정수와 표시의 구분

HWPUNIT는 1/7200인치입니다. mm는 소수 둘째 자리까지 표시하고, 명시적으로 편집한 mm 입력은 가장 가까운 HWPUNIT 정수로 변환합니다. 양수의 중간값은 위쪽으로 반올림하는 제품 정책이며 BigInt 유리수 계산으로 이진 부동소수점 오차를 피합니다. pt 입력은 기존 0.01pt 정밀도를 유지합니다. 단위 선택에 무효 문자열이 들어오거나 mm 입력의 소수 부분이 두 자리를 넘으면 거부합니다. 숫자 검증과 실제 셀 크기 허용 여부는 별개이며, 공유 열 너비0 같은 구조상 불가능한 값은 기존 계획기가 계속 거부합니다.

화면 문자열을 원값으로 쓰지 않습니다. 원본 값42510은149.97mm로 표시되지만, 이 문자열을 다시 변환하면42511이 됩니다. Noori HWP5의 table20/list26과 HWPX의 table59/list77에서 동일한 원본 크기를 실제 기존 Native로 관측했습니다. 단위만 바꾸거나 높이만 편집할 때 너비를42511로 바꾸면 안 됩니다. 기본 표시가 같다는 이유로 서로 다른 정수의 의도적인 pt 편집을 원값으로 되돌려서도 안 됩니다.

임시 draft는 축마다 현재 문자열과 선택된 정수를 함께 보유합니다. 같은 표시의 반복 이벤트·표기만 바꾼 입력은 정수를 유지하며, mm→pt→mm는 정수에서 새 표시만 계산합니다. 유효하지 않은 입력은 단위 변경을 막습니다. 기존 wire에는 계속 `widthPoints`, `heightPoints`, `mode`, `dirty`만 전달합니다. 단일 셀 요청의 미변경 축은 원값이고, 공유 열의 높이는 실제 변경일 때만 포함합니다. 단위 선택 자체는 명령·이력·dirty를 만들지 않습니다.

## 소스 검증과 남은 gate

최종 직접 discriminator 변경까지 포함한 helper14개와 view·port·tool69개, 총83개가 한 실행에서 통과했습니다. 후자는 통제 DOM/포트 검사이며 실제 Canvas나 Native 저장 증거가 아닙니다. 명시 view·helper를 포함하는 strict `allowJs` 타입 검사도 통과했으며, 이전 view에서도 재현된 기존 포트 타입 오류와 최종 성공을 구별합니다. 단위 선택을 위한 새 capability나 구형 SDK fallback은 추가하지 않았습니다.

소스 적대적 검토는 세 관점으로 진행했습니다. 첫째, 원본 정수와 반올림 표시·형식만 다른 문자열·의도적인 pt 편집을 구분했습니다. 둘째, busy·readonly·stale·composition·disposed와 무효 크기에서 draft 및 단위 전환을 검사했습니다. 셋째, 포트의 기존 token·변경 축·단일 접수·취소·현재값 재조회 경계를 유지하는지 확인했습니다. 통제 composition 이벤트를 실제 OS IME 증거로 확대하지 않습니다.

후속 격리 빌드는 기존 `main`의 제품 소스에 이번 제품 파일5개만 덮어써 Core·Vanilla·React·Svelte SDK와 Vite를 각각 한 번 빌드했습니다. 새 SDK 선언을 사용하는 명시 view·helper·port·공유 열 계획의 엄격 `allowJs` 타입 검사와 실제 program 포함 확인이 통과했습니다. 넓은 shell/source 타입 검사는 이전 `main`에서26개, 후보에서23개 오류가 났으며 같은 조건의 별도 baseline 실행과 대조해 새 오류0개·기존 포트 오류3개 제거를 확인했습니다. 넓은 검사 전체가 통과한 것은 아닙니다. 이전 실패 로그와 최종 집중 성공을 구분합니다.

후보 SDK 세대는 `f9afb06e…16a16e`입니다. Worker와 Native 바이트는 이전 배포와 같습니다. 따라서 보존한 이전 SDK runtime과 새 runtime이 같은 Worker를 참조하며, manifest의 실제 참조 목록에는 둘 다 포함합니다. 새 UI는 새 SDK만 사용해야 합니다. 이 보완은 manifest 참조 목록만 바꿨으며 이전 자산을 삭제하거나 validator를 완화하지 않았습니다. 공개/내부 정적 검사와 기존 URL 보존을 확인했지만 실제 브라우저 검증과 동일한 증거로 읽지 않습니다.

## 실제 브라우저·저장 검증

최종 실행은 Noori 두 형식의 단위-only·높이 편집과 이력·다운로드와 재열기, 총6개가 한 실행에서 통과했습니다. 실제 Canvas 날짜 셀을 클릭하고 현재 table/list 소유자를 확인한 뒤 단위 선택과 입력·적용·실행취소·재실행·저장·재업로드를 수행했습니다. mm→pt→mm와 undo 뒤 단위 변경은 Native 변경이나 이력 손실을 만들지 않았습니다. 선택한 높이는2149→2432 HWPUNIT, 화면7.58→8.58mm로 바뀌었고 미변경 너비42510은 유지됐습니다. 저장된 높이와 실제 그리기의 최소 높이를 같은 수치라고 단정하지 않습니다.

다운로드 완료 파일의 SHA가 해당 Worker 저장 바이트와 일치해야 합니다. HWP5는 독립 CFB/레코드 oracle로 대상 크기만 바뀌고 비대상 스트림이 유지됐는지 확인했습니다. HWPX는 독립 ZIP/XML oracle와 별도 table/list 소유권 관측으로 대상 크기 및 나머지14개 ZIP 항목의 보존을 확인했습니다. 잘못된 기대 너비42511은 양 형식에서 거부됐습니다. 실제 다운로드한 파일을 다시 업로드해 원 너비와 새 높이를 확인했고, 원본 fixture와 source5의 SHA는 전후 같았습니다.

최초 검사 도구의 여러 글꼴 run 매칭·native select 키 동작·필요하지 않은 input 이벤트 기대·HWPX Native/public 문단 번호 대응 오류는 각각의 실패 기록으로 보존했습니다. 이를 제품 결함 수정이나 최종6개 성공에 합산하지 않습니다. 최종 표준 브라우저 select 명령의 change 이벤트는 `isTrusted: false`로 관측했으며 OS 키보드 입력 증거로 주장하지 않습니다. Canvas 클릭은 별도 trusted pointer 증거를 확인했습니다. 실제 UI 검증은 Vanilla의 두 형식이며 React·Svelte의 빌드/타입/HTTP 확인을 해당 프레임워크의 전체 GUI 검증으로 확대하지 않습니다.

최종 브라우저는36.171초, wrapper 종료0이며 세션 `active=false`, `pid=null`, 소유 잔여 프로세스0을 확인했습니다. 앞선 실패 실행의 일시적 helper 잔여와 그 후 종료 확인도 별도로 보존했습니다. 증거는 `browser/FINAL-HANDOFF.json`, `browser/private-unit-browser-48077/results.json`, `browser/private-unit-bounded-1794048981-48070.json`입니다. 실제 OS IME·모든 viewport·공유 열 UI·모든 표의 조판 동치는 이번 검증 범위가 아닙니다.

증거는 ignored `zig-out/verification/cell-size-units-r1/`의 `HANDOFF.json`, `SOURCE5-FROZEN.json`, `ADVERSARIAL-REVIEWS.md`, strict 타입 로그 및 `baseline/rounding-risk-candidates.json`입니다. 최종83개 실행은 `MAIN-FINAL83.tap`과 `MAIN-FINAL-COHORT.md`가 소유합니다. 새 빌드·타입·정적 검사는 `build/FINAL-BUILD-HANDOFF.json`, `build/TYPES-BASELINE-DELTA.json`, `build/STATIC-PAIR-VERIFICATION.json`을 따릅니다. 기존 Native 지문은 `82031994…155ccc`이며 새 Native 빌드는 필요하지 않습니다. 운영 전환과 공개 배포 후 검증은 `delivery/`의 별도 영수증으로 확인하며 내부 후보 성공만으로 공개 사이트가 갱신됐다고 판단하지 않습니다.

## 원본 셀 세로 정렬

격리 소스 후속은 기존 표/셀 속성 창에 세로 정렬 선택을 연결한다. 원본 단일 셀의 현재 Native 관측이 제공한 TOP, CENTER, BOTTOM만 위쪽, 가운데, 아래쪽으로 표시한다. 미지원 엔진이나 원본 셀이 아닌 선택에는 비활성 항목을 유지한다. 미지정 null은 미지정 그대로 표시하고 기본 TOP을 만들어 쓰지 않는다. HWPX에서 Native가 미지정 값을 명시적으로 설정할 수 있다고 허용한 경우에만 사용자가 새 값을 선택할 수 있다.

capability는 조회를 준비할지 결정하는 표시 조건이다. 선택된 원본 셀의 실제 권한은 기존 captureVerticalAlignment 조회와 Core의 불투명 target에서 얻는다. 조회는 창을 열기 전에 마치고 같은 state와 section/paragraph/table/list의 관측만 받는다. 창을 연 직후 `bindVerticalAlignmentDialog`가 현재 연결되어 열린 단일 모달과 선택의 소유권을 확인하면 정렬을 활성화한다. 조회 중 문서나 선택이 바뀌거나 창을 닫으면 늦은 결과로 창을 열지 않는다. 바인딩 실패, 알 수 없는 값, readonly, 미지원 owner는 정렬을 활성화하지 않는다.

확인은 새 정렬 값만 기존 applyVerticalAlignment에 전달한다. 크기와 정렬을 함께 바꾼 초안은 명시적으로 막는다. 내부에서 여러 명령으로 나누지 않으며, 한쪽 값을 되돌린 뒤 원하는 동작 하나를 적용해야 한다. 정렬 초안이 있으면 기존 테두리/배경 도구로 이동해 버리지 않는다. 미변경 축과 기존 단위 변환 및 채우기 명령은 그대로 유지한다. 크기 쓰기가 지원되지 않는다는 이유만으로 별도로 허용된 정렬까지 비활성화하지 않는다.

정렬 target은 단일 사용이다. 거부되거나 결과 확인이 필요한 적용 뒤에는 같은 target을 재접수하지 않는다. 불확실한 완료는 재적용 안내로 바꾸지 않고 문서 확인을 요청한다. 기존 크기 포트의 자동 선택 복원은 크기 거래 전용이므로 정렬 거래의 복원 성공을 추정하지 않는다. 현재 구현은 복원하지 못한 경우 커서를 다시 선택하도록 안내한다. multi-cell, 생성 셀, 중첩 또는 불완전한 원본과 복합 원자 거래 지원을 이 UI 연결로 확대하지 않는다.

이 후속의 집중 시험은 실제 view/tool/port 소스와 합성 Core 및 DOM을 사용한다. 기존 크기/단위/포트/채우기 진입96개와 정렬 UI33개를 같은 최종 실행에서 확인한다. 이 수치는 별도 소유자의 Core/Native 시험 수와 합산하지 않는다. 엄격 noEmit 소스 검사와 정규 formatter도 별도 기록한다. 새 WASM, 공식 SDK 및 실제 속성 창의 trusted 선택, IME, 세로 배치 표시, 단일 이력과 저장/fresh reopen은 이 소스 후보에서 실행하지 않았다.

최종 WASM과 공개 SDK에서 누리 HWP5·HWPX 셀의 가운데→아래쪽 변경을 확인했다. 실제 Chrome에서도 첫 표의 날짜 셀을 클릭하고 속성 창에서 같은 변경을 적용했다. 양 형식 모두 도구 모음의 실행 취소와 다시 실행, 파일 저장과 새로 열기를 확인했다. 실행 취소 후 저장본은 원본과 바이트가 같았고, 편집 저장본은 공개 SDK로 만든 파일과 바이트가 같았다. 독립 검사에서 HWP5는 대상 셀 목록 헤더의 정렬 비트만, HWPX는 대상 셀 정렬 속성과 해당 셀의 줄 배치 캐시만 바뀌었다. HWP5 저장에는 사용자가 줄 배치 변경 가능성을 확인하고 동의했다.

속성 적용 후 커서를 복원하지 못하는 경우에는 도구 모음으로 실행 취소와 다시 실행을 할 수 있다. 이 경우 문서를 다시 클릭해 포커스를 되돌린 뒤 키보드 단축키를 사용할 수 있다.

재현할 때는 Node의 기존 table-cell-properties-style-preload와 정확한 Core source alias를 명시하고 다음 여섯 시험 파일을 선택한다. source alias 결과를 설치된 공개 SDK 결과로 읽지 않는다.

- apps/demo/tests/table-cell-properties-tool.test.mjs
- apps/demo/tests/table-cell-properties-view.test.mjs
- apps/demo/tests/table-cell-properties-appearance-handoff.test.mjs
- apps/demo/tests/table-cell-properties-port.test.mjs
- apps/demo/tests/table-cell-size-units.test.mjs
- apps/demo/tests/table-cell-properties-vertical-alignment.test.mjs

## 편집 중 생성한 표의 셀 세로 정렬

새로 만든 표의 셀 속성에서 세로 정렬을 함께 지정할 수 있다. 지원 조건과 저장 규칙은 [생성 단일 셀 세로 정렬](created-cell-vertical-alignment.md)을 따른다.
