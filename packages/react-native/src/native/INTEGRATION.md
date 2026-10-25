# RN provider/controller and initial JSI boundary

2026-10-24. This slice preserves the existing Native Context C ABI. No existing
src/native, src/wasm, JS provider, core contracts, manifests/lock or build files
were modified. No package installation, app launch, simulator or WebView was used.

## Public interface implemented

`src/index.ts` exports createNativeProvider/createNativeProviderFromJsi,
createNativeRuntimeFactory, createNativeController/createNativeEditorController,
transport/controller types and explicit errors.

```ts
const provider = createNativeProviderFromJsi(platformBinding); // explicit injection
const controller = createNativeEditorController(provider);
await controller.editor.load(bytes, { format: 'hwp5' });
// A real native input view supplies commit/cancel hooks to the existing core lease.
const lease = controller.attachInputSurface(nativeInputHooks);
// Commands/save/history/listeners remain controller.editor's core implementation.
await controller.dispose();
```

No global module lookup or RN initialization runs at import. Missing binding or
unconfigured transport is `availability.status === 'unavailable'`; attempting
runtime creation/load rejects NativeBackendUnavailable. A supplied factory is
only `configured`, not certified available or device-proven. The transport must
handshake protocol hwpjs.editor-runtime/1, ABI 1 and projection shared-provider.
The low-level Context ABI alone does not satisfy this high-level handshake.

The adapter implements EditorRuntime and captures a fresh native transport per
candidate. Core retains its single FIFO/commands/selection/history/state authority.
An overlap guard rejects concurrent direct requests rather than adding a second
editor queue. Inputs/context are copied before the first await, replies are copied,
and supplied reply identity is checked against the captured request. Arbitrary
HostObjects, getters, cyclic payloads, callbacks and SharedArrayBuffer are refused.
No JS-visible pointer field or pointer-as-number type exists. Native tokens remain
bridge-bound in the native provider; the shared projection produces owned DTOs.

Transport adoption is exclusive and terminal even after dispose. dispose publishes
a synchronous fence, invokes transport.invalidate, drains active work, suppresses
late reply delivery and releases the transport once. Invalidation errors do not
skip release. Runtime/transport teardown failures remain visible. The actual native
transport must itself retain Context/output ownership through its running jobs;
this adapter does not free native memory or provide a native job executor.

The controller delegates all editor behavior to core. An external editor is never
disposed by its controller. Only createNativeEditorController owns its newly created
editor and synchronously fences it on dispose. Input composition settlement and
selection publication use the existing core InputSurfaceLease. There is no second
composition queue, document model, formatter or command router.

## Initial C++ JSI implementation and limits

`cpp/NativeJsiBinding.{h,cpp}` implements createNativeJsiBinding on the runtime
executor. It invokes the real hwp_native_abi_info function and checks compiled
header sizes before exposing ABI metadata. The only numeric fields are version,
sizes and pointer width; no native address is exposed. The binding accepts a shared
provider's NativeTransportCreator closure, which constructs the high-level JSI
transport wrapper. With no creator it reports unavailable and createTransport
throws NativeBackendUnavailable. Canvas/IME flags remain false.

A NativeRuntimeFence holds only atomic native data, no Runtime pointer or JSI value.
The platform owner invalidates before destroying the runtime/executor. The creator
must not retain unmanaged JSI values across shutdown and must schedule parse/save
on native serial work. This file does NOT implement that job queue, RN registration,
shared projection/transport, promise settlement registry, Skia drawing or native IME.
It is an actual JSI API implementation with syntax verification, not a runtime or
Canvas completion claim. There is no fallback editor.

## Verification

- `bun test packages/react-native/src/__tests__`: **20 passed**, fake transport and
  fake JSI injection only, using the real installed core public entry.
- The explicit `--preload ./packages/react-native/src/__tests__/core-source.preload.ts`
  variant resolves @hwpjs/core to real core source without installing peers; the
  19-test stage passed there. The preload changes resolution only, not core logic.
- `bun node_modules/typescript/bin/tsc --noEmit -p tsconfig.json`: **passed** after
  final TS edits. dispose rejection assertions normalize void|Promise with
  Promise.resolve; controller disposal itself always returns Promise<void>.
