# EMF+ SetClipPath record

## 범위와 단일 출처

`src/image/emf/emf_plus_set_clip_path.zig`는 MS-EMFPLUS 2.3.1.3의 EmfPlusSetClipPath wire record를 소유합니다. Type `0x4033`, Size 12, DataSize와 실제 data 길이 0을 각각 검사합니다.

Flags low byte의 ObjectID는 공용 `emf_plus_record_flags.zig`가 0~63 범위를 검사하고 bits 8~11의 CM은 `emf_plus_combine_mode.zig`가 CombineMode 0~5를 검사합니다. 상위 4비트는 reserved/MUST ignore이므로 Flags 16비트 원값을 보존합니다. stream은 해당 Object Table 슬롯이 이미 존재하고 ObjectTypePath인지 확인합니다.

## 미지원 경계

반환값은 Path 객체 참조와 논리 결합 연산의 wire 명령만 표현합니다. Path geometry는 기존 Path 객체 계층이 소유하며, 현재 clipping region에 실제 논리 연산을 적용하거나 graphics state snapshot 및 렌더링에 반영하는 기능은 구현하지 않았습니다. 로컬 HWP corpus에는 EMF+ signature 표본이 없어 실제 한컴 출력 동등성도 주장하지 않습니다.

## 검증 기록

ObjectID 0·63 및 64·255, 여섯 CombineMode와 6~15, reserved Flags 보존, RecordType과 세 size 축, Object Table 슬롯의 부재·타입 불일치, stream count overflow·comment rollback 및 실제 EMF framing을 검사합니다.

다음 다섯 관점으로 적대적으로 검증했습니다.

- 공식 Type `0x4033`, Size 12, DataSize 0과 실제 빈 payload 길이를 독립적으로 위반했습니다.
- Flags low byte의 ObjectID 0~63, bits 8~11의 여섯 CombineMode와 상위 reserved bit 보존을 서로 분리해 확인했습니다.
- parser를 통과한 정확한 Path ID로 Object Table을 조회하고 슬롯 부재와 Path 이외 타입을 구분하는지 확인했습니다.
- 전용 parser, stream routing과 checked count를 각각 무력화해 malformed record·framing·comment rollback 테스트가 검출하는지 확인했습니다.
- Path geometry 해석과 실제 clipping 논리 연산·graphics state replay를 이 wire parser의 완료 범위로 과장하지 않는지 대조했습니다.

Type, Size, DataSize, data slice, Flags 보존, CM bit 위치, CombineMode 범위, ObjectID 범위, stream routing, parser, lookup ID, 슬롯 부재, 타입과 count의 고유 의미 변이 14개를 Debug·ReleaseSafe·ReleaseFast에서 각각 실행했습니다. 최초 lookup 변이는 같은 문구의 DrawPath 조회를 잘못 바꾼 위치 편향이므로 폐기했고, SetClipPath parser 문맥을 포함해 다시 적용했습니다. 상수 lookup으로 `parsed`가 미사용되어 컴파일 오류가 난 시도도 제외하고 값을 소비하는 동일 의미 변이로 교체했습니다. 컴파일 성공 후 테스트 실패 집계가 있는 실행만 인정한 최종 결과는 42/42 검출이며 생존·컴파일 오류·timeout은 0입니다. 변이별 복제본과 cache는 즉시 제거했고 최종 42개 로그만 `/tmp/hwpjs-set-clip-path-mutants-run`에 남겼습니다.

전체 `audit`는 세 모드에서 각각 40/40 단계와 1,833/1,833 테스트(native 1,794, chart 31, WMF 8)를 통과했습니다. HWP/WASM 검사는 각 모드 8,905,827회, import 위반 0이며 CFB 변이 12,000회에서 trap 0입니다. 로그는 `/tmp/hwpjs-emfplus-set-clip-path-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다.
