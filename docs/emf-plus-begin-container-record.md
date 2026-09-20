# EMF+ BeginContainer record

## 범위와 단일 출처

`src/image/emf/emf_plus_begin_container.zig`는 MS-EMFPLUS 2.3.7.1의 EmfPlusBeginContainer wire record를 소유합니다. Type `0x4027`, Size 48, DataSize와 실제 data slice 36을 독립 검사하고, 공용 `emf_plus_geometry.readRectF`로 DestRect와 SrcRect를 순서대로 읽은 뒤 little-endian u32 StackIndex를 보존합니다. RectF의 NaN·무한대·음수·signed zero를 parser가 임의 보정하지 않습니다.

Flags의 low byte는 공용 `UnitType` 0~6을 재사용하고 명세 도표에서 0으로 고정된 high byte는 거부합니다. World와 Display는 명세의 SHOULD NOT 값이지만 Windows가 수신 시 허용한다고 각주 28이 명시하므로 파싱은 성공시키고 `discouraged_page_unit`과 stream 경고 계수로 구분합니다. 이 값의 재생 결과는 정의하지 않습니다.

## 공유 stack과 미지원 경계

tracked stream은 유효 BeginContainer를 공용 graphics-state stack의 Container entry로 push합니다. 앞선 Save를 대상으로 하는 Restore는 Microsoft Restore 의미대로 그 Save와 이후 Container를 함께 제거할 수 있습니다. EOF에 남은 Container는 거부되며 parser·집계·할당·후속 record 실패 시 report와 stack을 comment 단위로 함께 원복합니다. allocation-free `State.consume`은 구조 조사 API라 stack 관계를 검사하지 않습니다.

전용 transform은 wire 값만 보존하며 graphics state snapshot 생성, DestRect/SrcRect 변환 적용과 렌더링은 아직 구현하지 않았습니다. BeginContainerNoParams와 EndContainer도 아직 전용 parser가 없으므로 tracked framing에서 명시적으로 거부합니다. 따라서 BeginContainer를 EndContainer로 정상 종료하는 경로는 다음 파트 전까지 지원 완료로 세지 않습니다. 로컬 HWP corpus에는 EMF+ signature 표본이 없어 실제 한컴 출력 동등성도 주장하지 않습니다.

## 검증 기록

합성 fixture는 UnitType 0~6, World/Display 경고, high-byte 고정 0, RectF 특수값과 순서, StackIndex 비대칭 endian·u32 최대값, RecordType과 세 size 축, stream 정상·경고·두 count overflow·malformed 원자성, 혼합 Save/Container/Restore, unclosed 상태와 실제 EMF framing을 검사합니다. 공식 문서에는 이 record 자체의 바이트 예제가 없어 합성 fixture를 공식 예제로 표기하지 않습니다.

17개 의미 변이(RecordType, Size/DataSize/slice, high-byte 고정값, PageUnit byte 선택·SHOULD 경고, DestRect/SrcRect 순서, StackIndex, Flags 보존, stream routing·두 checked count·경고 분기·stack kind/push/index)를 모드별 격리 cache와 120초 watchdog 아래 Debug·ReleaseSafe·ReleaseFast에서 실행했습니다. 최초 wrapping overflow 변이 2개는 Debug/ReleaseSafe panic으로 검출되어 최종 증거에서 제외하고, overflow를 잘못된 정상 오류로 반환하는 유효 결함으로 교체했습니다. 최종 51/51회가 assertion 또는 expected-error 의미 실패이며 생존·컴파일 오류·panic·timeout은 각각 0입니다. 개별 로그는 `/tmp/hwpjs-begin-mutant-*-{Debug,ReleaseSafe,ReleaseFast}.log`입니다.

변경 소스를 고정한 뒤 세 모드 전체 `audit`를 순차 실행했습니다. 각 모드는 40/40 단계와 1,768/1,768 테스트(공통 native 1,729, chart 31, WMF 8), HWP/WASM 8,905,827 checks, imports 0을 통과했고 CFB 12,000 변이의 trap은 0입니다. 로그는 `/tmp/hwpjs-emfplus-begin-container-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다.
