# EMF+ cardinal device-space span

## 범위와 단일 출처

`src/image/emf/emf_plus_cardinal_device_spans.zig`는 [공용 cardinal span topology](emf-plus-cardinal-spans.md)가 반환한 `start`와 `end` 통과점을 [일반 world·page·device mapper](emf-plus-world-page-device.md)로 변환합니다. DrawCurve의 Offset·NumSegments 선택과 closed curve의 마지막→첫 연결은 topology 계층, PointR 누적과 정수/부동 표현은 [PointData resolver](emf-plus-point-resolution.md), world→page→device 산술은 mapper가 각각 소유합니다.

`DrawCurve.deviceSpans()`, `DrawClosedCurve.deviceSpans()`, `FillClosedCurve.deviceSpans()`는 각 record의 기존 `spans()`를 감쌉니다. record별 open/closed 정책이나 좌표 변환을 다시 구현하지 않습니다.

## 원자성과 지원 경계

`Iterator.next()`는 source iterator의 임시 복사본에서 완전한 span을 얻고 두 점을 모두 변환한 뒤에만 진행 상태를 교체합니다. Offset skip이나 borrowed PointR endpoint에서 오류가 나면 source offset·remaining·누적 좌표·첫 점·이전 점·남은 span 수가 함께 유지되며 오류를 EOF로 바꾸지 않습니다.

이 span은 cardinal spline이 통과하는 device-space endpoint 쌍이지 직선 출력이나 완성된 cubic curve가 아닙니다. Tension 기반 tangent/control point 계산, 수치 평가·flattening, clip, Pen stroke, fill rule, anti-aliasing, rasterization과 저장은 미구현입니다. SetTSGraphics의 별도 WorldToDevice도 일반 mapper에 병합하지 않습니다. 로컬 지원 HWP corpus에는 EMF+ signature 표본이 없어 실제 한컴 픽셀 출력 동등성을 주장하지 않습니다.

## 검증 기록

합성 fixture는 PointR 누적 뒤 열린 Offset 1·NumSegments 2 선택, 연결 endpoint, 닫힌 마지막→첫 span, 비대칭 shear·translation world matrix, 서로 다른 x/y page scale, 세 record의 공개 연결과 source 오류 원자성을 검사합니다. 공용 world-page-device와 resolved point 집중 검사도 세 모드에서 함께 실행했습니다.

적대적 검증은 start/end 오배치·교환, iterator 진행 상태 미커밋, source 오류를 EOF로 은폐, resolved 좌표 축 교환, world 단계 누락, device scale 축 교환, 닫힘 endpoint 손상, open Offset 무시, DrawCurve Offset·span 수 연결 손상, DrawClosedCurve·FillClosedCurve 닫힘 연결 손상의 14개 의미 변이를 독립 복사본에 적용했습니다. 변이·모드별 local/global cache를 분리한 Debug·ReleaseSafe·ReleaseFast 42/42회가 모두 assertion 실패로 검출됐고 panic·timeout은 없습니다.

최초 오류 상태 커밋 변이는 하위 cardinal iterator가 오류 시 이미 원자적이어서 미변경 상태를 다시 저장하는 의미상 동등 변이였고 3회 생존했습니다. 이 실행은 제외하고 source 오류를 EOF로 바꾸는 변이를 새 복사본·cache에서 실행해 세 모드 모두 검출했습니다. 첫 교정의 괄호 없는 `catch`/`orelse` 표현은 컴파일 오류 3회였으므로 제외했으며, 결합 순서를 명시한 동일 변이를 다시 실행했습니다. 제품 작업 트리에는 변이를 적용하지 않았습니다.

변경 소스를 고정한 뒤 전체 audit를 순차 실행했습니다. Debug·ReleaseSafe·ReleaseFast가 각각 40/40 단계와 1966/1966 테스트(native 1927, chart ownership 31, WMF Contents 8)를 통과했습니다. 각 모드의 corpus 검사는 8,905,827 checks, imports 0이었고 strict CFB mutation sweep는 12,000 mutations, traps 0이었습니다. 로그는 `/tmp/hwpjs-cardinal-device-final-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다.
