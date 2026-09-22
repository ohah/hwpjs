# EMF+ Cubic Bézier evaluation

## 범위와 단일 출처

`src/image/emf/emf_plus_cubic_evaluation.zig`는 device-space cubic Bézier 네 점을 단일 parameter에서 평가합니다. DrawBeziers의 [device segment](emf-plus-bezier-device-segments.md)와 Path의 [device segment](emf-plus-path-device-segments.md)는 각각 원래 역할·metadata를 보존한 채 네 좌표만 이 공용 evaluator에 전달합니다.

parameter는 finite이고 `0 <= t <= 1`이어야 하며, 아니면 `InvalidEmfPlusCubicParameter`입니다. 검증 뒤 `t=0`과 `t=1`은 저장된 start/end를 직접 반환하므로 signed zero와 NaN payload·Inf가 중간 산술로 바뀌지 않습니다. 내부 parameter는 다음 고정 de Casteljau 순서를 사용합니다.

```text
u = 1 - t
lerp(A, B) = u*A + t*B

P01  = lerp(P0, P1)
P12  = lerp(P1, P2)
P23  = lerp(P2, P3)
P012 = lerp(P01, P12)
P123 = lerp(P12, P23)
P    = lerp(P012, P123)
```

좌표의 NaN·Inf는 geometry 계층의 exceptional arithmetic 정책에 따라 임의로 거부하지 않습니다. Path의 point type, DashMode, PathMarker, CloseSubpath와 figure start는 점 평가 입력이 아니며 adapter가 삭제하거나 evaluator에 혼합하지 않습니다.

## 지원 경계

이 계층은 cubic 한 개의 단일 parameter 점만 계산합니다. derivative, curvature, subdivision·오차 한도, flattening, 길이, hit testing, Pen stroke·dash·cap·join, clipping, anti-aliasing, rasterization과 저장은 미구현입니다. 로컬 지원 HWP corpus에는 EMF+ signature 표본이 없어 실제 한컴 픽셀 출력 동등성을 주장하지 않습니다.

## 검증 기록

비대칭 cubic의 `t=1/4`를 독립 Bernstein 결과 `1.09375, 1.5625`와 대조하고, 대칭 fixture의 midpoint, 모든 parameter 경계·비유한 값, endpoint signed zero·NaN·±Inf를 검사합니다. DrawBeziers와 Path device fixture는 공개 `pointAt()`을 canonical evaluator 결과와 대조합니다.

적대적 검증은 parameter 유한성·하한·상한, 두 endpoint fast path, `1-t`, 첫째·둘째·셋째 1차 보간의 point 역할, 두 2차 보간의 역할, 최종 보간 weight, x·y 좌표 역할, DrawBeziers·Path adapter의 control 순서라는 16개 의미 변이를 변이별 새 local/global cache에서 Debug·ReleaseSafe·ReleaseFast로 실행했습니다. 48/48회가 모두 assertion 실패로 검출됐고 생존·컴파일 오류·panic·무변이는 없습니다. 최종 캠페인은 `/tmp/hwpjs-cubic-evaluation-mutants.GKzs3t`에 있습니다.

최종 전체 감사는 Debug·ReleaseSafe·ReleaseFast 각각 `40/40` 단계와 `2,004/2,004` 테스트(native 1,965, chart ownership 31, WMF Contents 8)를 통과했습니다. 각 모드에서 HWP5 감사 `8,905,827` checks·imports 0과 CFB 변이 `12,000`건·traps 0을 다시 확인했습니다. 로그는 `/tmp/hwpjs-cubic-evaluation-final-{Debug,ReleaseSafe,ReleaseFast}-audit.log`에 있습니다.
