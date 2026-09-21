# EMF+ Save record

## 범위와 단일 출처

`src/image/emf/emf_plus_save.zig`는 MS-EMFPLUS 2.3.7.5의 EmfPlusSave wire record를 소유합니다. Type은 `0x4025`, Size는 정확히 16, DataSize와 실제 data slice는 4여야 하며 StackIndex는 little-endian u32 전 범위를 보존합니다. Save와 Restore의 동일 wire layout은 `emf_plus_stack_index_record.zig`가 단일 출처입니다.

Flags는 사용되지 않고 SHOULD zero이지만 수신 시 MUST be ignored이므로 nonzero를 거부하지 않고 원값을 보존합니다. 공식 3.2.32.7 예제는 Flags `0x0000`, StackIndex `0x00000000`입니다. 명세의 Size 설명에 “number of records”라고 적힌 부분은 바로 뒤의 고정값과 공식 예제가 16바이트를 명시하므로 단위 오기로 기록하고 wire 값 16바이트를 적용합니다.

## stream 연결과 미지원 경계

`emf_plus_stream.zig`는 전용 parser를 호출한 뒤 구조적으로 유효한 Save 수를 checked 집계합니다. payload·집계 오류는 comment 전체 상태를 원복하고 실제 EMF framing도 같은 경로를 사용합니다.

후속 [Restore와 graphics-state stack](emf-plus-restore-record.md)은 Save entry에 현재 world/page transform, [보수적 clip state](emf-plus-clip-state.md)와 [여덟 graphics property](emf-plus-property-state.md)를 저장하고 Restore target과 그 이후 entry를 함께 제거하면서 저장 시점 상태를 복원합니다. [BeginContainer](emf-plus-begin-container-record.md)와 [BeginContainerNoParams](emf-plus-begin-container-no-params-record.md)도 같은 stack에 연결되어 Restore가 뒤따른 Container를 함께 제거합니다. comment 단위 원자적 rollback과 EOF의 unmatched entry 거부도 tracked framing에 연결했습니다. 실제 graphics 렌더링은 아직 구현하지 않았습니다.

## 검증 기록

합성 fixture는 StackIndex 0·1·비대칭 바이트·u32 최대값, 모든 Flags set, 공식 예제 값, 잘못된 RecordType, 독립 Size/DataSize/slice 불일치, stream 정상·payload 오류·count overflow 원자성과 실제 EMF framing 연결을 검사합니다.

12개 의미 변이(RecordType, Size/DataSize/slice, endian, StackIndex 상수화, Flags 원값 손실, reserved 거부, stream 오라우팅, parser 우회, report 오집계, wrapping overflow)를 Debug·ReleaseSafe·ReleaseFast에서 독립 실행했습니다. 총 36/36을 테스트 의미 실패로 검출했고 생존·무효·컴파일 오류·panic·timeout은 각각 0입니다. 로그는 `/tmp/hwpjs-emfplus-save-mutants.2Ztk1Y`에 있습니다.

변경 소스를 고정한 뒤 Debug·ReleaseSafe·ReleaseFast 전체 `audit`를 순차 실행했습니다. 각 모드는 40/40 단계와 1,755/1,755 테스트(공통 native 1,716, 별도 chart 31, WMF 8), HWP/WASM 8,905,827회 검사와 imports 0을 통과했습니다. CFB 12,000 변이도 traps 0입니다. 로그는 `/tmp/hwpjs-emfplus-save-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다.
