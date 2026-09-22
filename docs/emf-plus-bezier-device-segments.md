# EMF+ Bézier device-space segment

## 범위와 단일 출처

`src/image/emf/emf_plus_bezier_device_segments.zig`는 [연결 cubic Bézier topology](emf-plus-bezier-geometry.md)가 반환한 `start`, `control1`, `control2`, `end` 네 점을 [일반 world·page·device mapper](emf-plus-world-page-device.md)로 변환합니다. 점 역할·연결 endpoint는 topology 계층, PointR 누적과 정수/부동 표현은 [PointData resolver](emf-plus-point-resolution.md), world→page→device 산술은 mapper가 각각 소유합니다.

`world_page_device.Mapper.mapResolved()`가 `resolved.Value`를 `PointF`로 바꾸고 world/page/device 변환에 넣는 단일 경계입니다. Bézier와 [polyline device segment](emf-plus-polyline-device-segments.md)는 이 경로를 함께 사용하며 정수 변환이나 좌표 단계를 복제하지 않습니다. `DrawBeziers.deviceSegments()`도 기존 `segments()`를 감싸므로 record 계층이 topology를 다시 구현하지 않습니다.

## 원자성과 지원 경계

`Iterator.next()`는 source iterator의 임시 복사본에서 완전한 cubic segment를 얻고 네 점을 모두 변환한 뒤에만 진행 상태를 교체합니다. borrowed PointR가 control point나 endpoint 중간에서 잘리면 source offset·remaining·누적 좌표·공유 endpoint가 함께 유지됩니다.

이 계층은 DrawBeziers endpoint와 control point의 device 좌표까지만 만듭니다. Bézier 평가·flattening, clip, Pen 폭·cap·join·dash, anti-aliasing, rasterization과 저장은 미구현입니다. `EmfPlusPath`의 Bézier command는 별도 Path geometry이며 이 iterator에 합치지 않습니다. SetTSGraphics의 별도 WorldToDevice도 일반 mapper에 병합하지 않습니다. 로컬 지원 HWP corpus에는 EMF+ signature 표본이 없어 실제 한컴 픽셀 출력 동등성을 주장하지 않습니다.

## 검증 기록

합성 fixture는 두 개가 연결된 상대좌표 cubic segment, 네 역할과 공유 endpoint, 비대칭 shear·translation world matrix, 서로 다른 x/y page scale, DrawBeziers 공개 연결과 borrowed 그룹 중간 잘림 원자성을 검사합니다. 기존 polyline·resolved point·world-page-device 집중 검사도 함께 세 모드에서 실행해 공용 변환 경계 이동의 회귀를 확인했습니다.

적대적 검증은 정수/PointF x·y 교환, 공용 resolved 변환 생략·축 교환, 네 역할의 오배치·control 교환, 이전 segment 반복, 실패 시 상태 소비, mapper identity, DrawBeziers 공개 연결 단절의 14개 의미 변이를 독립 복사본에 적용했습니다. 변이·모드별 local/global cache를 분리한 Debug·ReleaseSafe·ReleaseFast 42/42회가 모두 assertion 실패로 검출됐고 컴파일 오류·panic·timeout은 없습니다. 최초 공개 연결 변이는 첫 점을 읽어 같은 값으로 다시 지정한 의미상 동등 변이라 3회 생존했고 유효 검출에서 제외했습니다. 실제 시작점을 `(0,0)`으로 바꾸는 변이를 새 복사본·cache에서 다시 실행해 세 모드 모두 검출했습니다. 제품 작업 트리에는 변이를 적용하지 않았습니다.

변경 소스를 고정하고 프로젝트 루트 `.zig-cache`를 제거한 뒤 전체 audit를 순차 실행했습니다. Debug·ReleaseSafe·ReleaseFast가 각각 40/40 단계와 1961/1961 테스트(native 1922, chart ownership 31, WMF Contents 8)를 통과했습니다. 각 모드의 corpus 검사는 8,905,827 checks, imports 0이었고 strict CFB mutation sweep는 12,000 mutations, traps 0이었습니다. 로그는 `/tmp/hwpjs-device-bezier-final-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다.
