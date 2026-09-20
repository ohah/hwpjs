# EMF+ EndContainer record

## 범위와 단일 출처

`src/image/emf/emf_plus_end_container.zig`는 MS-EMFPLUS 2.3.7.3의 EmfPlusEndContainer wire record를 소유합니다. Type `0x4029`, Size 16, DataSize와 실제 data slice 4를 검사하고 little-endian u32 StackIndex 전 범위를 보존합니다.

Save·Restore·BeginContainerNoParams와 같은 고정 StackIndex payload이므로 크기와 endian 해석은 `emf_plus_stack_index_record.zig`만 소유하고 wrapper는 기대 RecordType과 외부 오류 이름만 구분합니다. Flags는 사용되지 않고 SHOULD zero이지만 수신 시 MUST be ignored이므로 nonzero를 거부하거나 정규화하지 않습니다. 공식 3.2.67.1 예제 전체 바이트 `29 40 00 00 10 00 00 00 04 00 00 00 01 00 00 00`을 Iterator부터 검증합니다. 예제 설명의 `PointData` 표현은 이 레코드에 없는 필드이므로 본문과 wire 배치를 우선합니다.

## 공유 stack과 미지원 경계

tracked stream은 StackIndex가 일치하는 가장 가까운 Container entry를 닫습니다. Microsoft GDI+의 공용 정보 블록 stack 의미에 따라 대상 BeginContainer와 그 이후에 쌓인 Save/Container entry를 모두 제거하며, 같은 숫자의 Save entry는 Container target으로 취급하지 않습니다. missing target, malformed payload, count overflow, 할당과 후속 record 실패에서는 report와 stack을 comment 단위로 함께 원복합니다. EOF에는 열린 Save/Container가 없어야 합니다.

두 Begin 레코드와 EndContainer의 wire 수명주기 검증은 구현됐습니다. 하지만 graphics-state snapshot의 실제 값, BeginContainer transform 적용, 중첩 clip/transform/quality 재생과 렌더링은 아직 구현하지 않았습니다. allocation-free `State.consume`은 구조 조사 API라 stack 관계를 검증하지 않으며 전체 EMF 검증에는 `framing.validate` 또는 tracked API를 사용해야 합니다. 로컬 HWP corpus에는 EMF+ signature 표본이 없어 실제 한컴 출력 동등성도 주장하지 않습니다.

## 검증 기록

공식 예제 전체 바이트와 합성 fixture로 StackIndex 0·1·비대칭 endian·u32 최대값, 모든 Flags set, RecordType과 세 size 축, 두 Begin 종류의 정상 중첩, 바깥 Container 종료가 이후 Save/Container를 함께 제거하는 동작, kind 구분, missing·malformed·count overflow 원자성, unclosed 상태, 모든 stack 할당 실패와 실제 EMF framing을 검사합니다.

15개 의미 변이(공용 parser RecordType 위임, 두 오류 변환, Flags·StackIndex 보존, stream routing·report·overflow·close kind/presence/index, stack target 포함 제거·kind 구분, framing tracked consume·finish)를 모드별 격리 cache와 120초 watchdog 아래 Debug·ReleaseSafe·ReleaseFast에서 실행했습니다. 최초 병렬 실행에서 한 변이가 메모리 압박으로 exit 137을 받아 결과에서 제외했습니다. 후반 record 실패 rollback 테스트를 보강한 최종 소스에서는 다섯 변이씩 실행해 45/45회가 assertion 또는 unhandled expected-error 의미 실패였습니다. 생존·컴파일 오류·panic·timeout은 각각 0입니다. 최종 로그는 `/tmp/hwpjs-end-postreview-mutant-*-{Debug,ReleaseSafe,ReleaseFast}.log`입니다.

변경 소스를 고정한 뒤 세 모드 전체 `audit`를 순차 실행했습니다. 적대적 리뷰에서 End 성공 뒤 같은 comment의 후반 record 실패가 stack/report를 원복하는 assertion을 추가한 후 세 모드를 모두 다시 실행했습니다. 최종 각 모드는 40/40 단계와 1,776/1,776 테스트(공통 native 1,737, chart 31, WMF 8), HWP/WASM 8,905,827 checks, imports 0을 통과했고 CFB 12,000 변이의 trap은 0입니다. 최종 로그는 `/tmp/hwpjs-emfplus-end-container-postreview-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다.
