# EMF+ Path closing segment 조립

## 범위와 단일 출처

`src/image/emf/emf_plus_path_segments.zig`는 [Path command 계층](emf-plus-path-geometry.md)의 `line_to`·`bezier_to`를 그리기 순서의 segment로 전달하고 닫힌 figure 뒤에 별도 `close_figure` 직선을 추가합니다. `Path.segments()`가 wire Path에서 이 iterator까지 연결합니다. 좌표·point type·RLE·PointR·figure 문법은 기존 command 계층의 단일 출처이며 이 모듈에서 다시 해석하지 않습니다.

[MS-EMFPLUS PathPointType flags](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/d02829c9-a8e2-433d-bd71-004169c856ec)는 CloseSubpath point를 subpath의 endpoint로 정의합니다. Microsoft GDI+의 [GraphicsPath 설명](https://learn.microsoft.com/en-us/windows/win32/api/gdipluspath/nl-gdipluspath-graphicspath)은 닫힌 figure의 끝점이 시작점에 자동 연결된다고 명시하고, [GraphicsPath.CloseFigure](https://learn.microsoft.com/en-us/dotnet/api/system.drawing.drawing2d.graphicspath.closefigure)는 그 연결이 직선임을 명시합니다.

## segment와 닫힘 계약

일반 Line과 cubic Bézier는 command의 역할·원본 endpoint metadata를 그대로 보존합니다. endpoint에 CloseSubpath가 있으면 원래 line/Bézier를 먼저 반환하고, 다음 `next`에서 해당 endpoint부터 command가 보존한 figure 시작점까지 `close_figure`를 반환합니다. closure는 point 배열에 없는 의미상 직선이므로 가짜 `TypedPoint`를 만들지 않고 두 절대 좌표만 가집니다.

마지막 점과 figure 시작점의 좌표가 같아도 명시적 닫힘을 제거하지 않습니다. 좌표 일치와 closed figure 상태는 같지 않으며 후속 stroke의 cap/join 처리에도 차이가 있습니다. Start 자체에 CloseSubpath가 있는 빈 figure는 원래 그릴 line/curve가 없으므로 segment를 만들지 않습니다. Move와 비어 있는 figure를 건너뛰되 다음 drawable segment의 순서는 바꾸지 않습니다.

## 원자성과 지원 경계

`next`는 command iterator와 pending closure를 복사한 뒤 결과 전체가 준비된 경우에만 상태를 교체합니다. Move를 건너뛴 뒤 잘린 Bézier·잘못된 type·개수 오류가 발생해도 좌표 cursor, PointR 누적, RLE run, figure 상태와 pending closure가 모두 원복됩니다. 원래 segment를 반환한 뒤에는 closure가 메모리에 보존되므로 source를 더 읽지 않고 정확히 한 번 반환합니다. 입력을 빌리고 할당하지 않습니다.

이 계층은 명시적으로 닫힌 figure의 topology만 구현합니다. FillPath가 열린 figure도 채울 때 적용하는 암묵적 직선은 별도 [Path fill boundary 계층](emf-plus-path-fill-segments.md)이 소유하고 [Path device segment 계층](emf-plus-path-device-segments.md)이 Line·Bézier·closure 역할과 metadata를 보존해 일반 world/page/device 변환을 적용합니다. 평탄화 후 같은 정책의 선형 경계는 [device boundary polyline](emf-plus-path-device-boundary-polyline.md)이 조립합니다. DashMode 적용, marker 소비, clipping, fill rule, Pen cap/join, rasterization과 저장은 후속 범위입니다. 로컬 지원 HWP corpus에는 EMF+ signature 표본이 0개라 실제 한컴 렌더링 동등성은 주장하지 않습니다.

## 검증 기록

합성 fixture는 다중 Line 뒤 닫힘, Bézier 뒤 닫힘, 원래 segment 다음 closure 순서, figure 시작점, 열린 figure, 빈 닫힌 figure, 반복 종료, 동일 integer 좌표와 signed-zero·NaN 원비트의 명시적 퇴화 closure를 검사합니다. 잘린 PointR Bézier는 건너뛴 Move까지 포함해 command와 segment 상태가 전부 원복되는지 확인합니다. 기존 floating Path wire fixture는 `Path.segments()`가 line 다음 closing segment를 반환하는 통합 경로를 검사합니다.

적대적 검증은 (1~2) Line/Bézier closure 누락, (3~6) 두 closure의 시작·끝점 오염, (7) closure 반복, (8) Move를 segment로 방출, (9) 동일 좌표 closure 제거, (10) closure를 원래 line보다 먼저 방출, (11) 오류 시 source 선소비, (12) `Path.segments()` 연결 단절을 독립 복사본에 주입했습니다. 변이·모드별 local/global cache를 분리한 Debug·ReleaseSafe·ReleaseFast 36회가 모두 의미 assertion으로 검출했습니다.

최초 캠페인의 동일 좌표 제거 변이는 NaN이 자기 자신과 같지 않아 기존 floating fixture에서 생존했고, closure 선방출 변이는 열린 첫 line에서 optional unwrap panic을 일으켰습니다. 두 실행군은 유효 검출로 세지 않았습니다. 동일한 integer 좌표 fixture를 추가하고, 닫힌 line에서만 원래 segment를 생략하는 변이로 교체한 뒤 새 복사본·cache에서 6회를 재실행했습니다. 최종 유효 36/36회에는 생존·컴파일 오류·panic·timeout이 없습니다. 제품 작업 트리에는 변이를 적용하지 않았습니다.

변경 소스를 고정한 뒤 전체 audit를 순차 실행했습니다. Debug·ReleaseSafe·ReleaseFast가 각각 40/40 단계와 1938/1938 테스트(코어 1899, chart ownership 31, WMF Contents 8)를 통과했습니다. 각 모드의 corpus 검사는 8,905,827 checks, imports 0이었고, strict mutation sweep는 12,000 mutations, traps 0이었습니다.
