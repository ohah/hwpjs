# EMF+ MultiplyWorldTransform record

## 범위와 단일 출처

`src/image/emf/emf_plus_multiply_world_transform.zig`는 MS-EMFPLUS 2.3.9.1의 EmfPlusMultiplyWorldTransform wire record를 소유합니다. Type `0x402C`, Size 36, DataSize와 실제 data 24를 각각 검사하고 공용 `emf_plus_transform_matrix.zig`로 m11, m12, m21, m22, dx, dy를 읽습니다.

A flag는 `0x2000`이며 set이면 post-multiply, clear이면 pre-multiply입니다. 같은 raw bit가 다른 record에서 Effect·CloseShape 의미로도 쓰이므로 `emf_plus_record_flags.zig`에 `post_multiply_mask`와 `isPostMultiply`라는 의미별 별칭을 두고 숫자만 공유합니다. 나머지 Flags는 reserved이며 MUST ignore이므로 원값을 보존합니다. 행렬 f32의 NaN·무한대·signed zero를 parser가 정규화하거나 실제 행렬 곱셈으로 바꾸지 않습니다.

## 미지원 경계

tracked stream은 [graphics state 계층](emf-plus-graphics-state.md)의 GDI+ row-vector 행렬 연산으로 현재 행렬에 pre/post multiplication하고 Save/Restore snapshot에 포함합니다. 다른 graphics 속성과 렌더링은 구현하지 않았으며 로컬 HWP corpus에는 EMF+ signature 표본이 없어 실제 한컴 출력 동등성도 주장하지 않습니다.

## 검증 기록

A clear/set와 모든 reserved flags, 여섯 행렬 원시 비트와 wire 순서, 특수 f32, 모든 payload 잘림, RecordType과 세 size 축, type별 크기는 틀리지만 공통 framing은 유효한 stream, count overflow·comment rollback 및 실제 EMF framing을 검사합니다.

적대적 검토는 (1) 공식 Type·크기·A mask, (2) endian·행렬 필드 순서·특수 f32, (3) reserved Flags 보존과 의미별 flag SSOT, (4) type parser 우회·stream rollback·framing, (5) 실제 행렬 재생과 wire parsing의 책임 경계라는 다섯 관점으로 반복했습니다. 최종 11개 의미 변이를 모드별 독립 source와 cache, 120초 watchdog 아래 Debug·ReleaseSafe·ReleaseFast에서 실행했습니다. `std.debug.assert` 자체 변경은 ReleaseFast 제품 의미 변이가 아니며 timeout 결과도 성과에서 제외했습니다. 최초 parser 우회 변이가 생존해 type별 malformed stream 회귀를 추가하고 다시 실행했습니다. 최종 33/33회가 assertion 또는 unhandled expected-error 의미 실패였고 생존·컴파일 오류·timeout은 0입니다. 유효 로그는 `/tmp/hwpjs-multiply-mutants-run`의 30개와 `/tmp/hwpjs-multiply-mutant-fix.Ar1fTF`의 보강 3개입니다.

변경 소스를 고정한 뒤 세 모드 전체 `audit`를 순차 실행했습니다. 각 모드는 40/40 단계와 1,796/1,796 테스트(공통 native 1,757, chart 31, WMF 8), HWP/WASM 8,905,827 checks, imports 0을 통과했고 CFB 12,000 변이의 trap은 0입니다. 로그는 `/tmp/hwpjs-emfplus-multiply-world-transform-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다.
