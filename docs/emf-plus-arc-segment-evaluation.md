# EMF+ Arc rational quadratic evaluation

## 범위와 단일 출처

`src/image/emf/emf_plus_arc_segment_evaluation.zig`는 [exact Arc conic segment](emf-plus-arc-device-segments.md)의 rational quadratic을 device-space 점 하나로 평가합니다. segment 생성·분할·각도 해석은 다시 구현하지 않습니다.

입력 검증 순서는 다음과 같습니다.

```text
parameter가 finite이고 0 <= t <= 1
control_weight가 finite이고 0 < w <= 1
```

Arc segment 생성기는 절댓값 90도 이하의 span만 만들므로 `w=cos(sweep/2)`는 이 범위에 있습니다. 임의로 조작한 segment의 0·음수·1 초과·비유한 weight는 `InvalidEmfPlusArcControlWeight`, 범위 밖·비유한 parameter는 `InvalidEmfPlusArcParameter`입니다. start/control/end 좌표의 NaN·Inf는 wire/geometry 계층의 exceptional arithmetic 정책에 따라 임의로 거부하지 않습니다.

검증 뒤 `t=0`과 `t=1`은 각각 저장된 start/end를 직접 반환합니다. 따라서 endpoint 좌표의 signed zero와 NaN payload·Inf가 중간 산술로 바뀌지 않습니다. 내부 parameter에서는 다음 고정 연산 순서를 사용합니다.

```text
u  = 1 - t
b0 = u * u
b1 = 2 * w * t * u
b2 = t * t
d  = b0 + b1 + b2
P  = (b0*start + b1*control + b2*end) / d
```

유효한 `t,w`에서는 denominator가 양수입니다. `start_degrees`와 `sweep_degrees`는 segment provenance이며 점 평가에 사용하지 않습니다.

## 지원 경계

이 계층은 단일 parameter의 점 평가만 제공합니다. 별도 [rational quadratic 평탄화](emf-plus-arc-segment-flattening.md)가 adaptive subdivision·device-space 오차/출력 한도를 소유합니다. derivative, curvature, 길이, hit testing, stroke/fill, clipping, anti-aliasing, rasterization과 저장은 미구현입니다. 로컬 지원 HWP corpus에는 EMF+ signature 표본이 없어 실제 한컴 픽셀 출력 동등성을 주장하지 않습니다.

## 검증 기록

생성된 affine 90도 conic의 start·midpoint·end를 ellipse point와 대조하고, 별도 비대칭 수동 segment의 `t=1/4`를 정확한 `14/13, 12/13` 기준과 비교합니다. metadata를 NaN/Inf로 둬도 평가에 관여하지 않는지, parameter와 weight의 각 경계·비유한 값, endpoint의 signed zero·NaN·±Inf 비트 보존을 검사합니다.

적대적 검증은 parameter의 유한성·하한·상한, weight의 유한성·0 거부·상한, 두 endpoint fast path, `1-t`, start/control/end basis, control의 2와 weight, homogeneous denominator, x end·y control 역할, x denominator 나눗셈, metadata 비관여라는 18개 의미 변이를 변이별 새 local/global cache에서 Debug·ReleaseSafe·ReleaseFast로 실행했습니다. 54/54회가 모두 assertion 실패로 검출됐고 생존·컴파일 오류·panic·무변이는 없습니다. 캠페인은 `/tmp/hwpjs-arc-evaluation-mutants.82KTxC`에 있습니다.

최종 전체 감사는 Debug·ReleaseSafe·ReleaseFast 각각 `40/40` 단계와 `1,999/1,999` 테스트를 통과했습니다. 각 모드에서 HWP5 감사 `8,905,827` checks·imports 0과 CFB 변이 `12,000`건·traps 0을 다시 확인했습니다. 로그는 `/tmp/hwpjs-arc-segment-evaluation-final-{Debug,ReleaseSafe,ReleaseFast}-audit.log`에 있습니다.
