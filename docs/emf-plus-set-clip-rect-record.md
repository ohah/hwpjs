# EMF+ SetClipRect record

## 범위와 단일 출처

`src/image/emf/emf_plus_set_clip_rect.zig`는 MS-EMFPLUS 2.3.1.4의 EmfPlusSetClipRect wire record를 소유합니다. Type `0x4032`, Size 28, DataSize와 실제 data 길이 16을 각각 검사하고 ClipRect를 공용 `RectF`로 읽습니다.

`src/image/emf/emf_plus_combine_mode.zig`는 clipping record가 공유할 CombineMode 값 0~5의 단일 출처입니다. Flags의 bits 8~11만 CombineMode이며 나머지는 reserved/MUST ignore이므로 16비트 원값을 보존합니다. 유효하지 않은 6~15는 거부하고 RectF의 IEEE 754 bit pattern은 정규화하지 않습니다.

## stream 연결과 지원 경계

반환값은 rectangle과 논리 결합 wire 명령을 표현하고 tracked stream은 [보수적 clipping state](emf-plus-clip-state.md)에 적용합니다. operand geometry에 무관하게 증명되는 무한/공집합 항등식만 정확히 유지하고 나머지는 `complex`로 표시합니다. 당시 world/page transform을 적용한 device geometry와 실제 clipping mask·렌더링은 구현하지 않았습니다. 로컬 HWP corpus에는 EMF+ signature 표본이 없어 실제 한컴 출력 동등성도 주장하지 않습니다.

## 검증 기록

여섯 CombineMode와 나머지 모든 4비트 값, reserved Flags 보존, signed zero·무한대·NaN을 포함한 RectF 원시 bit, 모든 payload 잘림, RecordType과 세 size 축, 공통 framing에는 유효하지만 전용 크기는 잘못된 stream, count overflow·comment rollback 및 실제 EMF framing을 검사합니다.

다음 다섯 관점으로 적대적으로 검증했습니다.

- 공식 Type `0x4032`, Size 28, DataSize 16과 실제 payload 길이를 독립적으로 위반했습니다.
- Flags bits 8~11의 CM 위치, 여섯 CombineMode와 6~15 거부를 서로 분리해 확인했습니다.
- reserved Flags 원값과 RectF의 signed zero·무한대·NaN bit 및 x/y/width/height 순서가 보존되는지 확인했습니다.
- 전용 parser, stream routing과 checked count를 각각 무력화해 malformed record·framing·comment rollback 테스트가 검출하는지 확인했습니다.
- wire parser와 보수적 state replay를 분리하고 일반 geometry boolean을 지원 완료로 과장하지 않는지 대조했습니다.

Type, Size, DataSize, data slice, CM bit 위치, CombineMode 범위, Flags 보존, RectF 순서, stream parser, stream count와 stream routing의 고유 의미 변이 11개를 Debug·ReleaseSafe·ReleaseFast에서 각각 실행했습니다. 잘못된 enum 값을 직접 생성해 Debug safety panic으로 끝난 최초 범위 변이는 검출 수에서 제외하고, 6~15를 안전하게 Replace로 통과시키는 변이로 다시 실행했습니다. 컴파일 성공 후 테스트 실패 집계가 있는 실행만 인정한 최종 결과는 33/33 검출이며 생존·컴파일 오류·timeout은 0입니다. 변이별 복제본과 cache는 즉시 제거했고 최종 33개 로그만 `/tmp/hwpjs-set-clip-rect-mutants-run`에 남겼습니다.

전체 `audit`는 세 모드에서 각각 40/40 단계와 1,829/1,829 테스트(native 1,790, chart 31, WMF 8)를 통과했습니다. HWP/WASM 검사는 각 모드 8,905,827회, import 위반 0이며 CFB 변이 12,000회에서 trap 0입니다. 로그는 `/tmp/hwpjs-emfplus-set-clip-rect-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다.
