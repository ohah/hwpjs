# EMF+ SetWorldTransform record

## 범위와 단일 출처

`src/image/emf/emf_plus_set_world_transform.zig`는 MS-EMFPLUS 2.3.9.6의 EmfPlusSetWorldTransform wire record를 소유합니다. Type `0x402A`, Size 36, DataSize와 실제 data 길이 24를 각각 검사하고 공용 `emf_plus_transform_matrix.zig`로 m11, m12, m21, m22, dx, dy를 읽습니다.

Flags는 사용되지 않고 SHOULD zero이지만 수신 시 MUST ignore이므로 16비트 원값을 보존하며 nonzero를 거부하거나 정규화하지 않습니다. 행렬 f32의 NaN, 무한대와 signed zero도 정규화하지 않습니다.

## 미지원 경계

반환값은 새 world transform의 wire 값만 표현합니다. 현재 graphics state의 행렬을 실제 교체하거나 Save/Restore snapshot 및 렌더링에 적용하는 기능은 구현하지 않았습니다. 로컬 HWP corpus에는 EMF+ signature 표본이 없어 실제 한컴 출력 동등성도 주장하지 않습니다.

## 검증 기록

ignored Flags와 여섯 행렬 원시 bit·wire 순서·특수 f32, 모든 payload 잘림, RecordType과 세 size 축, 공통 framing에는 유효하지만 전용 크기는 잘못된 stream, count overflow·comment rollback 및 실제 EMF framing을 검사합니다.

다음 다섯 관점으로 적대적으로 검증했습니다.

- 공식 Type `0x402A`, Size 36, DataSize 24와 실제 payload 길이를 독립적으로 위반했습니다.
- 여섯 matrix 필드의 little-endian 순서, signed zero·무한대·NaN payload bit가 보존되는지 확인했습니다.
- 사용되지 않는 Flags의 모든 bit가 거부·정규화되지 않고 원값으로 보존되는지 확인했습니다.
- stream routing, 전용 parser와 report count를 각각 무력화해 malformed record·framing·rollback 테스트가 검출하는지 확인했습니다.
- 실제 world matrix 교체와 graphics state replay를 wire parser 완료 범위로 과장하지 않는지 대조했습니다.

Type, Size, DataSize, data slice, Flags 보존, matrix 필드 순서, stream parser, stream count와 stream routing의 고유 의미 변이 9개를 Debug·ReleaseSafe·ReleaseFast에서 각각 실행했습니다. 컴파일 성공 후 테스트 실패 집계가 있는 실행만 인정한 최종 결과는 27/27 검출이며 생존·컴파일 오류·timeout은 0입니다. 변이별 복제본과 cache는 즉시 제거했고 27개 로그만 `/tmp/hwpjs-set-world-mutants-run`에 남겼습니다.

전체 `audit`는 세 모드에서 각각 40/40 단계와 1,820/1,820 테스트(native 1,781, chart 31, WMF 8)를 통과했습니다. HWP/WASM 검사는 각 모드 8,905,827회, import 위반 0이며 CFB 변이 12,000회에서 trap 0입니다. 로그는 `/tmp/hwpjs-emfplus-set-world-transform-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다.
