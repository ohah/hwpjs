# EMF+ ResetWorldTransform record

## 범위와 단일 출처

`src/image/emf/emf_plus_reset_world_transform.zig`는 MS-EMFPLUS 2.3.9.2의 EmfPlusResetWorldTransform wire record를 소유합니다. Type `0x402B`, Size 12, DataSize와 실제 data 길이 0을 각각 검사합니다. Flags는 사용되지 않고 SHOULD zero이지만 수신 시 MUST ignore이므로 16비트 원값을 보존하며 nonzero를 거부하거나 정규화하지 않습니다.

## 미지원 경계

반환값은 reset 명령의 wire 존재를 표현하고 tracked stream은 [graphics state 계층](emf-plus-graphics-state.md)에서 현재 행렬을 identity로 바꿉니다. Save/Restore의 world-transform snapshot도 지원합니다. 다른 graphics 속성과 렌더링은 구현하지 않았으며 로컬 HWP corpus에는 EMF+ signature 표본이 없어 실제 한컴 출력 동등성도 주장하지 않습니다.

## 검증 기록

다음 다섯 관점으로 적대적으로 검증했습니다.

- 공식 Type `0x402B`와 빈 payload의 Size 12/DataSize 0 계약을 서로 독립적으로 위반했습니다.
- 무시해야 하는 Flags의 0, 단일 bit, 상위 bit와 모든 bit set가 거부·정규화되지 않고 보존되는지 확인했습니다.
- 공통 framing에는 유효하지만 ResetWorldTransform에는 잘못된 Size 16/DataSize 4 record가 전용 parser를 우회하지 못하고 comment 전체 상태를 rollback하는지 확인했습니다.
- report count overflow가 부분 상태를 남기지 않는지와 실제 EMF comment framing에서 전용 count로 연결되는지 확인했습니다.
- wire parser가 identity 행렬 적용, Save/Restore snapshot 또는 렌더링 완료를 과장하지 않는지 지원 경계를 다시 대조했습니다.

Type, Size, DataSize, data slice, Flags 보존, stream parser 호출과 stream counter의 고유 변이 7개를 Debug·ReleaseSafe·ReleaseFast에서 각각 실행해 총 21/21을 검출했습니다. 집중 변이 산출물은 `/tmp/hwpjs-reset-transform-mutants-run`에 남겼습니다.

전체 `audit`도 세 모드에서 각각 40/40 단계와 1,800/1,800 테스트(native 1,761, chart 31, WMF 8)를 통과했습니다. HWP/WASM 검사는 각 모드 8,905,827회, import 위반 0이며 CFB 변이 12,000회에서 trap 0입니다. 로그는 `/tmp/hwpjs-emfplus-reset-world-transform-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다.
