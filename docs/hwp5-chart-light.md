# 관측 Light·광원 원소

## 지원 범위와 책임

`chart/light.zig`는 inline VtLight3 v1을 [배열 헤더](hwp5-chart-array-header.md), inline VtInfLight3 v1 원소 목록, 원시 10바이트, VtObject v1 기반 타입으로 읽습니다. `chart/light_source.zig`는 원소 하나의 ID·원시 16바이트·시작/끝 위치만 소유합니다. 표본의 두 word 동일성을 명시적으로 선택하는 API이며, 값이 다르면 UnsupportedChartArrayLayout입니다. 일반 배열 의미·다른 광원 클래스·객체 재참조 지원을 추정하지 않습니다.

공식 차트 3.36~3.38과 원본 배치 근거는 [Plot 조사](hwp5-chart-plot-evidence.md)에 둡니다. 원시 비트를 float로 정규화하거나 위치·세기·단위를 확정하지 않습니다. Plot 전체·Axis·렌더링·저장 구현 완료가 아닙니다.

## 소유권·한도·실패

Light는 할당자와 sources 배열을 소유하므로 deinit해야 합니다. Light/Source의 raw는 원본 복사이며 입력 버퍼 수명에 의존하지 않습니다. 배열은 한 원소를 읽을 때마다 늘려 잘못된 큰 개수만으로 전체 목록을 미리 할당하지 않습니다. max_sources 기본값은 65,535이며, 별도의 전체 객체 수 한도는 caller 객체 목록에서 적용합니다.

객체 ID 등록은 기존 목록이 담당합니다. 이전 String/비문자열 ID와의 충돌도 거부합니다. 일반 객체 재참조로 복구하거나 빈 원소로 대체하지 않습니다. reader는 마지막 toOwnedSlice 할당이 성공한 뒤 갱신합니다. 실패 시 부분 목록을 해제하며, 이미 갱신됐을 수 있는 타입/객체 목록은 호출자가 폐기해야 합니다.

## 비공개 WASM 연결

Mode 317 입력은 max_sources·max_objects u32 두 개와 Contents이며 별도 limit은 Contents 크기 상한입니다. 기존 Legend까지의 읽기와 객체 등록은 `tests/hwp5/chart-legend-prefix.zig`를 Mode 316과 공유합니다. 클래스/버전 검사는 core의 기존 chart_type_checks.require를 재사용합니다.

그 뒤 probe에서만 관측 Plot v4 + 비어 있는 첫 배열 + 원시 136바이트를 명시적으로 거쳐 Light를 읽습니다. 첫 배열이 비어 있지 않으면 UnsupportedChartInitialArray입니다. 미해석 136바이트 길이를 제품의 일반 Plot 규칙으로 승격하지 않았습니다. 의미 미확정인 root/grid prefix ID는 여전히 등록하지 않아 차트 전체 객체 동일성 검증으로 주장하지 않습니다.

출력은 end·Light ID·배열 ID·첫 word·둘째 word·원소 수·등록 객체 수 u32 일곱 개, Light raw10, 원소별 ID·시작·끝 u32 세 개와 raw16입니다. 첫 원본 응답은 94바이트입니다. 공개 JS API는 바꾸지 않았습니다.

## 검증 기록

세 모드 전용 WASM에서 실제 43개를 대조했고 각각 정상 173건·거부 6,720건을 통과했습니다. 원본 외에 raw FF, 광원 0개·3개 및 첫 표본의 65,535개 변형을 대조했습니다. 최대 개수 변형은 타입을 재선언하지 않는 새 객체 ID를 사용합니다. 이는 실제 최대 개수 파일의 존재나 모든 광원 유형 지원을 증명하지 않습니다.

잘림은 각 Light 시작부터 끝 직전까지 extent를 갱신해 검사합니다. 클래스·버전·기존 잘못된 타입, 배열 두 값 불일치, 첫 비어 있지 않은 배열, null/이전 객체 충돌, 개수·객체 수·입력 크기의 독립 한도와 원본 재호출을 검사합니다. 거부는 기대 Error 생성자와 이름이 모두 일치해야 통과합니다. 공유 전처리 변경 후 기존 Legend 결과(43개, 정상 258·거부 11,211)도 세 모드에서 유지됐습니다.

네이티브는 0/1/2/3/16개 원소, 불연속 타입 ID·FFFFFFFF 타입 ID·객체 ID 0, 원본 변경 후 raw 유지, 정확한 한도, 모든 잘림·클래스·버전·객체 충돌, 늦은 실패와 OOM을 검사합니다. 별도 safety=true 회계에서 성공·늦은 오류 뒤 잔량 0을 확인합니다. 헤더 자체는 서로 다른 두 word를 보존하며 소비자에서만 거부하는지도 검사합니다.

최종 목록 할당은 타입/객체 할당자와 분리한 FailingAllocator(fail_index=1, resize_fail_index=0)로 초기 목록 할당만 성공시키고, 마지막 toOwnedSlice 재할당을 실패시킵니다. 이때 reader 보존·실제 OOM 발생·할당/해제 바이트 일치를 확인합니다.

추가 경계 대조에서는 실제 43개를 Light 끝에서 정확히 자른 입력과, 그 이후를 FF로 덮어쓴 입력을 세 모드에서 각각 86건 확인했습니다. 다음 Axis 선언의 존재나 값에 의존하지 않고 원본과 같은 Light 응답을 반환했습니다. 이 별도 대조 횟수는 정규 audit 통계에 합산하지 않습니다. 최종 할당 전용 테스트만으로도 cursor 변형이 세 모드에서 expected 1/found end의 실제 assertion 실패를 내는지 재확인했습니다.

`/tmp/hwpjs-chart-light-mutants.9ZoiJB`에서 상한 생략·둘째 word 덮어쓰기·Light raw 삭제·Source raw 삭제·정상 해제 생략·오류 해제 생략·최종 할당 전 cursor 갱신·Source 객체 등록 생략의 8종을 세 모드 모두 실제 테스트 실패로 검출했습니다. Zig test 명령은 모두 종료 코드 1이며, 내부 테스트 프로세스의 assertion 실패 또는 누수 확인 후 ABRT를 로그에서 구분했습니다. 컴파일 실패를 검출로 세지 않았습니다. 첫 표본 출력 94바이트의 개별 XOR 변형과 같은 메시지의 WebAssembly.RuntimeError 대체도 세 모드 모두 검출했습니다.

최종 할당 실패 전용 테스트를 포함한 네이티브 전용 실행은 세 모드 각각 6/6개(root 테스트 포함)를 통과했습니다. 소스·정규 테스트를 고정한 뒤 Debug·ReleaseSafe·ReleaseFast 전체 audit가 각각 27/27 단계, 네이티브 1,030/1,030개, HWP/WASM 8,037,592회 검사를 통과했습니다. 각 모드 Light 결과는 원본 43개·정상 173건·거부 6,720건입니다. 로그는 `/tmp/hwpjs-chart-light-{Debug,ReleaseSafe,ReleaseFast}-audit.log`이며, 세 모드 순차 실행 명령의 종료 코드 0도 확인했습니다. 검사 횟수는 모든 입력의 무결함이나 전체 차트 지원을 뜻하지 않습니다.

전체 audit 이후 최종 `zig build test --summary all`은 5/5 단계·1,030/1,030개, 제품 `zig build -Doptimize=ReleaseSafe --summary all`은 5/5 단계를 통과했습니다. 변경 Zig 포맷·JS 구문·diff 공백과 관련 문서 로컬 링크 36개도 확인했습니다.
