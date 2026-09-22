# EMF+ Cubic Bézier derivative와 flatness metric

## 범위와 책임

`src/image/emf/emf_plus_cubic_derivative.zig`는 [공용 cubic 표현과 parameter 검증](emf-plus-cubic-subdivision.md)을 사용해 parameter `t`의 1차 미분 벡터를 계산합니다. 세 control-edge 벡터를 quadratic Bézier로 평가한 뒤 3을 곱하며, parameter가 finite이고 `0 <= t <= 1`이라는 정책을 별도로 복제하지 않습니다.

```text
B'(t) = 3 * ((1-t)^2 * (P1-P0) + 2(1-t)t * (P2-P1) + t^2 * (P3-P2))
```

좌표의 NaN·Inf는 기존 [점 평가 계층](emf-plus-cubic-evaluation.md)과 마찬가지로 geometry 산술 결과에 남깁니다. 단, `t=0`은 `3(P1-P0)`, `t=1`은 `3(P3-P2)`만 직접 계산해 관계없는 edge의 `0*Inf`가 endpoint 결과를 NaN으로 오염시키지 않습니다. 미분 벡터가 0인 stationary point를 오류나 임의 방향으로 바꾸지 않습니다.

`src/image/emf/emf_plus_cubic_flatness.zig`는 tolerance를 받지 않고 start→end chord에 대한 두 control point의 최대 수직 거리 제곱만 반환합니다. 비교 가능한 metric이어야 하므로 네 점의 모든 좌표가 finite여야 하며, 아니면 `InvalidEmfPlusCubicCoordinate`입니다. f32 좌표는 차감 전에 f64로 넓혀 유한한 극단 좌표의 차이와 제곱이 f32에서 overflow하지 않게 합니다.

start와 end가 같은 degenerate chord에는 직선의 방향이 없으므로 두 control point에서 그 한 점까지의 거리 제곱 중 큰 값을 반환합니다. 일반 chord에는 `cross(chord, control-start)^2 / length(chord)^2`를 사용합니다. 제곱근이나 임의 epsilon을 적용하지 않습니다.

DrawBeziers device segment와 Path device Bézier는 각각 `tangentAt()`과 `maximumControlDistanceSquared()`에서 기존 canonical cubic adapter를 재사용합니다. Path의 point type·DashMode·PathMarker·CloseSubpath·figure start는 좌표 분석 입력에 포함하지 않습니다.

## 지원 경계

이 계층은 접선 벡터와 tolerance 독립 metric까지만 제공합니다. tangent 정규화, normal·curvature, tolerance의 단위/유효성, 종료 조건, 최대 깊이, adaptive subdivision·flattening, 길이·hit testing, stroke·fill·rasterization과 저장은 후속 책임입니다. metric이 tolerance 이하라는 사실만으로 실제 렌더러의 픽셀 오차나 한컴 출력 동등성을 주장하지 않습니다.

## 검증 기록

비대칭 cubic의 양 endpoint와 `t=1/4` 미분을 독립 Bernstein 결과와 대조하고, stationary endpoint·모든 parameter 경계·내부 비유한 좌표 산술을 검사합니다. 양 endpoint는 필요한 edge가 유한하고 나머지 두 점이 NaN·±Inf인 경우에도 독립 기대 벡터를 유지하는지 확인합니다. flatness는 비대칭 수평 chord, 역방향 동일성, 일직선 0, 두 control 역할이 각각 더 먼 degenerate chord, f32 최대 유한 좌표의 f64 계산과 네 점·두 축의 모든 위치에서 NaN·±Inf 거부를 검사합니다. DrawBeziers와 Path 공개 adapter 결과도 canonical 계산과 대조하며, Path에는 기존 공선 fixture 외에 비공선 control fixture를 둡니다.

적대적 검증은 parameter 검증·두 endpoint fast path, derivative의 inverse·세 edge·두 quadratic 1단계·최종 보간·x/y 배율, flatness의 전체 좌표 검증과 네 point 역할·x/y 축·chord 두 축·degenerate gate·두 control 역할·최대 선택·cross 부호·분모, DrawBeziers와 Path의 tangent/flatness adapter라는 31개 의미 변이를 각각 source-only 복사본에 적용했습니다. 변이·모드마다 새 local/global Zig cache를 사용한 Debug·ReleaseSafe·ReleaseFast 93/93회가 모두 기대 assertion으로 검출됐고 생존·compile error·panic은 없습니다. 최종 캠페인은 `/private/tmp/hwpjs-cubic-analysis-mutants.kbN8Q6`입니다. 선행 캠페인은 잘못된 치환기·테스트 필터, degenerate/Path 공선 fixture 편향과 endpoint의 관계없는 `0*Inf` 오염을 실제로 드러냈으나 완료 검증에서 제외하고, 이를 보정한 최종 캠페인만 결과로 사용했습니다.

endpoint 보정까지 소스와 테스트를 고정한 최종 Debug → ReleaseSafe → ReleaseFast 전체 audit는 모드별 40/40 단계·2,014/2,014 테스트(공통 native 1,975개, 차트 31개, WMF 8개)를 통과했습니다. 각 로그에서 HWP/WASM `checks=8,905,827`, `imports=0`, CFB `mutations=12,000`·`traps=0`을 한 번씩 확인했습니다. 최종 로그는 `/tmp/hwpjs-cubic-analysis-final2-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다. endpoint 수정 전 `final` 로그는 완료 근거에서 제외합니다. 이 결과는 현재 derivative·metric 계약의 근거이며 adaptive flattening이나 실제 한컴 렌더링 동등성의 근거가 아닙니다.
