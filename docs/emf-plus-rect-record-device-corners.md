# EMF+ rectangle records device-corner connection

## 범위와 단일 출처

rectangle을 직접 보유하는 drawing record는 [공용 RectData corner 계층](emf-plus-rect-device-corners.md)에만 위임합니다. `FillRects.deviceRectangles()`와 `DrawRects.deviceRectangles()`는 원래 RectArray의 allocation-free 순서 iterator를 device iterator로 감쌉니다. `FillEllipse.deviceCorners()`, `DrawEllipse.deviceCorners()`, `DrawArc.deviceCorners()`, `DrawPie.deviceCorners()`, `FillPie.deviceCorners()`는 자신이 파싱한 단일 RectData를 공용 mapper에 전달합니다.

각 record는 `x+width`, `y+height`, 정수→float 변환이나 world→page→device 산술을 복제하지 않습니다. wire parser의 C flag·크기·객체 참조 책임도 geometry 계층으로 옮기지 않습니다.

## 지원 경계

반환값은 rectangle의 transformed four-corner basis입니다. Draw/FillEllipse는 이를 [affine ellipse basis](emf-plus-ellipse-device-basis.md)로, DrawArc·Draw/FillPie는 [affine arc geometry](emf-plus-arc-device-geometry.md)로 조립합니다. Arc/Pie의 endpoint·radial edge, exact conic segment와 단일 parameter 평가는 각각 [point](emf-plus-arc-device-points.md), [segment](emf-plus-arc-device-segments.md), [평가](emf-plus-arc-segment-evaluation.md) 계층이 소유합니다. DrawRects/FillRects의 실제 stroke/fill, Pen/Brush, flattening, clipping, anti-aliasing, rasterization과 저장은 구현하지 않았습니다. 특히 회전·shear된 ellipse/arc를 axis-aligned device rectangle로 해석하지 않습니다. 로컬 지원 HWP corpus에는 EMF+ signature 표본이 없어 실제 한컴 출력 동등성을 주장하지 않습니다.

## 검증 기록

각 record의 기존 compressed parse fixture가 비대칭 device scale과 translation mapper를 공개 메서드에 전달하고 공용 mapper 결과와 대조합니다. RectArray 두 record는 두 원소의 순서와 종료까지 비교하며, 단일 RectData 다섯 record는 실제 parse 결과의 rectangle이 전달되는지 확인합니다.

적대적 검증은 FillRects·DrawRects의 device scale 축을 각각 교환하고 FillEllipse·DrawEllipse·DrawArc·DrawPie·FillPie가 자신의 rectangle 대신 영점 rectangle을 전달하도록 각각 손상시켰습니다. 변이별 새 local/global cache에서 Debug·ReleaseSafe·ReleaseFast 21/21회가 모두 assertion 실패로 검출됐고 생존·컴파일 오류·panic·timeout은 없습니다. 로그와 source diff는 `/tmp/hwpjs-rect-record-device-mutants.MbWW98`에 있습니다.

제품 트리를 고정한 뒤 전체 `audit`를 Debug·ReleaseSafe·ReleaseFast 순서로 실행했습니다. 세 모드 모두 40/40 단계와 1,980/1,980 테스트(native 1,941, chart ownership 31, WMF Contents 8)를 통과했습니다. 각 모드의 corpus 검사는 8,905,827 checks, WASM imports 0이었고 strict CFB mutation sweep는 12,000 mutations, traps 0이었습니다. 로그는 `/tmp/hwpjs-rect-record-device-final-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다.
