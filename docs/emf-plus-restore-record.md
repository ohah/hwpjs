# EMF+ Restore record and graphics-state stack

## 범위와 단일 출처

`src/image/emf/emf_plus_restore.zig`는 MS-EMFPLUS 2.3.7.4의 EmfPlusRestore wire record를 소유합니다. Save와 Restore의 공통 Size 16/DataSize 4/StackIndex little-endian 배치는 `emf_plus_stack_index_record.zig`가 단일 출처이며 두 wrapper는 RecordType별 오류만 구분합니다.

Restore Flags는 사용되지 않고 SHOULD zero이지만 수신 시 MUST be ignored이므로 nonzero를 거부하지 않고 원값을 보존합니다. StackIndex는 u32 전 범위입니다. 공식 3.2.67.2 예제는 Flags `0x0000`, StackIndex `0x00000000`입니다. Save와 마찬가지로 명세 본문의 Size “number of records”는 고정값·공식 예제의 16바이트와 모순되므로 단위 오기로 처리합니다.

## 공유 stack과 소유권

`emf_plus_graphics_state_stack.zig`는 allocator-backed entry stack을 소유하고 Save와 Container 종류를 구분합니다. Microsoft [Graphics::Restore](https://learn.microsoft.com/en-us/windows/win32/api/gdiplusgraphics/nf-gdiplusgraphics-graphics-restore) 동작처럼 지정한 Save entry와 그 뒤에 쌓인 모든 Save/Container entry를 제거합니다. 같은 StackIndex가 중복되면 stack top에서 가장 가까운 같은 종류를 선택합니다. 다른 종류의 같은 값은 매칭하지 않습니다.

`emf_plus_stream.State.consumeTracked`는 comment 시작 시 stack을 복제하고 parser/report와 함께 성공한 경우에만 교체합니다. payload·missing target·후속 record·할당·집계 오류에서는 report와 stack이 모두 원복됩니다. `finishTracked`는 EOF 계약 뒤 남은 entry를 거부합니다. 실제 EMF `framing.validate`는 allocator를 이 tracked 경로에 전달합니다.

BeginContainer/BeginContainerNoParams/EndContainer는 같은 GDI+ stack을 공유하지만 아직 전용 parser가 없습니다. framing은 이 record를 현재 명시적으로 `UnsupportedEmfPlusGraphicsContainerState`로 거부하여 Save-only stack으로 잘못 성공하지 않습니다. 구조 조사용 `State.consume`은 allocation-free untracked API이고 Save/Restore 관계를 검증하지 않으므로 전체 EMF 검증에는 `framing.validate` 또는 tracked API를 사용해야 합니다.

## 검증 기록

합성 fixture는 StackIndex 0·1·비대칭 바이트·u32 최대값, 모든 Flags set, 공식 예제 값, 잘못된 RecordType, 독립 Size/DataSize/slice 불일치, 중첩 Save의 바깥 Restore가 이후 entry를 함께 제거하는 동작, kind 구분·중복·missing·unclosed, comment 후반 실패 rollback, container 명시 거부, 모든 stack/snapshot 할당 실패와 실제 EMF framing의 정상·missing·unclosed·container 경로를 검사합니다.

24개 의미 변이(공통 RecordType/Size/DataSize/slice/endian, Restore type·Flags·StackIndex, target-only pop, kind 무시, closure 무시, push 누락, max depth, clone 손실, stream 오라우팅·parser 우회·Save/Restore tracking 누락·container 허용, report 오집계·overflow·depth 손실, framing tracking·finish 우회)를 Debug·ReleaseSafe·ReleaseFast에서 독립 실행했습니다. 최초 캠페인의 컴파일 진단 3종과 생존 2종은 테스트를 보강하고 타입이 유효한 결함으로 교체한 뒤 전체 재실행했습니다. 최종 결과는 72/72 테스트 의미 실패이며 생존·무효·컴파일 오류·panic·timeout은 각각 0입니다. 로그는 `/tmp/hwpjs-emfplus-restore-mutants.SKaQmb`에 있습니다.

변경 소스를 고정한 뒤 Debug·ReleaseSafe·ReleaseFast 전체 `audit`를 순차 실행했습니다. 각 모드는 40/40 단계와 1,764/1,764 테스트(공통 native 1,725, 별도 chart 31, WMF 8), HWP/WASM 8,905,827회 검사와 imports 0을 통과했습니다. CFB 12,000 변이도 traps 0입니다. 로그는 `/tmp/hwpjs-emfplus-restore-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다.
