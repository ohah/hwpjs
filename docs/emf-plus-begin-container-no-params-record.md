# EMF+ BeginContainerNoParams record

## 범위와 단일 출처

`src/image/emf/emf_plus_begin_container_no_params.zig`는 MS-EMFPLUS 2.3.7.2의 EmfPlusBeginContainerNoParams wire record를 소유합니다. Type `0x4028`, Size 16, DataSize와 실제 data slice 4를 검사하고 little-endian u32 StackIndex 전 범위를 보존합니다.

이 레코드는 Save·Restore와 같은 4바이트 StackIndex payload를 사용하므로 크기와 endian 해석은 `emf_plus_stack_index_record.zig`만 소유합니다. 각 wrapper는 기대 RecordType과 외부 오류 이름만 구분합니다. Flags는 사용되지 않고 SHOULD zero이지만 수신 시 MUST be ignored이므로 nonzero를 거부하거나 정규화하지 않고 u16 원값을 보존합니다. 공식 3.2.32.10 예제는 전체 바이트 `28 40 00 00 10 00 00 00 04 00 00 00 01 00 00 00`과 StackIndex 1을 제시합니다.

## 공유 stack과 미지원 경계

tracked stream은 유효 레코드를 공용 graphics-state stack의 Container entry로 push하고 checked count를 보고합니다. 앞선 Save를 Restore하면 그 뒤의 Container도 함께 제거됩니다. EOF에 남은 Container, malformed payload, count overflow, 할당 실패와 후속 record 실패는 기존 comment 원자성 계약을 따릅니다. allocation-free `State.consume`은 구조 조사 API이므로 stack 관계를 검증하지 않습니다.

[world transform snapshot](emf-plus-graphics-state.md)의 생성과 EndContainer 복원은 구현했습니다. clip·quality 등 나머지 graphics 속성의 snapshot과 렌더링은 구현하지 않았습니다. [EndContainer](emf-plus-end-container-record.md)는 같은 stack에서 이 레코드를 정상 종료하며 wire 수명주기를 검증합니다. 로컬 HWP corpus에는 EMF+ signature 표본이 없어 실제 한컴 출력 동등성도 주장하지 않습니다.

## 검증 기록

공식 예제 전체 바이트를 record Iterator부터 재현합니다. 합성 fixture는 StackIndex 0·1·비대칭 endian·u32 최대값, 모든 Flags set, 잘못된 RecordType, 독립 Size/DataSize/slice 불일치, stream count·overflow·malformed 원자성, Container kind/index/max depth, unclosed 상태, Save/Container/Restore 혼합, 모든 stack 할당 실패와 실제 EMF framing을 검사합니다.

12개 의미 변이(공용 parser의 RecordType 위임, 두 오류 변환, Flags·StackIndex 보존, stream routing·report 대상·overflow 오류·Container kind/push/index, 미지원 분기)를 모드별 격리 cache와 120초 watchdog 아래 Debug·ReleaseSafe·ReleaseFast에서 실행했습니다. 최초 push 변이 3개가 동일 문장의 앞선 BeginContainer 분기를 바꾼 위치 편향을 발견해 주변 count 문맥까지 고정하고 재실행했습니다. 최종 36/36회가 assertion 또는 expected-error 의미 실패이며 생존·컴파일 오류·panic·timeout은 각각 0입니다. 로그는 `/tmp/hwpjs-bcnp-final-mutant-*-{Debug,ReleaseSafe,ReleaseFast}.log`입니다.

변경 소스를 고정한 뒤 세 모드 전체 `audit`를 순차 실행했습니다. 각 모드는 40/40 단계와 1,773/1,773 테스트(공통 native 1,734, chart 31, WMF 8), HWP/WASM 8,905,827 checks, imports 0을 통과했고 CFB 12,000 변이의 trap은 0입니다. 로그는 `/tmp/hwpjs-emfplus-begin-container-no-params-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다.
