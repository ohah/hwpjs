# EMF+ 연결 cubic Bézier 조립

## 범위와 단일 출처

`src/image/emf/emf_plus_bezier_segments.zig`는 drawing `PointData`를 연결된 cubic Bézier segment로 조립합니다. wire 좌표와 PointR 누적은 `emf_plus_point_data.zig`와 [절대 좌표 resolver](emf-plus-point-resolution.md)가 소유하며 이 계층은 각 segment의 `start`, `control1`, `control2`, `end` 역할만 부여합니다. 입력을 빌리고 할당하지 않으며 i64 정수 좌표와 PointF 원비트를 유지합니다.

[MS-EMFPLUS EmfPlusDrawBeziers](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/3be0d4c9-a28b-4206-9532-5044cc07b8cc)는 점 순서를 start, control point 1, control point 2, end로 정의합니다. Microsoft GDI+의 [Drawing Bézier Splines](https://learn.microsoft.com/en-us/windows/win32/gdiplus/-gdiplus-drawing-bezier-splines-use)는 연결된 다음 곡선이 앞 곡선의 end를 start로 공유하고 새 control1·control2·end 세 점을 소비하는 7점 예제를 제시합니다. iterator는 첫 segment에 4점, 이후 segment마다 3점을 소비하며 공유 endpoint를 source에서 다시 읽지 않습니다.

## wire와 geometry 경계

공식 EMF+ record의 명시적 Count 제약은 최소 4이므로 `emf_plus_draw_beziers.zig` parser는 `(Count - 1) % 3 == 0`을 wire 오류로 추가하지 않습니다. 반면 완전한 cubic sequence를 만들려면 Count가 `1 + 3n`이어야 하므로 `DrawBeziers.segments()`와 공용 constructor는 그 조건을 만족하지 않는 4 미만·5·6 등의 입력에 `InvalidEmfPlusBezierTopology`를 반환합니다. 유효 wire를 조용히 잘라 그릴 수 있는 일부 geometry로 축소하지 않습니다.

각 `next`는 필요한 세 점 또는 첫 네 점을 임시 iterator에서 모두 읽은 뒤에만 source 위치·PointR 누적·previous endpoint를 교체합니다. borrowed bytes가 잘려 그룹 중간에서 실패하면 해당 segment 소비가 전부 원복됩니다.

## 지원 경계

이 계층은 cubic topology까지만 구현하고 [Bézier device segment 계층](emf-plus-bezier-device-segments.md)이 네 역할에 일반 world/page/device 변환을 적용하며 [공용 cubic evaluator](emf-plus-cubic-evaluation.md)가 단일 parameter 점을 계산합니다. flattening, clipping, Pen width/cap/join, anti-aliasing·rasterization과 저장은 후속 범위입니다. `EmfPlusPath`의 point type 배열과 개별 subpath는 별도 geometry 조립이 필요하므로 이 API에 섞지 않습니다. 로컬 지원 HWP corpus에는 EMF+ signature 표본이 0개라 실제 한컴 렌더링 동등성도 주장하지 않습니다.

## 검증 기록

합성 fixture는 4점 단일 segment, 7점 연결 segment와 endpoint 공유, PointR 누적, 절대 i16→i64, PointF signed zero·NaN·양/음 무한대 원비트, Count 0·1·2·3·5·6 geometry 거부, Count 4 승인, 반복 종료와 그룹 중간 잘림 원자성을 검사합니다. DrawBeziers parser 결과에서 네 역할과 wire-valid Count 5의 geometry 거부도 통합 검사합니다.

적대적 검증은 (1) 불완전한 `1+3n` 허용, (2) 최소 4점 거부, (3) 두 control point 교환, (4) endpoint를 둘째 control point로 대체, (5) 다음 segment의 공유 start를 잘못된 점으로 변경, (6) 마지막 segment 조기 종료, (7) 실패 시 iterator 일부 소비, (8) `DrawBeziers.segments()` 연결 제거의 여덟 변이를 각각 독립 임시 복사본에 주입했습니다. Debug·ReleaseSafe·ReleaseFast의 24회 실행이 모두 topology·역할·endpoint 공유·종료·원자성·record 연결 단언으로 변이를 검출했습니다. 컴파일 오류가 먼저 발생한 최초 연결 제거 변이는 유효 검출로 세지 않고, 매개변수 사용만 보정한 동일 의미 변이를 다시 실행했습니다. 변이는 제품 작업 트리에 적용하지 않았습니다.

프로젝트 로컬·전역 Zig 캐시를 삭제한 뒤 `zig build audit --summary all`, `-Doptimize=ReleaseSafe`, `-Doptimize=ReleaseFast`를 순차 실행했습니다. 세 모드 모두 40/40 단계와 1927/1927 테스트를 통과했고, 각 실행에서 독립 검사는 8,905,827건·import 오류 0, CFB 변이는 12,000건·trap 0으로 끝났습니다.
