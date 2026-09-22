# EMF+ Cubic Bézier subdivision

## 범위와 단일 출처

`src/image/emf/emf_plus_cubic_de_casteljau.zig`는 cubic 네 점, parameter 검증과 여섯 de Casteljau 중간점을 소유합니다. [점 평가 계층](emf-plus-cubic-evaluation.md)은 최종점만 소비하고 `src/image/emf/emf_plus_cubic_subdivision.zig`는 같은 중간점을 좌·우 cubic으로 조립합니다. 보간식과 parameter 정책을 두 consumer가 복제하지 않습니다.

내부 parameter `0 < t < 1`에서 결과는 다음과 같습니다.

```text
left  = P0, P01, P012, P
right = P,  P123, P23, P3
```

두 결과는 동일하게 저장한 `P`를 접점으로 공유합니다. left의 local parameter `s`는 원곡선 `t*s`, right는 `t + (1-t)*s`와 같은 위치를 나타냅니다.

`t=0`은 start 네 점으로 collapsed된 left와 원본 right를, `t=1`은 원본 left와 end 네 점으로 collapsed된 right를 반환합니다. 이 fast path는 signed zero·NaN payload·Inf를 보간 산술에 통과시키지 않고 원비트로 보존합니다. 범위 밖 또는 비유한 parameter는 공용 검증의 `InvalidEmfPlusCubicParameter`입니다.

DrawBeziers device segment와 Path device Bézier의 `splitAt()`은 원래 네 좌표만 canonical cubic으로 투영합니다. Path의 point type·DashMode·PathMarker·CloseSubpath·figure start는 분할 geometry에 임의로 복제하지 않습니다.

## 지원 경계

이 계층은 parameter 하나에서 정확한 두 cubic을 만드는 데까지만 제공합니다. derivative와 tolerance 독립 flatness metric은 [별도 분석 계층](emf-plus-cubic-analysis.md)이, midpoint 반복과 한도는 [adaptive flattening 계층](emf-plus-cubic-flattening.md)이 담당합니다. 길이, hit testing, Pen stroke·dash·cap·join, clipping, anti-aliasing, rasterization과 저장은 미구현입니다. 로컬 지원 HWP corpus에는 EMF+ signature 표본이 없어 실제 한컴 픽셀 출력 동등성을 주장하지 않습니다.

## 검증 기록

비대칭 cubic을 `t=1/4`에서 나눈 뒤 두 결과의 local parameter 0·1/4·1/2·3/4·1을 원곡선의 대응 parameter와 대조하고 접합점의 bit-level 동일성을 검사합니다. `t=-0.0`과 1에서는 원본 cubic, collapsed 네 점, signed zero·비정규 NaN payload·±Inf를 좌표 비트로 비교합니다. 모든 범위 밖·비유한 parameter와 DrawBeziers·Path의 공개 `splitAt()` 접합도 검사합니다.

2026-09-22 적대적 검증은 parameter 유한성·하한·상한, `1-t`, 세 1단계점·두 2단계점·최종점, 두 endpoint fast path, 좌·우 결과의 여섯 control/end 배치와 DrawBeziers·Path adapter를 각각 훼손한 20개 변이를 Debug·ReleaseSafe·ReleaseFast에서 독립 실행했습니다. 매 변이·모드마다 source-only 복사본과 새 local/global Zig cache를 사용했으며 60/60이 기대 assertion으로 검출되고 compile error·panic 생존은 0건이었습니다. 최종 로그는 `/private/tmp/hwpjs-cubic-subdivision-mutants.Hs7uCW`입니다. 전체 저장소를 복제해 디스크가 고갈된 선행 캠페인은 완료되지 않아 결과에서 제외하고, 해당 임시 복사본은 제거했습니다.

소스와 테스트를 고정한 최종 Debug → ReleaseSafe → ReleaseFast 전체 audit는 모드별 40/40 단계·2,007/2,007 테스트(공통 native 1,968개, 차트 31개, WMF 8개)를 통과했습니다. 각 로그에서 HWP/WASM `checks=8,905,827`, `imports=0`, CFB `mutations=12,000`·`traps=0`을 한 번씩 확인했습니다. 로그는 `/tmp/hwpjs-cubic-subdivision-final-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다. 이 수치와 곡선 재매개변수화 검사는 현재 geometry 계약의 근거이며 adaptive flattening이나 실제 한컴 렌더링 동등성의 근거가 아닙니다.
