# EMF+ ResetClip record

## 범위와 단일 출처

`src/image/emf/emf_plus_reset_clip.zig`는 MS-EMFPLUS 2.3.1.2의 EmfPlusResetClip wire record를 소유합니다. Type `0x4031`, Size 12, DataSize와 실제 data 길이 0을 각각 검사합니다. Flags는 reserved/MUST ignore이므로 16비트 원값을 보존하며 nonzero를 거부하거나 정규화하지 않습니다.

## stream 연결과 지원 경계

반환값은 wire 명령만 표현하고 tracked stream은 [clipping state](emf-plus-clip-state.md)를 정확한 무한 영역으로 reset합니다. Save/Container snapshot에도 포함되지만 실제 clipping mask와 렌더링은 구현하지 않았습니다. 로컬 HWP corpus에는 EMF+ signature 표본이 없어 실제 한컴 출력 동등성도 주장하지 않습니다.

## 검증 기록

Flags 0과 모든 bit set, RecordType과 세 size 축, 공통 framing에는 유효하지만 전용 크기는 잘못된 stream, count overflow·comment rollback 및 실제 EMF framing을 검사합니다.

다음 다섯 관점으로 적대적으로 검증했습니다.

- 공식 Type `0x4031`, Size 12, DataSize 0과 실제 빈 payload 길이를 독립적으로 위반했습니다.
- reserved Flags의 모든 bit가 거부·정규화되지 않고 원값으로 보존되는지 확인했습니다.
- stream routing, 전용 parser와 report count를 각각 무력화해 malformed record·framing·rollback 테스트가 검출하는지 확인했습니다.
- empty record가 공통 framing 통과만으로 전용 payload 지원으로 오인되지 않는지 대조했습니다.
- wire parser와 infinity 상태 재생의 책임이 분리되는지 확인했습니다.

Type, Size, DataSize, data slice, Flags 보존, stream parser, stream count와 stream routing의 고유 의미 변이 8개를 Debug·ReleaseSafe·ReleaseFast에서 각각 실행했습니다. 컴파일 성공 후 테스트 실패 집계가 있는 실행만 인정한 최종 결과는 24/24 검출이며 생존·컴파일 오류·timeout은 0입니다. 변이별 복제본과 cache는 즉시 제거했고 24개 로그만 `/tmp/hwpjs-reset-clip-mutants-run`에 남겼습니다.

전체 `audit`는 세 모드에서 각각 40/40 단계와 1,824/1,824 테스트(native 1,785, chart 31, WMF 8)를 통과했습니다. HWP/WASM 검사는 각 모드 8,905,827회, import 위반 0이며 CFB 변이 12,000회에서 trap 0입니다. 로그는 `/tmp/hwpjs-emfplus-reset-clip-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다.
