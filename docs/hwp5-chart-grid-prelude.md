# 관측 차트 격자 전처리

## 범위와 명세 경계

`chart/grid_prelude.zig`의 readObservedV6는 호출자가 명시적으로 선택한 VtChart 버전 6 / 격자 기반 타입 버전 1의 관측 레이아웃만 읽습니다. [Contents 조사](hwp5-chart-contents-evidence.md)와 [타입 목록](hwp5-chart-type-table.md)을 기반으로 하며 모든 차트 버전의 자동 판별기가 아닙니다.

36바이트 앞부분을 읽고 offset 32의 u32가 나머지 Contents 길이와 같은지 확인합니다. 이후 원시 u32, VtChart 타입 참조, 원시 u32, VtDataGrid/VtMatrix/VtCollection 타입 참조, 원시 u16, VtObject 타입 참조, 행·열 u16을 순서대로 소비합니다. 문자열 검색이나 오류 후 다른 마커로 재동기화하지 않습니다. 타입 ID는 연속 번호나 고정 값으로 가정하지 않습니다.

공식 차트 문서의 객체/타입 설명과 API 속성 표만으로 이 전체 바이트 배치를 증명했다고 주장하지 않습니다. 앞부분 세 원시 필드의 의미는 미확정입니다. API 속성 자료형과 관측 직렬화 폭도 구분합니다. 행·열 0/1/65535는 원값으로 보존하며 셀 내용의 의미적 유효성을 보증하지 않습니다.

## 소유권과 한도

Prelude는 앞부분 36바이트 사본과 타입 목록을 소유하고 deinit으로 해제합니다. 호출자는 후속 데이터를 읽으려면 원본 Contents를 별도로 유지해야 합니다. payload_offset은 전처리 이후의 위치일 뿐 격자 전체나 객체 전체의 끝이 아닙니다. 셀·문자열·수치·객체 그래프는 아직 읽지 않습니다.

max_bytes는 전체 Contents 길이, max_cells는 행×열의 상한입니다. 곱은 u32로 계산하고 셀 배열을 할당하지 않습니다. 타입 개수·개별 이름·누적 이름 한도는 타입 목록에서 소유합니다. 후반부 오류와 OOM에서도 이미 소유한 타입 이름을 해제합니다. 원본에 대한 쓰기는 없습니다.

## 실제 파일 및 구성 검증

비공개 WASM mode 310은 타입 수/개별 이름/누적 이름/셀 수 상한 u32 네 개 뒤 Contents를 받습니다. 별도 limit은 Contents 바이트 상한입니다. 출력은 원본 prefix 36바이트와 원시 필드 3개·행·열·후속 offset·타입 수·이름 바이트 합계의 u32 8개, 총 68바이트입니다. 공개 JS API는 바꾸지 않습니다.

`tests/hwp5/chart-grid-preludes.mjs`는 실제 OLE Contents 43개를 대상으로 전체 바이트를 순차 파서에 전달합니다. 표본 선택에만 VtChart 마커를 사용하며 이는 제품 자동 판별 규칙이 아닙니다. 독립 기대값은 조사된 고정 위치에서 읽습니다. 이 표본들의 후속 offset은 140, 타입 수는 5, 이름 바이트 합계는 50입니다. 고정 위치를 제품 파서에 넣지 않습니다.

표본 원값뿐 아니라 앞부분 불투명 필드 변경, 행·열 0/1/65535 조합을 검사합니다. 후자는 구성 입력 보존 시험이지 실제 차트가 의미적으로 유효하다는 증거가 아닙니다. 0..139의 모든 잘림은 가능할 때 extent를 다시 계산해 깊은 오류 경로까지 검사합니다. 타입 이름/버전/NUL/extent 손상, 독립 한도, 오류 후 원본 재호출을 확인합니다.

네이티브는 희소 타입 ID, 입력 변경 후 소유권, 후속 바이트 미소비, 모든 클래스와 버전의 독립 거부, 다른 클래스와 동일 ID, 뒤쪽 정상 마커로 우회하지 않음, OOM 주입 및 명시적 allocator 잔량 0을 검사합니다. Debug/ReleaseSafe/ReleaseFast에서 root 포함 5/5 통과했습니다.

세 모드의 실제 WASM에서 각각 정상 473건·오류 6,493건 및 오류 후 원본 복구를 통과했습니다. 반환 68바이트의 각 바이트를 XOR 1 한 응답을 모두 검출하고, LimitExceeded와 같은 메시지를 갖는 WebAssembly.RuntimeError도 정상 오류로 오인하지 않고 assertion 실패했습니다. ReleaseFast 최초 실행은 빌드 완료 전 파일 접근으로 ENOENT가 났으며 검증으로 세지 않았습니다. 빌드 종료 코드 0 확인 후 다시 실행한 결과가 위 통과 수치입니다.

`/tmp/hwpjs-chart-grid-mutants.PWbPGF`의 별도 소스 복사본에서 클래스 검사 제거(class), extent 검사 제거(extent), collection_prefix를 0으로 변경(prefix), 실패 시 타입 목록 해제 누락(leak)을 실행했습니다. 네 변형 모두 세 모드에서 실제 테스트 실패·종료 코드 1로 검출했습니다. 앞 두 변형은 ExpectedPreludeRejection, prefix는 19 대신 0, leak는 MemoryLeakDetected로 실패했습니다. 컴파일 오류를 검출 성공으로 세지 않았고 제품 소스는 변형하지 않았습니다.

소스·테스트를 고정하고 Debug → ReleaseSafe → ReleaseFast 전체 audit를 순서대로 실행했습니다. `/tmp/hwpjs-chart-grid-prelude-{Debug,ReleaseSafe,ReleaseFast}-audit.log`에서 각 모드 27/27 단계·1,001/1,001 네이티브 테스트·HWP/WASM 7,857,825회 검사 통과를 확인했습니다. Debug 실행과 뒤이은 두 최적화 모드의 순차 실행 모두 종료 코드 0입니다. 포맷·JS 구문·공백 검사 및 문서 로컬 링크 19개 검사도 통과했습니다. 이 수치는 이번 변경을 포함한 검사 결과이지 전체 차트나 전체 문서 구현 완료율이 아닙니다.

최종 `zig build test --summary all`은 5/5 단계·1,001/1,001 테스트, `zig build -Doptimize=ReleaseSafe --summary all`은 5/5 단계로 통과했습니다(종료 코드 0).
