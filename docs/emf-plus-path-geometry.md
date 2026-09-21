# EMF+ Path geometry 조립

## 범위와 단일 출처

`src/image/emf/emf_plus_path_geometry.zig`는 `EmfPlusPath`의 point iterator와 point-type iterator를 같은 위치에서 소비해 `move_to`, `line_to`, `bezier_to` command를 조립합니다. [Path wire parser](emf-plus-path-object.md)는 좌표·일반/RLE type byte 경계만 소유하고, 상대좌표 누적은 `emf_plus_resolved_point_data.zig`, command 문법과 figure 상태는 이 모듈이 소유합니다. `Path.commands()`는 이 세 계층을 연결할 뿐 규칙을 복제하지 않습니다.

[MS-EMFPLUS EmfPlusPath](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/b539cf16-6232-4705-9f6e-6f914705145f)는 Path를 line과 curve segment의 연속으로 정의하고 cubic Bézier 점 순서를 start, control1, control2, end로 명시합니다. [PathPointType enumeration](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/0fbb49d5-0aea-4ed1-8822-bde79a3269d2)은 Start·Line·Bezier 역할을, [PathPointType flags](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/d02829c9-a8e2-433d-bd71-004169c856ec)는 DashMode·PathMarker·CloseSubpath를 정의합니다.

## figure와 command 계약

첫 비어 있지 않은 point와 닫힌 figure 다음 point는 Start여야 합니다. 새 Start는 이전의 닫히지 않은 figure를 끝내고 별도 figure를 엽니다. Line은 현재 점에서 해당 endpoint까지 한 command를 만들고, Bezier는 현재 점 뒤의 연속 세 Bézier 점을 control1·control2·end로 소비합니다. control point에 CloseSubpath가 있으면 endpoint라는 flag 의미와 충돌하므로 거부합니다. Line 또는 Bézier endpoint의 CloseSubpath는 command에 그대로 보존하고 다음 point에 새 Start를 요구합니다. Start 자체의 CloseSubpath도 빈 닫힌 figure로 보존합니다.

각 line/Bézier command는 figure 시작점을 함께 반환하므로 후속 fill/stroke 계층이 CloseSubpath 연결을 다시 검색할 필요가 없습니다. DashMode·PathMarker와 원래 일반/RLE type 정보는 각 `TypedPoint`에 남깁니다.

RLE type에서는 Start가 figure 경계로 우선하고, Start가 아닌 point의 line/Bézier 역할은 공식 `EmfPlusPathPointTypeRLE`의 B bit로 결정합니다. 따라서 B=1·중첩 Line은 Bézier로, B=0·중첩 Bezier는 Line으로 조립하되 중첩 PointType flags와 원값은 보존합니다. wire parser는 두 표현을 미리 합치거나 일치한다고 추정하지 않습니다.

## 원자성과 지원 경계

각 `next`는 필요한 좌표와 type 전체를 임시 iterator에서 읽은 뒤에만 좌표 cursor·PointR 누적·RLE run 상태·현재점·figure 시작점·닫힘 상태를 교체합니다. 잘림, point/type 개수 불일치, 잘못된 figure 시작 또는 불완전한 Bézier group은 현재 command 소비를 전부 원복합니다. 입력을 빌리고 할당하지 않습니다.

이 계층은 path topology까지만 구현합니다. CloseSubpath의 실제 closing edge 출력, DashMode stroke 적용, marker 소비자, world/page transform, clip boolean geometry, fill rule, curve 평가·flattening, rasterization과 저장은 후속 범위입니다. PathGradient·Region·CustomLineCap이 보유한 중첩 Path는 같은 `Path.commands()`를 호출할 수 있지만 상위 객체 의미를 여기서 추정하지 않습니다. 로컬 HWP corpus에는 EMF+ signature 표본이 0개라 실제 한컴 렌더링 동등성도 주장하지 않습니다.

## 검증 기록

합성 fixture는 여러 figure, Line과 cubic Bézier, line/Bézier/빈 figure 닫힘, figure 시작점 전달, DashMode·PathMarker, PointR 누적, 일반 type과 RLE B 양방향 우선순위, 첫 Start 누락, control CloseSubpath, 비연속·잘린 Bézier, 닫힘 뒤 Line, point/type 상태 원자성을 검사합니다. 기존 Path parser 집중 테스트에서도 `Path.commands()` 연결과 PointF 원비트를 확인합니다.

적대적 검증은 (1) 비-Start를 암묵적 Move로 수용, (2) figure 시작점 고정, (3) Line 뒤 current 갱신 제거, (4~5) Line/Bézier 닫힘 무시, (6) control1/control2 교환, (7) Bézier end를 control2로 대체, (8~9) 두 control 위치의 CloseSubpath 허용, (10) 비연속 Bézier 허용, (11) RLE B 무시, (12) RLE Start를 B로 덮어쓰기, (13) Bézier group 중간 source 조기 소비, (14) `Path.commands()` 연결 훼손, (15) 공용 PointR resolver 연결 훼손을 각각 독립 복사본에 주입했습니다. 변이·모드별 local/global cache를 분리한 Debug·ReleaseSafe·ReleaseFast 45회 실행이 모두 figure·연결·닫힘·control 역할·RLE·원자성·통합 단언으로 변이를 검출했습니다.

최초 캠페인에서는 Start 검사 제거가 null-state panic을 일으켰고, Bézier 닫힘 무시 변이는 닫힘 뒤 다음 입력도 Start라 생존했으며, RLE Start 변이는 enum literal 추론 컴파일 오류, 비원자 변이는 command tag 변경으로 테스트 panic을 일으켰습니다. 이 실행들은 유효 검출로 세지 않았습니다. 비-Start의 암묵적 Move 수용, 닫힌 Bé지어 뒤 Line 반례, 명시적 enum 반환, Bé지어 group 중간 조기 소비로 변이를 교체했고 테스트가 union tag를 먼저 단언하도록 보강한 뒤 네 변이의 12회를 새 복사본·cache에서 재실행했습니다. 제품 작업 트리에는 변이를 적용하지 않았습니다.

프로젝트 `.zig-cache`를 제거한 뒤 전체 audit를 순차 재실행했습니다. Debug·ReleaseSafe·ReleaseFast가 각각 40/40 단계와 1935/1935 테스트(코어 1896, chart ownership 31, WMF Contents 8)를 통과했습니다. 각 모드의 corpus 검사는 8,905,827 checks, imports 0이었고, strict mutation sweep는 12,000 mutations, traps 0이었습니다.
