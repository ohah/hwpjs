# EMF+ RotateWorldTransform record

## 범위와 단일 출처

`src/image/emf/emf_plus_rotate_world_transform.zig`는 MS-EMFPLUS 2.3.9.3의 EmfPlusRotateWorldTransform wire record를 소유합니다. Type `0x402F`, Size 16, DataSize와 실제 data 길이 4를 각각 검사하고 degree 단위 `Angle`을 little-endian IEEE 754 binary32로 읽습니다.

A flag는 `0x2000`이며 set이면 post-multiply, clear이면 pre-multiply입니다. 공용 `emf_plus_record_flags.zig`의 의미별 `isPostMultiply` 해석을 재사용하고 나머지 reserved Flags 원값을 보존합니다. angle의 NaN, 무한대와 signed zero를 정규화하지 않습니다.

## 미지원 경계

반환값은 rotation wire 명령을 표현하고 tracked stream은 [graphics state 계층](emf-plus-graphics-state.md)에서 degree angle로 rotation matrix를 구성해 실제 pre/post multiplication하며 Save/Restore snapshot에 포함합니다. 다른 graphics 속성과 렌더링은 구현하지 않았으며 로컬 HWP corpus에는 EMF+ signature 표본이 없어 실제 한컴 출력 동등성도 주장하지 않습니다.

## 검증 기록

A clear/set와 reserved Flags, Angle 원시 float bit, 모든 payload 잘림, RecordType과 세 size 축, 공통 framing에는 유효하지만 전용 크기는 잘못된 stream, count overflow·comment rollback 및 실제 EMF framing을 검사합니다.

다음 다섯 관점으로 적대적으로 검증했습니다.

- 공식 Type `0x402F`, Size 16, DataSize 4와 실제 payload 길이를 독립적으로 위반했습니다.
- little-endian Angle과 signed zero·NaN payload bit가 보존되는지 확인했습니다.
- A bit의 pre/post 의미와 reserved Flags 원값 보존을 공용 flag SSOT에 대조했습니다.
- 전용 parser 호출을 제거하거나 report 증가를 무력화해 stream·framing·rollback 테스트가 각각 이를 검출하는지 확인했습니다.
- degree 값을 삼각함수나 rotation 행렬로 변환하는 replay 책임을 wire parser 완료 범위로 과장하지 않는지 대조했습니다.

Type, Size, DataSize, data slice, A flag, Angle bit, stream parser와 stream counter의 고유 의미 변이 8개를 Debug·ReleaseSafe·ReleaseFast에서 각각 실행했습니다. 컴파일 성공 후 테스트 실패 집계가 있는 실행만 인정했으며 최종 24/24회가 검출됐고 생존·컴파일 오류·timeout은 0입니다. 산출물은 복제본과 cache를 제거하고 24개 실행 로그만 남긴 `/tmp/hwpjs-rotate-mutants-run`입니다.

최초 전체 감사의 Debug 실행은 테스트가 끝났더라도 변이 복제본으로 디스크가 가득 차 로그 기록이 실패했으므로 결과에서 제외했습니다. 복제본·cache만 제거해 가용 공간을 복구한 뒤 세 모드를 처음부터 다시 실행했습니다. 유효한 전체 `audit`는 각 모드 40/40 단계와 1,812/1,812 테스트(native 1,773, chart 31, WMF 8)를 통과했습니다. HWP/WASM 검사는 각 모드 8,905,827회, import 위반 0이며 CFB 변이 12,000회에서 trap 0입니다. 로그는 `/tmp/hwpjs-emfplus-rotate-world-transform-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다.