- C++20 -Wall -Wextra -Werror -fsyntax-only: **passed** on host macOS arm64,
  iOS arm64 target 15.1 using SDK 26.2, and Android arm64 API24 using installed NDK
  27.1.12297006. These are syntax compiles only: no Hermes/JSI library link, no C ABI
  archive link, no app run and no actual JSI engine invocation.
- Prior Context native host probes remain separate evidence (5 passed, including
  external C caller). The reported full native baseline 4677 pass/1 skip belongs
  to main's run and is not presented as new RN/JSI evidence here.

Tests cover missing backend, request/reply ownership including Buffer subclasses,
identity mutation/mismatch, one transport per runtime, invalid handshake cleanup,
concurrent call rejection, no enqueue after disposal, late response suppression,
reentrant/idempotent disposal, teardown failures, real core load/edit/save,
external editor preservation, lease remount and blocked composition settlement.

## Dependencies / platform integration for main

No RN peer is installed locally. Xcode/Apple clang 17 and iPhoneOS SDK 26.2 exist;
Android NDK 26.1.10909125 and 27.1.12297006 exist. An installed toolchain is not proof
that RN templates, Hermes, Gradle/CMake/Pods or native archives link.

For C++ syntax verification only, official MIT RN v0.83.1 headers and LICENSE were
fetched into ignored zig-out/verification/noori-current/jsi-headers/v0.83.1. They
are not vendored into package source or installed as dependencies:

- jsi/jsi.h SHA256 953891d786e1337c95b56bff8097924301679310db08acbf7e380e722299b554
- jsi/jsi-inl.h SHA256 f83628a773cafea537d311a6027879267e368cc30b44fba7f82be62b37545212
- source: https://github.com/facebook/react-native/tree/v0.83.1/packages/react-native/ReactCommon/jsi/jsi
- license: https://github.com/facebook/react-native/blob/v0.83.1/LICENSE

Earlier exact candidate matrix remains RN 0.83.1 / bundled Hermes tag
hermes-v0.14.0 / Skia @shopify/react-native-skia 2.14.0. RN peer React ^19.2.0 allows
main's React 19.3.1 within its declared range; this is peer-range compatibility,
not tested app linkage. Do not independently upgrade Hermes. Final pinning and
resolved transitive native license/NOTICE review remain main-owned. GPL/LGPL are
excluded. Do not silently substitute renamed Skia 3.x/Graphite or bundle system
fonts without redistribution rights.

Main must wire runtime-executor registration, actual shared-provider transport,
matching C ABI headers/archives, RN/Hermes/Skia peers and C++ native source packaging,
Podspec/Gradle/autolinking and release link tests. Exclude src/__tests__ (including
its resolution preload) from published declarations/artifacts. Keep the RN entry
external to core/web imports and keep the package build's NativeArtifactsRequired
gate: TS success or this source entry is not a native package release.

Future real gates: actual JSI transport calls into Context, cancellation and runtime
reload lifetime, Skia consuming common scene/shaping, iOS marked text, Android
composing spans, independent save oracles, release consumer app and real-device
E2E. They remain unexecuted and no capability is promoted by fake-provider tests.

## Follow-up: real Context JSI execution

The earlier syntax-only status above is historical. A subsequent focused slice
implements NativeContextJsi.cpp and product createNativeJsiContextBinding, exposes
createNativeContextPort with typed format-native packets, and executes them in a
real linked Hermes 0.14.0 host executable. Both formats passed **60 assertions**
plus actual engine shutdown with native work pending. See
`../../cpp/probe/VERIFICATION.md` and `PROTOCOL_INVENTORY.md` for exact provenance,
commands, hashes, packet inventory and the remaining shared projection boundary.
No fake-provider result was promoted to that execution evidence. Actual RN app,
Skia/IME and device support still require their own integration and validation.

## 2026-10-26 iOS 패키지 소스 소비 경로

