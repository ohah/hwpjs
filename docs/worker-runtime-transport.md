# Worker 전송 경계와 WASM 준비

core의 `./runtime` 진입점은 `createWorkerEditorRuntime`, `createWorkerRuntimeFactory`, `createWasmModuleLoader`를 제공합니다. 이 전송 계층은 파서 구현을 소유하지 않습니다. [구체 reader backend와 module Worker](reader-runtime-foundation.md)는 같은 계약의 별도 연결이며, WASM 배포 파일까지 포함한 웹 SDK 릴리스와 구분합니다. private source package에서 별도 module Worker URL/workerFactory와 WASM Module/loader를 주입할 수 있습니다. 앱 빌드·프레임워크 통합의 게시 범위는 별도입니다.

각 runtime은 독립 Worker 하나를 소유합니다. Worker 재사용은 거부하며 기존 소유자의 Worker를 종료하지 않습니다. Worker는 `initialize-runtime`에서 WASM Module을 받은 후 `{id,message}` envelope에 `{id,reply}` 또는 `{id,transportError}`로 응답해야 합니다. 적용 여부와 이력 메타데이터는 runtime 계약을 따릅니다. 이 adapter는 요청별 context를 호출 시 캡처해 응답 메타데이터와 결합합니다.

factory의 `preload()`는 컴파일만 준비하며 문서 Worker를 만들지 않습니다. 같은 factory는 컴파일 Promise를 재사용하되 문서별 Worker/메모리/이력을 공유하지 않습니다. 준비 실패는 캐시에서 제거해 다음 열기에서 재시도할 수 있습니다. 기본 loader는 WASM 버전/signature를 검사하고 SHA256 content hash로 컴파일을 재사용합니다. 같은 URL의 바이트가 바뀌면 다른 컴파일 identity가 됩니다.

요청 payload는 컴파일 대기 전에 복사하며 SharedArrayBuffer를 거부합니다. Worker 오류·messageerror·dispose는 대기 요청을 정리하고 해당 Worker를 종료합니다. 다른 runtime의 세션에는 영향을 주지 않습니다.

HWP5 현재 참조는 transport별 prefix를 initialize-runtime에서 Worker에 전달해 realm별 로컬 scope 충돌을 막습니다. [현재 참조의 scope·native epoch 계약과 브라우저 양성/취약 대조군](hwp5-sdk-current-references.md)을 따릅니다. 이 구분자는 보안 인증 수단이 아닙니다.

게시 전 별도 HEAD 사본에서 `node --test packages/core/tests/transport/worker-runtime.test.ts`8건, strict 선언 생성과 browser ESM 번들4모듈을 통과했습니다. 독립 Worker·preload 무Worker·준비 실패 재시도·재사용 거부·payload/context 소유·dispose/오류를 대역 Worker로 검증한 결과입니다. 실제 브라우저·문서 파싱·물리 IME·RN 검증으로 확대하지 않습니다.

## 그림 리소스 응답의 버퍼 소유권

`picture-bytes`와 `table-background-bytes`의 요청·응답 종류가 일치하고 오류가 없을 때, Worker는 내부 `ownObservation` 브랜드와 copy-on-access `bytes` getter를 확인합니다. getter가 만든 독립 사본을 wire 객체에 한 번 고정한 뒤 그 전체 `ArrayBuffer`만 transfer합니다. 숨겨진 응답 backing, 재사용 `Uint8Array`, WASM 메모리를 detach하지 않습니다. 브랜드가 없거나 오류·종류 불일치이면 기존 구조화 복제 경로를 유지하며 SharedArrayBuffer의 기존 거부 정책을 바꾸지 않습니다.

이 변경은 postMessage 경계의 바이트 복제 한 단계를 피하는 후보이며, Native 조회·refresh·그림 바이트 요청 수·이력 단위·core 소유 복사는 유지합니다. 관측된 요청 165건을 줄이는 변경이나 물리 zero-copy·입력 지연 해결로 해석하지 않습니다.

[정규 집중 명령](development-commands.md#worker-resource-transfer-tests)은 실제 Worker entry와 소유 DTO·그림 리소스 모듈을 controlled Node Worker에 연결합니다. ReaderRuntime은 대역이며 실제 Native·브라우저·성능 증거가 아닙니다. 공식 Worker 해시 재생성·런타임 권위·실 E2E는 별도 후속 gate이고, 현재 운영 union에는 이 후속 변경이 포함되지 않았습니다.
