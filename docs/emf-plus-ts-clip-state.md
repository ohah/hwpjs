# EMF+ terminal-server clip 상태

## 근거와 해석 경계

MS-EMFPLUS 2.3.8.1은 EmfPlusSetTSClip이 terminal server의 graphics device context에 clipping areas를 지정하며 `Rects`가 `NumRects`개의 clipping rectangle 배열이라고 정의합니다. 이 프로젝트는 그 배열을 새 terminal-server clip 상태로 교체합니다. `NumRects == 0`은 표현된 clipping area가 하나도 없는 상태이므로 추상 clip을 `empty`, 하나 이상이면 실제 union geometry를 아직 계산하지 않으므로 `complex`로 분류합니다. 이는 픽셀 렌더링 결과나 Windows 생성 동등성을 뜻하지 않습니다. 공식 Product Behavior에 따르면 Windows는 이 record를 생성하지 않습니다.

## 책임과 소유권

`src/image/emf/emf_plus_ts_clip_state.zig`만 빌린 delta rectangle view를 소유 `Rect` 배열로 물질화하고 clone/deinit합니다. wire marker·delta·크기 검증은 기존 `emf_plus_ts_clip_rects.zig`와 `emf_plus_set_ts_clip.zig`가 계속 소유하며 상태 계층은 이를 복제하지 않습니다.

`emf_plus_graphics_state_stack.zig`는 현재 상태와 각 Save/Container entry의 terminal-server 배열을 깊은 복사합니다. Restore/EndContainer, stack clone 실패, comment rollback과 deinit은 각 소유 복사본을 정확히 한 번 해제합니다. `Report.terminal_server_clip_rectangles`는 stack 메모리를 빌리지 않고 현재 rectangle 수만 값으로 노출하며, allocation-free `State.consume`에서는 `null`입니다.

ResetClip, SetClipRect, SetClipPath, SetClipRegion, OffsetClip이 뒤따르면 일반 clip 상태 전이가 적용되고 terminal-server 전용 exact 배열은 폐기됩니다. 일반 geometry boolean과 float offset을 integer rectangle 배열에 거짓으로 반영하지 않습니다.

## 미지원 경계

rectangle union geometry, world/page transform과의 좌표 결합, 실제 clipping mask와 rasterization은 구현하지 않습니다. 로컬 HWP corpus에는 EMF+ signature 표본이 없어 한컴 출력의 terminal-server record 사용이나 픽셀 동등성도 주장하지 않습니다.

## 검증 기록

두 rectangle 소유 복사와 독립 clone, 모든 할당 실패, Save/Restore, BeginContainerNoParams/EndContainer, 새 record의 기존 상태 교체, 0개·1개 분류, report 동기화, 후반 malformed record rollback, 다섯 일반 clip 전이의 exact 배열 폐기를 검사합니다. safety를 명시한 `DebugAllocator`의 `total_requested_bytes`로 전이 및 deep stack lifecycle의 해제량을 세 빌드 모드에서 검사합니다.

rectangle 물질화 오매핑, clone 오매핑, empty/nonempty 분류 반전, report 오집계, snapshot 누락, Reset/Rect/Opaque/Offset의 stale 배열 유지, 새 SetTSClip 교체 손실, 해제 누락의 유효 의미 변이 10종을 변이·모드별 새 cache에서 Debug·ReleaseSafe·ReleaseFast로 실행했습니다. 최종 30/30이 테스트 의미 실패로 검출됐습니다. 최초 해제 누락 변이는 ReleaseFast의 기본 testing allocator에서 살아남았으므로 결과에서 제외하고, safety=true 명시 회계를 추가한 뒤 세 모드 모두 `TestExpectedEqual`로 실패하는 대체 실행만 채택했습니다.

변경 소스를 고정한 뒤 세 모드 전체 `audit`를 순차 실행했습니다. 각 모드는 40/40 단계와 1,913/1,913 테스트(공통 native 1,874, chart 31, WMF 8), HWP/WASM 8,905,827 checks, imports 0을 통과했고 CFB 12,000 변이의 trap은 0입니다. 로그는 `/tmp/hwpjs-ts-clip-state-final-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다.