`ios/HwpContextModule.mm`은 RN0.83의 실제 TurboModule 등록 시점에
`hwpNativeContextBinding`을 설치한다. Native serial queue와 RN CallInvoker를
사용하고 invalidate/dealloc에서 fence를 닫는다. 이 등록 코드는 fixture·저장 파일
도우미·진단 UIView를 포함하지 않는다. `examples/ios-context`가 별도 예제 모듈로
fixture와 파일 저장, UIKit 문단 표시를 제공한다.

`examples/ios-context/README.md`와 `scripts/run-ios-context.sh`는 제품 소스를
직접 소비하는 Simulator 재현 경로다. 의존성/빌드는 artifact에 격리하고 registry의
구 Rust core를 설치하지 않는다. namespace는 부모 통합 전 기존 alias를 유지한다.
설치 toolchain을 고치지 않는 Zig0.17 iOS overlay 생성기도 별도 스크립트로 둔다.

이 경로의 검증은 **저수준 format-native Context port** 대상이다. 위의 고수준
`createNativeProvider`에 필요한 shared-provider projection이나 전체 조판 Native
Canvas를 구현한 것으로 읽지 않는다. npm/release/autolink/Android/실기기 지원은
별도 gate다. 최신 실측 횟수와 실패·소스 지문·종료 증거는
`zig-out/verification/rn-package-integration/REPORT.md`를 따른다.

최종 wrapper gate는 후속 단일 실행에서 준비→빌드→실제 XCTest2/2→새 저장본 수집→
독립 oracle→소유 Simulator 종료까지 exit0으로 확인했다. 이전 실패 증거는 보존했다.
최신 재현 증거는 `zig-out/verification/rn-package-integration/final-wrapper-run/REPORT.md`다.
수동 소스 타깃 연결만 검증했으며 actual autolink/Podspec·release 지원 완료는 아니다.

## 2026-10-26 shared HeadlessEditor 최소 연결 prototype

`createNativeContextProvider(binding)` / `createNativeContextTransport(binding)`는
실제 Context JSI port를 기존 `createNativeRuntimeFactory` / `createEditor`에 연결한다.
공용 core의 StateToken·selection·FIFO·명령·snapshot·이력 관측을 그대로 사용한다.
JS는 원본 bytes·문서 캐시·writer·undo 모델을 유지하지 않는다. `enable` 입장 상태만
보유하며 enable 전에는 Native의 문단 관측을 읽기 전용으로 전달하고 쓰기를 거부한다.
텍스트/owner/문서 보호 판정은 Native가 생성한다.

이 연결에는 **additive Native snapshot 계약**이 필요하다. 공용 Native 실제 소스는
변경하지 않았으며 `zig-out/verification/rn-headless-provider/native-contract.patch`와
그 src 복사본에서만 prototype을 빌드했다. C++는 `HWPJS_NATIVE_SHARED_SNAPSHOT`
opt-in으로 새 `hwp_native_snapshot`을 사용한다. 기존 ABI 버퍼 복사·해제·busy guard를
재사용한다. 해당 macro/계약이 없는 binding은 `NativeSnapshotUnavailable`로 거부한다.
기본 archive·동결 umbrella tarball이 새 기능을 지원한다는 뜻은 아니다.

```ts
const provider = createNativeContextProvider(explicitNativeBinding);
const editor = provider.createEditor();
await editor.load(bytes, { format: 'hwpx' });
// read/setSelection/SPLICE_TEXT_COMMAND/undo/redo/save are the core public API.
await editor.dispose();
```

현재 Native snapshot은 `plain-body-v1`의 한정 projection이다. Native가 body 소유권과
identity 좌표를 증명하는 행만 편집 가능하다. 복합 조판/필드/표/머리말/앵커의 완전한
공용 display projection과 모든 형식·명령은 완료되지 않았다. UIKit 뷰는 진단이며
이번 iOS 화면은 검증 상태 표시다. 전체 문서 Canvas 조판·OS IME·autolink·release·
발행 지원을 주장하지 않는다. 실제 host/iOS·독립 저장 검사·실패와 버전 메타데이터는
`zig-out/verification/rn-headless-provider/REPORT.md`를 따른다. 다른 snapshot의 이전
검증 횟수와 합산하지 않는다.
