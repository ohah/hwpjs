# EMF+ polyline device-space 선분

## 범위와 단일 출처

`src/image/emf/emf_plus_polyline_device_segments.zig`는 [공용 polyline topology](emf-plus-polyline-geometry.md)가 반환한 open/closed 선분의 두 endpoint를 [일반 world·page·device mapper](emf-plus-world-page-device.md)로 변환합니다. 상대좌표 누적과 정수/부동 표현은 [PointData resolver](emf-plus-point-resolution.md), 인접점·closing 순서는 topology 계층, world→page→device 산술은 mapper가 각각 소유합니다. 이 계층은 세 규칙을 복제하지 않고 allocation-free iterator로 연결합니다.

`resolved.Value`의 i64 정수 좌표를 f32로 바꾸는 경계는 `emf_plus_resolved_point_data.zig`의 `toPointF()` 한 곳으로 옮겼습니다. PointF는 원비트를 그대로 반환하며 정수는 Zig `@floatFromInt`의 f32 반올림을 따릅니다. [DrawImagePoints affine map](emf-plus-image-affine-map.md)도 같은 함수를 재사용합니다.

`DrawLines.deviceSegments()`는 기존 L 기반 `segments()`를, `FillPolygon.deviceSegments()`는 기존 강제 닫힘 `segments()`를 그대로 감쌉니다. 두 record가 닫힘 정책이나 좌표 변환을 다시 구현하지 않습니다. mapper는 unknown world/page를 사전에 거부한 `world_page_device.Mapper`이므로 iterator 도중 identity나 pixel 단위로 추정하지 않습니다.

## 원자성과 지원 경계

`Iterator.next()`는 source iterator의 임시 복사본에서 다음 topology 선분을 완성한 뒤 두 endpoint를 변환하고 성공 시에만 진행 상태를 교체합니다. borrowed PointR가 잘리면 source offset·remaining·누적 좌표와 device iterator 상태가 함께 유지됩니다. 종료와 closing segment도 원래 topology의 한 번만 반환하는 계약을 보존합니다.

이 계층은 DrawLines/FillPolygon의 선분 endpoint를 device 좌표로 만드는 범위입니다. clip geometry, Pen 폭·cap·join·dash, Brush fill rule·sampling, anti-aliasing, pixel offset, rasterization과 저장은 미구현입니다. Bézier는 [별도 device segment 계층](emf-plus-bezier-device-segments.md)이 command 역할을, cardinal spline은 [별도 device span 계층](emf-plus-cardinal-device-spans.md)이 통과점 topology를, Path는 [별도 device segment 계층](emf-plus-path-device-segments.md)이 Line·Bézier·closure와 metadata를 보존합니다. 이들을 polyline으로 강제 변환하지 않습니다. SetTSGraphics의 별도 WorldToDevice도 일반 mapper에 병합하지 않습니다. 로컬 지원 HWP corpus에는 EMF+ signature 표본이 없어 실제 한컴 픽셀 출력 동등성을 주장하지 않습니다.

## 검증 기록

합성 fixture는 PointR 누적, open/closed topology, 세 forward/closing endpoint, 비대칭 shear·translation world matrix, 비대칭 DPI/PageScale, DrawLines L와 FillPolygon 강제 닫힘 공개 연결, i64→f32 반올림, PointF signed-zero·NaN payload 보존과 borrowed 잘림 원자성을 검사합니다. 이미지 affine 회귀도 공용 변환 이동 뒤 별도로 세 모드에서 확인했습니다.

적대적 검증은 정수/PointF x·y 교환, unknown world/page 추정, device scale 축 교환, world 단계 제거, x/y scale 교환, world 입력 좌표 교환, segment start/end 교환, 진행 상태 미커밋, DrawLines L 단절, FillPolygon 닫힘 단절의 14개 의미 변이를 독립 복사본에 적용했습니다. 변이·모드별 local/global cache를 분리한 Debug·ReleaseSafe·ReleaseFast 42/42회가 모두 assertion 실패로 검출됐고 컴파일 오류·panic·timeout은 없습니다.

첫 실행에서 unknown 두 변이는 기존 world-page-device 테스트가 필터에 포함되지 않아 6회 생존했고, 두 record 닫힘 변이는 optional unwrap panic 6회, 진행 상태 변이는 Zig 컴파일 오류 3회로 종료됐습니다. 이 15회는 유효 검출에서 제외했습니다. 필터에 기존 mapper 검사를 포함하고 closing presence assertion을 추가했으며, 진행 상태를 값은 반환하되 source만 미커밋하는 변이로 교체해 다섯 변이를 새 복사본·cache에서 재실행했습니다. 최종 유효 42회는 최초 9종의 27회와 교정 5종의 15회입니다. 제품 작업 트리에는 변이를 적용하지 않았습니다.

변경 소스를 고정한 뒤 전체 audit를 순차 실행했습니다. Debug·ReleaseSafe·ReleaseFast가 각각 40/40 단계와 1958/1958 테스트(native 1919, chart ownership 31, WMF Contents 8)를 통과했습니다. 각 모드의 corpus 검사는 8,905,827 checks, imports 0이었고 strict CFB mutation sweep는 12,000 mutations, traps 0이었습니다. 로그는 `/tmp/hwpjs-device-polyline-final-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다.
