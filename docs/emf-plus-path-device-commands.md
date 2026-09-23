# EMF+ Path device-space command

## 범위와 단일 출처

`src/image/emf/emf_plus_path_device_commands.zig`는 [Path command 계층](emf-plus-path-geometry.md)의 `move_to`·`line_to`·`bezier_to`를 [일반 world·page·device mapper](emf-plus-world-page-device.md)로 변환합니다. 좌표만 `PointF`로 바꾸고 원래 `PathPointType`, DashMode, PathMarker, CloseSubpath, RLE B와 figure start를 보존합니다. `Path.deviceCommands()`는 기존 `Path.commands()`를 이 iterator에 연결할 뿐 wire·PointR·figure 문법을 다시 해석하지 않습니다.

device `TypedPoint`·`Line`·`Bezier`와 역할별 mapping은 이 모듈이 단일 출처입니다. [Path device segment 계층](emf-plus-path-device-segments.md)도 같은 타입과 `mapLine()`·`mapBezier()`를 재사용하므로 command와 segment의 좌표 계약이 따로 변하지 않습니다. device `Bezier`는 기존 cubic evaluator·subdivision·derivative·flatness·flattening에 위임합니다.

`TypedPoint`·`Line`·`Bezier`의 `sourcePointCount()`는 Move·Line이 각각 source point 1개를, cubic Bézier가 control1·control2·endpoint 3개를 소비한다는 역할별 계약의 단일 출처이고 `Command`가 이를 dispatch합니다. 세 역할의 `closesFigure()`도 Move 자체 또는 Line/Bézier endpoint의 CloseSubpath 판정을 소유합니다. [figure geometry 계층](emf-plus-path-device-geometry.md)은 point range와 닫힘을 조립할 때 이 값을 재사용하고 마법 숫자나 flag 접근을 복제하지 않습니다.

## command와 원자성 계약

`move_to`를 실제 결과로 반환하므로 drawable segment가 없는 figure와 Start 자체의 PathMarker·CloseSubpath도 손실되지 않습니다. Line과 Bézier는 start·endpoint·control point·figure start 역할을 유지합니다. 명시적 closing edge를 추가하거나 fill의 열린 figure를 닫는 정책은 segment 계층의 책임입니다.

`next()`는 source command iterator를 값으로 복사해 완전한 command를 얻고 모든 좌표를 변환한 뒤에만 진행 상태를 교체합니다. 잘린 PointR·Bézier group, type 오류나 figure 문법 오류는 원래 coordinate cursor·누적값·type run·figure 상태를 그대로 남깁니다. 입력을 borrow하고 할당하지 않습니다.

## 지원 경계와 검증

이 계층은 Path command의 device 좌표와 metadata까지만 제공하고 [figure geometry 계층](emf-plus-path-device-geometry.md)이 이를 소유·색인합니다. [Marker point 반복자](emf-plus-path-device-marker-points.md)는 이 command의 원본 point 중 PathMarker가 설정된 위치를 반환합니다. figure별 평탄화는 [device figure polyline](emf-plus-path-device-polyline.md), 명시적/암묵적 closure는 [device boundary polyline](emf-plus-path-device-boundary-polyline.md)이 조립합니다. DashMode 적용, marker에 따른 GDI+ 조작, Pen cap/join, fill rule, clipping, rasterization과 저장은 후속 책임입니다. Object Table이 Path payload를 장기 소유하지 않으므로 DrawPath·FillPath record replay가 이 API를 자동 호출하지 않습니다. 로컬 지원 HWP corpus에 EMF+ signature 표본이 없어 실제 한컴 렌더링 동등성을 주장하지 않습니다.

합성 fixture는 다중 figure의 Move·Line·Bézier·빈 닫힌 figure 순서, 비대칭 translation/scale, 모든 좌표 역할, DashMode·PathMarker·CloseSubpath, 공개 `Path.deviceCommands()` 연결과 잘린 PointR Bézier 오류 원자성을 검사합니다.

적대적 검증은 iterator 오류 은폐·상태 미반영, Move mapping, 좌표 축, RLE metadata, PointType flags, Line의 start·end·figure start, Bézier의 start·control1·control2·end·figure start, cubic control 역할, 공개 Path mapping, segment의 공용 mapping 위임이라는 17개 의미 변이를 source-only 복사본에 적용했습니다. 변이·모드마다 새 local/global Zig cache를 사용한 Debug·ReleaseSafe·ReleaseFast 51/51회가 모두 기대 assertion으로 검출됐고 생존·compile error·panic은 없습니다. 최종 캠페인은 `/private/tmp/hwpjs-path-device-command-mutants.hlJiZZ`입니다. 변경되지 않는 `var` 컴파일 오류와 다중 행 치환 실패로 중단된 첫 캠페인, RLE optional 강제 해제가 Debug·ReleaseSafe panic과 ReleaseFast 생존로 나뉘어진 두 번째 캠페인은 완료 수치에서 제외했습니다. optional 존재를 먼저 단언하고 빈 Path 반복 EOF·control metadata·RLE Start metadata를 보강한 최종 소스와 테스트로 전체 캠페인을 재실행했습니다. 그 뒤 일반 PointType flags 전체 손실 변이를 추가한 최종 캠페인도 같은 소스와 테스트로 전체 재실행했습니다.

소스와 테스트를 고정한 최종 Debug → ReleaseSafe → ReleaseFast 전체 audit는 모드별 40/40 단계·2,025/2,025 테스트(공통 native 1,986개, 차트 31개, WMF 8개)를 통과했습니다. 각 로그에서 HWP/WASM `checks=8,905,827`, `imports=0`, CFB `mutations=12,000`·`traps=0`을 한 번씩 확인했습니다. 로그는 `/tmp/hwpjs-path-device-command-final-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다. 이 결과는 Path device command 변환 계약의 근거이며 figure aggregate·record replay나 실제 한컴 렌더링 동등성의 근거가 아닙니다.
