# EMF+ Pie device boundary polyline

## 책임과 경계

`src/image/emf/emf_plus_pie_device_polyline.zig`는 [Pie 의미 boundary](emf-plus-pie-device-boundary.md)와 같은 [방사 edge 계산](emf-plus-arc-device-points.md)·[Arc segment](emf-plus-arc-device-segments.md)를 사용하고 그 사이를 [공용 Arc polyline](emf-plus-arc-device-polyline.md)으로 연결합니다. 의미 boundary iterator 자체를 순회하지는 않습니다. Arc 곡선을 자체 재계산하지 않고 시작/끝의 bitwise 연속성을 확인합니다. 결과는 `center, arc 시작, ... arc 끝, center` 순서이며 두 방사선까지 전역 point 한도에 포함합니다. zero sweep은 Arc collector를 호출하지 않고 `center, start, center` 세 점을 보존하며 ±360도는 양 끝이 같은 Arc와 두 방사선을 의미상 유지합니다.

`DrawPie.deviceBoundaryPolyline()`과 `FillPie.deviceBoundaryPolyline()`은 유효한 affine Arc에 한해 같은 collector를 호출합니다. 직접 호출된 collector는 정규화된 `0 <= start < 360`, finite인 `|sweep| <= 360`, finite 방사선 좌표와 point 한도를 검사하고 불연속을 오류로 처리합니다. wire 각도 해석은 앞단 [Arc geometry](emf-plus-arc-device-geometry.md)가 소유합니다. `Polyline` 소유권은 호출자에게 있으며, 실제 stroke/fill rule·Brush sampling·degenerate edge의 raster 처리·저장은 미구현입니다.

## 검증

양·음 200도와 ±360도에 대해 center, 시작, 끝, center 역할과 순서를 검사합니다. zero sweep의 세 점, 글로벌 budget과 잘못된 각도, 모든 할당 실패의 정리 경로를 검사합니다. DrawPie·FillPie의 wire fixture가 새 공개 API까지 도달하는지도 확인합니다.

방사선 역할 변이를 포함한 27/27회 의미 변이와 세 모드 전체 감사 결과는 [공용 평탄화 검증 기록](emf-plus-arc-segment-flattening.md)에 둡니다.

2026-09-28에는 현재 radial·Arc collector 호출, zero sweep 별도 경로, 두 record 위임을 다시 대조했습니다. Debug·ReleaseSafe·ReleaseFast root `EMF+` 필터는 각 560/560, ReleaseSafe의 Pie polyline 직접 필터는 4/4와 DrawPie·FillPie 직접 필터는 각 4/4를 통과했습니다. 링크된 과거 변이·전체 `audit`는 이번에 재실행하지 않았습니다. 합성 geometry 검사는 실제 한컴 픽셀 동등성의 증거가 아닙니다.
