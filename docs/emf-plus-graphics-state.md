# EMF+ graphics state와 transform 재생

## 범위와 단일 출처

`src/image/emf/emf_plus_transform_matrix.zig`가 GDI+ row-vector affine 행렬의 identity, 곱셈, 이동, 배율, degree 회전을 소유합니다. `TransformMatrix.multiplied(operand, post_multiply)`는 A bit가 set이면 `current * operand`, clear이면 `operand * current`를 계산합니다. 각 record parser는 wire 검증과 필드 보존만 담당하고 이 산술을 복제하지 않습니다.

`src/image/emf/emf_plus_graphics_state_stack.zig`가 현재 `GraphicsState`와 Save/Container별 snapshot을 소유합니다. push는 현재 상태를 값으로 복사하고, Restore/EndContainer는 stack top에서 같은 kind와 StackIndex의 가장 가까운 entry를 찾아 그 snapshot을 복원한 뒤 target과 이후 entry를 제거합니다. clone은 entry와 현재 상태를 모두 복제하므로 `consumeTracked`의 comment 단위 실패는 report와 state를 함께 원복합니다.

tracked stream은 Set/Reset/Multiply/Translate/Scale/RotateWorldTransform을 현재 행렬에 적용하고 SetPageTransform을 별도 [page transform 상태](emf-plus-page-transform.md)에 적용합니다. 성공한 comment 이후 값을 `Report.world_transform`과 `Report.page_transform`에 노출합니다. allocation-free `State.consume`은 구조 조사 API이므로 두 값은 `null`이며 실제 EMF 검증은 tracked framing을 사용합니다.

## 지원 경계

현재 snapshot에는 world transform과 page transform이 포함됩니다. clip, rendering/compositing quality와 다른 graphics property는 아직 snapshot·재생하지 않습니다. BeginContainerNoParams는 현재 상태를 snapshot하고 [BeginContainer transform 계층](emf-plus-container-transform.md)은 지원 단위의 컨테이너 행렬을 적용합니다. 따라서 이 단계는 전체 GDI+ 재생이나 렌더링 완료를 뜻하지 않습니다.

wire parser는 NaN·무한대·signed zero를 그대로 보존합니다. tracked 산술은 IEEE-754 연산 결과를 따르며 특수값을 보정하지 않습니다. 로컬 HWP corpus에는 EMF+ signature 표본이 없어 실제 한컴 출력과의 픽셀 동등성도 주장하지 않습니다.

## 검증 계약

- 독립 행렬 테스트는 row-vector product, pre/post 비가환성, identity와 이동·배율·90도 회전 구성을 검사합니다.
- tracked stream 테스트는 여섯 world-transform record의 상태 연결, Save 후 변경과 Restore snapshot 복원, report 동기화를 검사합니다.
- 유효한 상태 변경 뒤 같은 comment의 잘린 record가 나오면 state/report가 모두 이전 값으로 돌아가는지 검사합니다.
- stack 테스트는 혼합 Save/Container와 target 이후 제거가 저장 시점의 world/page transform을 함께 복원하는지 검사합니다.

행렬 pre/post 반전, clone의 현재 상태 손실, push snapshot 손실, close 복원 손실, Translate/Scale stream 연결 교체, report 연결 손실의 7개 의미 변이를 독립 source 복사본과 mode별 cache, 120초 watchdog으로 Debug·ReleaseSafe·ReleaseFast에서 실행했습니다. 최초 ReleaseSafe 한 실행은 자원 종료(exit 137)라 검출로 세지 않고 해당 변이만 다시 실행했습니다. 최종 유효 결과는 21/21 테스트 의미 실패, 생존·컴파일 오류·timeout 0입니다. 로그는 `/tmp/hwpjs-world-transform-mutants`에 있습니다.

변경 소스를 고정한 뒤 전체 `audit`를 세 모드에서 순차 실행했습니다. 각 모드는 40/40 단계와 1,891/1,891 테스트(native 1,852, chart 31, WMF 8), HWP/WASM 8,905,827 checks, imports 0을 통과했고 CFB 12,000 변이의 trap은 0입니다. 로그는 `/tmp/hwpjs-emfplus-graphics-state-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다.
