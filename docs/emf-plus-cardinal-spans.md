# EMF+ cardinal spline span 조립

## 범위와 단일 출처

`src/image/emf/emf_plus_cardinal_spans.zig`는 drawing `PointData`에서 cardinal spline이 통과하는 연속 두 점의 span을 조립합니다. wire 좌표와 PointR 누적은 `emf_plus_point_data.zig`와 [절대 좌표 resolver](emf-plus-point-resolution.md)가 소유하며 이 계층은 열린 범위 선택과 닫힘 연결만 담당합니다. 입력을 빌리고 할당하지 않으며 i64 정수 좌표와 PointF 원비트를 유지합니다.

[MS-EMFPLUS EmfPlusDrawCurve](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/e2002379-cb4c-47c0-a08a-239454aaf364)는 Offset을 시작 point index, NumSegments를 spline의 segment 수로 정의합니다. Microsoft GDI+의 [Graphics::DrawCurve](https://learn.microsoft.com/en-us/windows/win32/api/gdiplusgraphics/nf-gdiplusgraphics-graphics-drawcurve%28constpen_constpoint_int_int_int_real%29)는 segment가 연속한 두 점을 연결하고 앞 segment의 end가 다음 start라고 설명합니다. [Drawing Cardinal Splines](https://learn.microsoft.com/en-us/windows/win32/gdiplus/-gdiplus-drawing-cardinal-splines-use)와 [MS-EMFPLUS FillClosedCurve](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/d7b561b0-3dc7-4444-b7ac-55492b5af0f4)는 닫힌 spline이 마지막 점을 지나 첫 점으로 연결됨을 명시합니다.

## wire와 geometry 경계

DrawCurve wire parser는 명세에 별도 MUST 관계가 없는 Offset·NumSegments 원값을 보존합니다. `DrawCurve.spans()`와 `open` constructor는 실제 point 배열에서 안전하게 선택 가능한 `Offset < Count`와 `NumSegments <= Count - Offset - 1`만 허용하고, 범위를 벗어나면 `InvalidEmfPlusCardinalRange`를 반환합니다. NumSegments 0은 유효한 빈 span 선택이며 Offset point도 읽지 않습니다.

DrawClosedCurve와 FillClosedCurve의 `spans()`는 Count개의 span을 반환합니다. 앞 `Count - 1`개는 인접 점을 연결하고 마지막 span은 마지막 점에서 첫 점으로 돌아갑니다. 공용 constructor는 독립 사용에서도 최소 3점을 요구합니다.

각 `next`는 Offset skip과 필요한 endpoint를 임시 iterator에서 모두 읽은 뒤에만 source 위치·PointR 누적·첫 점·이전 점·남은 span 수를 교체합니다. borrowed bytes가 잘리거나 PointData 내부 개수와 실제 iterator가 모순되면 현재 span 소비를 전부 원복합니다.

## 지원 경계

span은 cardinal spline이 통과하는 endpoint 쌍이지 직선 출력이나 완성된 cubic curve가 아닙니다. Tension 기반 tangent/control point 계산, 수치 평가·flattening, world/page transform, clipping, Pen stroke, fill rule, anti-aliasing·rasterization과 저장은 후속 범위입니다. 로컬 지원 HWP corpus에는 EMF+ signature 표본이 0개라 실제 한컴 렌더링 동등성도 주장하지 않습니다.

## 검증 기록

합성 fixture는 PointR 누적 뒤 Offset 1·NumSegments 2 선택, 열린 endpoint 공유, Offset/NumSegments 경계와 빈 선택, 닫힌 3점의 세 span·마지막→첫 연결, PointF signed zero·NaN·양/음 무한대 원비트, 최소 Count와 Offset skip 중 잘림 원자성을 검사합니다. 세 record의 `spans()` 연결도 각 parser 집중 테스트에서 검사합니다.

적대적 검증은 (1) Offset==Count 허용, (2) 과다 NumSegments 허용, (3) Offset 무시, (4) span 수 증가, (5) start를 end로 대체, (6) 마지막 span 조기 종료, (7) 닫힘 span 누락, (8) 닫힘 end를 마지막 점으로 대체, (9) 실패 전 source 일부 소비, (10) 닫힌 최소 Count 완화, (11~13) DrawCurve·DrawClosedCurve·FillClosedCurve의 `spans()` 연결 제거를 각각 독립 임시 복사본에 주입했습니다. 변이·모드별 local/global cache를 분리한 Debug·ReleaseSafe·ReleaseFast 39회 실행이 모두 범위·Offset·개수·endpoint·닫힘·원자성·최소값·record 연결 단언으로 변이를 검출했습니다. 컴파일 실패·panic·생존 변이는 없었고 제품 작업 트리에는 변이를 적용하지 않았습니다.

최종 `zig build audit --summary all`, `-Doptimize=ReleaseSafe`, `-Doptimize=ReleaseFast`는 각 모드에서 40/40 단계와 1931/1931 테스트를 통과했습니다. 각 실행은 독립 검사 8,905,827건·import 오류 0과 CFB 변이 12,000건·trap 0을 기록했습니다.
