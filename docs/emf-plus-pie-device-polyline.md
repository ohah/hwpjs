# EMF+ Pie device boundary polyline

## 책임과 경계

`src/image/emf/emf_plus_pie_device_polyline.zig`는 기존 [Pie 의미 boundary](emf-plus-pie-device-boundary.md)의 center→start와 end→center 방사선 사이에 [공용 Arc polyline](emf-plus-arc-device-polyline.md)을 연결합니다. Arc를 다시 계산하지 않고 시작/끝의 bitwise 연속성을 확인합니다. 결과는 `center, arc 시작, ... arc 끝, center` 순서이며 두 방사선까지 전역 point 한도에 포함합니다. zero sweep은 공용 Arc가 빈 배열이어도 `center, start, center` 세 점을 보존하고 ±360도는 양 끝이 같은 Arc와 두 방사선을 의미상 유지합니다.

`DrawPie.deviceBoundaryPolyline()`과 `FillPie.deviceBoundaryPolyline()`은 유효한 affine Arc에 한해 같은 collector를 호출합니다. 비유한/범위 밖 각도·비유한 방사선 좌표·한도 초과·불연속은 오류로 처리합니다. `Polyline` 소유권은 호출자에게 있으며, 실제 stroke/fill rule·Brush sampling·degenerate edge의 raster 처리·저장은 미구현입니다.

## 검증

양·음 200도와 ±360도에 대해 center, 시작, 끝, center 역할과 순서를 검사합니다. zero sweep의 세 점, 글로벌 budget과 잘못된 각도, 모든 할당 실패의 정리 경로를 검사합니다. DrawPie·FillPie의 wire fixture가 새 공개 API까지 도달하는지도 확인합니다.

방사선 역할 변이를 포함한 27/27회 의미 변이와 세 모드 전체 감사 결과는 [공용 평탄화 검증 기록](emf-plus-arc-segment-flattening.md)에 둡니다.
