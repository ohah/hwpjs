# EMF+ Arc·Ellipse device polyline

## 책임과 경계

`src/image/emf/emf_plus_arc_device_polyline.zig`는 기존 [최대 90도 Arc segment iterator](emf-plus-arc-device-segments.md)를 [rational quadratic 평탄화](emf-plus-arc-segment-flattening.md)에 연결합니다. 인접 조각의 공유 endpoint는 bitwise로 확인하고 한 번만 저장합니다. 최대 point 수는 개별 조각이 아니라 결과 전체에 적용하며, 실패하면 이미 할당한 결과를 정리합니다. zero sweep은 빈 polyline을 반환하고 ±360도는 네 조각을 한 바퀴 연결합니다.

DrawArc의 `devicePolyline()`, DrawPie·FillPie의 `deviceArcPolyline()`, DrawEllipse·FillEllipse의 `devicePolyline()`은 공용 collector를 호출합니다. record는 기존 `deviceArc`/`deviceSegments`와 좌표 mapper를 재사용하며 곡선 수식이나 각도 정책을 다시 구현하지 않습니다. Pie의 두 방사선까지 포함한 선형 경계는 [별도 Pie polyline](emf-plus-pie-device-polyline.md)이 소유합니다. 실제 Pen stroke·Brush fill·clip·rasterization과 HWP 저장은 여전히 미구현입니다.

## 검증

비대칭 affine ellipse에서 양·음 200도, ±360도와 zero sweep의 순서·endpoint·공유 joint 개수를 검사합니다. 양·음 200도 곡선의 각 257개 타원 표본과 polyline 사이의 거리를 대조합니다. 전체 point 한도, 잘못된 각도, 불연속 source를 검사하며 다섯 record의 공개 연결은 각 record 테스트에서 실제 wire fixture를 파싱해 확인합니다. 로컬 지원 HWP corpus에 EMF+ signature 표본이 없어 실제 한컴 렌더링 동등성은 주장하지 않습니다.

공용 수식·출력 순서·joint·Pie 연결의 변이 검출과 전체 감사 수치는 [평탄화 검증 기록](emf-plus-arc-segment-flattening.md)에 둡니다.
