# EMF+ Arc endpoints and Pie radial edges

## 범위와 단일 출처

`src/image/emf/emf_plus_arc_device_points.zig`는 해석이 끝난 [affine arc geometry](emf-plus-arc-device-geometry.md)를 device-space 점과 Pie의 방사 선분으로 평가하는 단일 구현입니다. affine ellipse의 각도 `theta`에 대한 점은 다음 연산 순서를 사용합니다.

```text
radians = degrees * (f32(pi) / 180)
point = center + horizontal_radius * cos(radians)
               + vertical_radius   * sin(radians)
```

이 식은 0도에서 horizontal radius의 양의 방향으로 시작합니다. EMF+의 양수 sweep은 clockwise이며 기본 device 좌표의 아래쪽 양의 y축에서는 90도가 vertical radius의 양의 방향입니다. 회전·shear·축 반전은 두 radius vector에 이미 포함되므로 축 정렬 bounding box를 다시 만들지 않습니다.

`endpoints()`는 정규화된 start와 `(start + sweep) mod 360`을 평가합니다. 끝각을 감싸므로 ±360도 sweep은 시작점과 동일한 각도 입력을 사용합니다. sweep의 부호는 arc 순회 의미에 남아 있으며 endpoint만으로 방향을 대체하지 않습니다.

`pieRadialEdges()`는 boundary 순서에 맞춰 `center_to_start`와 `end_to_center`를 반환합니다. 0도 또는 ±360도 sweep에서도 두 의미 edge를 삭제하거나 합치지 않습니다. 실제 stroke/fill 계층이 degenerate·coincident edge를 처리해야 합니다.

DrawArc의 `deviceEndpoints()`와 DrawPie·FillPie의 `deviceRadialEdges()`는 각각 기존 `deviceArc()` 결과를 이 모듈에 전달합니다. 유효하지 않은 wire 각도로 `deviceArc()`가 실패하면 공개 helper도 `null`을 반환하며 각도 정책을 재구현하지 않습니다.

## 지원 경계

이 계층은 endpoint와 Pie radial edge의 device-space 의미 geometry를 제공합니다. 정확한 rational quadratic 곡선 표현은 [별도 segment 계층](emf-plus-arc-device-segments.md)이, Pie의 닫힌 의미 순서는 [boundary 계층](emf-plus-pie-device-boundary.md)이 재사용합니다. arc flattening, DrawArc/DrawPie stroke, FillPie fill 처리, Pen/Brush, clipping, anti-aliasing, rasterization과 저장은 미구현입니다. 로컬 지원 HWP corpus에는 EMF+ signature 표본이 없어 실제 한컴 픽셀 출력 동등성을 주장하지 않습니다.

## 검증 기록

합성 fixture는 회전·shear된 radius vector에서 0·90·180·270도, start/end 구분, 양·음 sweep 방향, 각도 wrap, ±360도 동일 endpoint, 0도 sweep의 coincident endpoint, 두 radial edge의 방향을 검사합니다. DrawArc·DrawPie·FillPie의 compressed record fixture는 공개 helper를 공용 evaluator 결과와 대조합니다.

적대적 검증은 cos/sin 교환, 라디안 divisor 변경, 네 affine radius 항 제거, sweep 제거·절댓값화, start/end 혼동, 두 radial edge 방향 반전, end edge의 start 오용, 세 record 공개 연결 단절이라는 16개 의미 변이를 변이별 새 local/global cache에서 Debug·ReleaseSafe·ReleaseFast로 실행했습니다. 최종 유효 48/48회가 모두 assertion 실패로 검출됐고 생존·컴파일 오류·panic은 없습니다.

최초 스크립트의 3회는 zsh scalar를 변이 배열로 잘못 사용해 소스가 바뀌지 않았으므로 캠페인에서 제외했습니다. 교정한 전체 캠페인의 DrawArc 연결 변이 3회는 기존 공개 fixture가 `-720`을 `-360`으로 clamp한 완전 회전이라 start/end 단절을 구별하지 못해 생존했습니다. 비완전 `-90` sweep 반례를 추가한 뒤 독립 재실행 3/3회가 assertion으로 검출됐습니다. 교정 전체 캠페인은 `/tmp/hwpjs-arc-points-mutants-corrected.J15jWG`, DrawArc 재검증은 `/tmp/hwpjs-arc-points-draw-arc-corrected.M4tl9e`에 있습니다.

최종 제품 트리의 전체 `audit`를 Debug·ReleaseSafe·ReleaseFast 순서로 실행했습니다. 세 모드 모두 40/40 단계와 1,989/1,989 테스트(native 1,950, chart ownership 31, WMF Contents 8)를 통과했습니다. 각 모드의 corpus 검사는 8,905,827 checks, WASM imports 0이었고 strict CFB mutation sweep는 12,000 mutations, traps 0이었습니다. 로그는 `/tmp/hwpjs-arc-device-points-final-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다.
