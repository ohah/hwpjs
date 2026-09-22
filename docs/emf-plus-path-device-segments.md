# EMF+ Path device-space segment

## 범위와 단일 출처

`src/image/emf/emf_plus_path_device_segments.zig`는 [Path closing segment](emf-plus-path-segments.md)와 [Path fill boundary](emf-plus-path-fill-segments.md)가 반환한 공용 segment union을 [일반 world·page·device mapper](emf-plus-world-page-device.md)로 변환합니다. Line, cubic Bézier와 `close_figure` tag를 그대로 보존하며, Bézier의 `start`, `control1`, `control2`, `end`와 각 figure 시작점을 역할별로 변환합니다.

endpoint와 control point는 좌표만 `PointF`로 바꾸고 원래 `PathPointType`, DashMode, PathMarker, CloseSubpath와 RLE B 정보를 그대로 보존합니다. 좌표·point type·figure 문법·명시적/암묵적 닫힘은 기존 Path 계층, PointR 누적과 정수/부동 표현은 [PointData resolver](emf-plus-point-resolution.md), world→page→device 산술은 mapper가 각각 소유합니다.

generic device iterator 하나를 stroke용 `Path.segments()`와 fill용 `Path.fillSegments()`에 각각 구체화합니다. `Path.deviceSegments()`와 `Path.fillDeviceSegments()`는 이 두 기존 API를 감쌀 뿐 topology나 fill 닫힘 정책을 다시 구현하지 않습니다.

## 원자성과 지원 경계

`next()`는 source iterator의 임시 복사본에서 완전한 segment를 얻고 모든 역할을 변환한 뒤에만 진행 상태를 교체합니다. Move skip, PointR, point type, Bézier group이나 figure boundary에서 오류가 나면 command·closure·fill 상태를 포함한 source 전체가 유지되며 오류를 EOF로 바꾸지 않습니다.

이 계층은 Path segment의 device 좌표와 metadata까지 구현하고 Bézier 항목의 `pointAt()`·`splitAt()`·`tangentAt()`·`maximumControlDistanceSquared()`를 [공용 cubic evaluator](emf-plus-cubic-evaluation.md), [subdivision](emf-plus-cubic-subdivision.md), [분석 계층](emf-plus-cubic-analysis.md)에 위임합니다. adaptive flattening, DashMode 적용, marker 소비, Pen cap/join, alternate/winding fill, self-intersection, Brush sampling, clip boolean geometry, anti-aliasing, rasterization과 저장은 미구현입니다. Object Table은 아직 Path payload를 장기 소유하지 않으므로 DrawPath·FillPath record replay가 이 API를 자동 호출하지 않습니다. SetTSGraphics의 별도 WorldToDevice도 일반 mapper에 병합하지 않습니다. 로컬 지원 HWP corpus에는 EMF+ signature 표본이 없어 실제 한컴 픽셀 출력 동등성을 주장하지 않습니다.

## 검증 기록

합성 fixture는 Line·cubic Bézier·명시적 closure의 순서와 tag, 모든 좌표 역할과 figure start, DashMode·PathMarker·CloseSubpath metadata, 열린 fill figure의 암묵적 closure, 비대칭 translation/scale, source 오류 원자성과 `Path`의 stroke/fill 공개 연결을 검사합니다. 공용 world-page-device와 resolved point 집중 검사도 세 모드에서 함께 실행했습니다.

적대적 검증은 Line의 start/end/figure start, Bézier의 start/control1/control2/end/figure start, closure의 start/end 오배치, CloseSubpath·DashMode·RLE B metadata 손실, 진행 상태 미커밋, source 오류의 EOF 은폐, resolved 좌표 축 교환, world 단계 누락, stroke/fill 공개 API의 mapping 단절이라는 19개 의미 변이를 독립 복사본에 적용했습니다. 변이·모드별 local/global cache를 분리하고 실행 직후 캐시 복사본을 제거한 Debug·ReleaseSafe·ReleaseFast 57/57회가 모두 assertion 실패로 검출됐습니다. 최종 유효 실행에는 생존·컴파일 오류·panic·timeout이 없고 제품 작업 트리에는 변이를 적용하지 않았습니다.

최초 캠페인은 독립 캐시가 디스크 공간을 소진해 48회 뒤 중단됐고, Bézier endpoint 자동 치환 한 종은 Line 함수까지 잘못 바꿔 컴파일 오류가 났습니다. 이 실행 전체를 최종 집계에서 제외하고 endpoint 치환 범위를 고친 뒤, 변이별 임시 캐시를 즉시 삭제하는 새 루트에서 기본 18종 54회를 처음부터 재실행했습니다. 후속 RLE B 손실 변이는 optional 존재 단언이 없어 Debug·ReleaseSafe에서 panic, ReleaseFast에서 생존한 최초 3회를 제외하고 존재 단언을 추가한 새 복사본에서 세 모드 모두 assertion 실패로 검출했습니다. 유효 로그는 `/tmp/hwpjs-path-device-final-mutants.cSKC8H/logs`입니다.

변경 소스와 RLE metadata 단언을 고정한 뒤 전체 audit를 순차 재실행했습니다. Debug·ReleaseSafe·ReleaseFast가 각각 40/40 단계와 1970/1970 테스트(native 1931, chart ownership 31, WMF Contents 8)를 통과했습니다. 각 모드의 corpus 검사는 8,905,827 checks, imports 0이었고 strict CFB mutation sweep는 12,000 mutations, traps 0이었습니다. 로그는 `/tmp/hwpjs-path-device-final-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다.
