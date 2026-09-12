# TextBlock 기반 클래스 본문

## 구현 계약

`chart/text_block_body.zig`가 VtTextBlock v2 타입부터 VtObject v1 기반 타입까지의 본문을 소유합니다. 새 readObservedV2는 별도 객체 ID를 읽거나 등록하지 않으며 호출자가 전달한 객체 사전으로 Font/String을 해석합니다. 실제 배치 근거는 [Axis 경계 조사](hwp5-chart-axis-evidence.md)와 [배율 본문 조사](hwp5-chart-value-text-evidence.md)입니다.

본문 String의 null과 길이 0인 String은 구분합니다. null이면 text=null, text_introduced=false이며 문자열 객체를 등록하거나 저장 바이트를 더하지 않습니다. 새 String과 재참조는 기존 객체 사전을 사용합니다. 합계 문자열 제한은 Font 이름과 본문 길이의 합이며 같은 String을 재참조해도 두 필드 길이를 셉니다. null 본문에서도 Font 이름 제한은 적용합니다.

prefix12·Font raw14·middle24·suffix26 및 Backdrop 원시는 복사하고 String 바이트는 호출자가 유지하는 입력을 빌립니다. 본문 자체는 해제할 할당을 소유하지 않습니다. 오류 시 입력 Reader 위치는 유지하지만 타입/객체 사전은 변경됐을 수 있으므로 호출자가 둘 다 폐기해야 합니다.

기존 `text_block.zig`는 inline ID 처리 후 같은 본문의 readRequired 경로를 사용합니다. 기존 Block 필드와 필수 text 계약, 레거시 null 보조 값 제한을 유지합니다. Options 정의는 본문 모듈에서 공유합니다. 레거시 중복 ID 판정은 꼬리 소비 전에 실행해 중복+잘림이 동시에 있는 경우의 오류 순서도 유지합니다.

## 현재 검증과 남은 작업

Debug·ReleaseSafe·ReleaseFast 각각 `zig test src/root.zig --test-filter 'chart text'`의 관련 **9/9 테스트**가 통과했습니다(루트 포함). 신규 본문 테스트는 null/새 String/재참조/빈 String, 정확한 객체·문자열 제한, raw 복사와 String 수명, 모든 잘림, 클래스/버전 오류, 비문자열 참조, 마지막 타입 오류를 검사합니다. 정상/오류 경로에 전체 OOM 주입과 safety=true 할당자의 해제 회계 검사를 수행했습니다.

기존 TextBlock 테스트에는 중복 ID와 꼬리 잘림을 동시에 넣어 기존 UnsupportedChartObjectReference 우선순위를 확인하는 회귀 입력을 추가했습니다.

`/tmp/hwpjs-text-body-mutants.XWK1s8`에서 null 허용 제거, 불필요한 ID 소비, 합계 제한에서 Font 길이 차감 누락, 빈 String을 null로 변경, 마지막 타입 검사 전 Reader 반영, raw prefix 삭제의 6종을 만들었습니다. 세 모드 각각 실제 런타임 FAIL과 종료 코드 1로 검출했습니다(18회). 컴파일 오류를 검출로 세지 않았습니다.

## 실제 WASM 대조

추가로 같은 변형 디렉터리에서 레거시 중복 판정을 꼬리 이후로 이동한 변형(precedence)과 객체 사전 해제를 제거한 변형(leak)을 세 모드로 확인했습니다. 전자는 기대 UnsupportedChartObjectReference 대신 UnexpectedEnd가 나와 TestExpectedEqual로 실패했습니다. 후자는 신규 본문 정상/오류 경로 테스트에서도 MemoryLeakDetected로 실패했습니다. 두 변형도 각 모드 종료 코드 1을 확인했으며, 앞선 6종과 합쳐 **8종 × 3모드 = 24회** 런타임 검출입니다.

테스트 전용 mode 319는 명시적으로 직렬화한 이전 타입/String/비문자열 ID 사전과 본문 바이트를 입력받습니다. 자동 차트 라우팅이나 공개 JS API가 아닙니다. 이전 숫자 값은 본문에서 String으로 재참조되지 않도록 Other로 등록합니다. 이 주입 사전만으로 모든 앞선 비문자열 객체의 전역 충돌을 검사했다고 주장하지 않습니다.

`chart-text-body-oracle.mjs`가 독립 Axis 관측 결과로 입력 사전과 기대 응답을 조립하고, `chart-text-bodies.mjs`가 corpus·변형·오류 검사를 소유합니다. 응답은 본문 상대 끝 위치, Font/String ID·길이·trailer·정의 여부, null 여부, 객체/저장 바이트 수, raw 필드·선택 Backdrop·문자열 바이트를 대조합니다. 제품 serializer로 기대 응답을 생성하지 않습니다.

Debug·ReleaseSafe·ReleaseFast 독립 WASM에서 43개 차트의 배율 본문 **69개(null 본문 66개)**를 대조했습니다. 각 모드에서 정상/변형 **345건**, 거부 **18,483건**을 확인했습니다. 모든 본문 잘림, 문자열/합계/객체/저장/입력 제한, 마지막 타입 오류, raw FF 변형, null↔Font 이름 재참조, 정확한 끝 이후 FF를 검사하며 거부 후 원본 결과도 다시 확인합니다. 재참조의 합계 제한도 검사합니다.

세 모드 모두 응답 첫 바이트 변조와 동일 오류 메시지의 WebAssembly.RuntimeError 치환을 실제로 주입해 테스트가 실패하는 것을 확인했습니다. trap을 정상 파서 오류로 집계하지 않습니다. 정규 audit에 mode 319 대조를 연결했습니다.

정규 Debug audit는 종료 코드 0, **27/27 steps, 1,035/1,035 native tests, 8,101,907 HWP/WASM checks**로 통과했습니다. 로그는 `/tmp/hwpjs-text-body-Debug-audit.log`입니다.

정규 ReleaseSafe audit도 종료 코드 0, **27/27 steps, 1,035/1,035 native tests, 8,101,907 HWP/WASM checks**로 통과했습니다. 로그는 `/tmp/hwpjs-text-body-ReleaseSafe-audit.log`입니다.

정규 ReleaseFast audit도 종료 코드 0, **27/27 steps, 1,035/1,035 native tests, 8,101,907 HWP/WASM checks**로 통과했습니다. 로그는 `/tmp/hwpjs-text-body-ReleaseFast-audit.log`입니다.

이번 단계는 TextBlock 기반 클래스 본문 지원입니다. 전체 파서 검증 완료를 뜻하지 않으며 Axis/ValueBlock의 제품 조립은 별도 후속 작업입니다.

전체 audit 이후 기본 `zig build test --summary all`도 1,035/1,035 tests, `zig build -Doptimize=ReleaseSafe --summary all`도 5/5 steps로 통과했습니다. 변경 Zig fmt·JS 구문·문서 링크·diff 공백 검사도 통과했습니다.
