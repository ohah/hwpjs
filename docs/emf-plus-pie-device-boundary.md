# EMF+ Pie device boundary

## 범위와 단일 출처

`src/image/emf/emf_plus_pie_device_boundary.zig`는 [Pie radial edge](emf-plus-arc-device-points.md)와 [exact Arc conic segment](emf-plus-arc-device-segments.md)를 닫힌 의미 경계 순서로 조립하는 allocation-free iterator입니다.

```text
center_to_start
arc segment 0..4
end_to_center
```

출력은 generic line/curve 배열이 아니라 `center_to_start`, `arc`, `end_to_center` 역할을 보존하는 tagged union입니다. radial 좌표, 각도 해석, conic 계산을 다시 구현하지 않습니다. iterator는 opening·arc·closing·done 상태만 소유하며 Arc iterator가 끝난 뒤에만 closing edge를 방출합니다.

0 또는 signed-zero sweep에서도 center→point와 point→center 두 radial 역할을 보존합니다. ±360도에서는 네 Arc segment 앞뒤에 동일 기하의 반대 방향 radial edge 두 개가 남습니다. 이 계층은 의미 boundary를 손실 없이 전달하며 coincident·degenerate edge 제거를 렌더러 대신 결정하지 않습니다.

DrawPie와 FillPie의 `deviceBoundary()`는 기존 `deviceArc()`가 성공한 경우에만 이 공용 iterator를 반환합니다. 두 record가 boundary 순서나 full/zero sweep 정책을 복제하지 않습니다.

## 지원 경계

이 계층은 Pie의 닫힌 device-space 의미 boundary까지 제공하고, boundary의 Arc 항목은 [공용 rational quadratic 평가 계층](emf-plus-arc-segment-evaluation.md)으로 점을 계산할 수 있습니다. [별도 Pie boundary polyline](emf-plus-pie-device-polyline.md)이 Arc를 선형 근사해 두 방사선과 연결합니다. DrawPie Pen stroke, FillPie fill rule·Brush sampling, coincident edge의 backend 처리, clipping, anti-aliasing, rasterization과 저장은 미구현입니다. 로컬 지원 HWP corpus에는 EMF+ signature 표본이 없어 실제 한컴 픽셀 출력 동등성을 주장하지 않습니다.

## 검증 기록

합성 fixture는 opening→Arc→closing 역할 순서와 모든 접점의 bit-level 연결, 음수 200도의 세 conic 순서, zero sweep의 두 radial 역할, full sweep의 네 conic과 coincident radial endpoint를 검사합니다. union tag는 field 접근 전에 assertion해 잘못된 역할이 panic으로 숨지 않게 합니다. DrawPie·FillPie의 compressed record fixture는 공개 helper의 첫 두 boundary 항목을 공용 builder와 대조하고 invalid angle의 null 전파를 검사합니다.

적대적 검증은 opening edge·tag 손상, Arc 전체 생략, Arc tag 손상, 첫 Arc 뒤 조기 closing, closing edge·tag 손상, closing 무한 반복, radial sweep 단절, Arc sweep 절댓값화, DrawPie·FillPie 공개 연결 단절이라는 12개 의미 변이를 변이별 새 local/global cache에서 Debug·ReleaseSafe·ReleaseFast로 실행했습니다. 최종 유효 36/36회가 모두 assertion 실패로 검출됐고 생존·panic은 없습니다.

최초 Arc tag 변이 3회는 계산 결과 capture를 소비하지 않아 컴파일 오류가 났으므로 제외했습니다. control weight를 소비한 뒤 tag만 바꾸는 동등 변이로 교체해 3/3회 assertion 검출했습니다. 기본 캠페인은 `/tmp/hwpjs-pie-boundary-mutants.yA2on8`, 교정 실행은 `/tmp/hwpjs-pie-boundary-arc-tag-corrected.MpVlvB`에 있습니다.

최종 제품 트리의 전체 `audit`를 Debug·ReleaseSafe·ReleaseFast 순서로 실행했습니다. 세 모드 모두 40/40 단계와 1,995/1,995 테스트(native 1,956, chart ownership 31, WMF Contents 8)를 통과했습니다. 각 모드의 corpus 검사는 8,905,827 checks, WASM imports 0이었고 strict CFB mutation sweep는 12,000 mutations, traps 0이었습니다. 로그는 `/tmp/hwpjs-pie-device-boundary-final-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다.
