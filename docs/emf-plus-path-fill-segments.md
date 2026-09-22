# EMF+ Path fill boundary 조립

## 범위와 단일 출처

`src/image/emf/emf_plus_path_fill_segments.zig`는 [Path command 계층](emf-plus-path-geometry.md)을 fill 경계 segment로 조립합니다. 일반 `line_to`·`bezier_to`와 [Path closing segment 계층](emf-plus-path-segments.md)의 공용 `Segment` 타입을 사용하며, `Path.fillSegments()`가 wire Path에서 이 iterator까지 연결합니다. 좌표·point type·RLE·PointR·figure 문법은 기존 command 계층이 소유하고 이 모듈은 fill의 닫힘 정책만 소유합니다.

[MS-EMFPLUS drawing record types](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-emfplus/f01d82be-b19b-418b-9620-7ae1f2e1efd2)는 FillPath가 graphics path 내부를 그리는 record라고 정의합니다. Microsoft GDI+의 [Filling Open Figures](https://learn.microsoft.com/en-us/windows/win32/gdiplus/-gdiplus-filling-open-figures-use)는 FillPath가 열린 figure도 끝점에서 시작점까지 직선으로 닫은 것처럼 채운다고 명시합니다.

## fill boundary 계약

Line과 cubic Bézier는 원래 순서와 endpoint metadata를 그대로 반환합니다. 명시적 CloseSubpath가 있으면 원래 segment 다음에 endpoint→figure 시작점의 `close_figure`를 정확히 한 번 반환합니다. 닫히지 않은 비어 있지 않은 figure는 다음 Start를 만났을 때, 마지막 figure는 EOF에서 같은 직선으로 닫습니다. 다음 Start를 먼저 읽어 figure 경계를 확인하더라도 closing segment는 새 figure의 drawable segment보다 먼저 반환합니다.

좌표가 같은 시작점과 끝점도 명시적·암묵적 closure를 제거하지 않습니다. Move만 있는 figure와 Start 자체에 CloseSubpath가 있는 빈 figure는 채울 경계가 없으므로 segment를 만들지 않습니다. 명시적으로 닫힌 figure의 상태는 closure를 예약할 때 제거해 다음 Start나 EOF에서 중복 closure를 만들지 않습니다.

## 원자성과 지원 경계

`next`는 command iterator, 열린 figure의 시작·끝점과 pending closure를 복사한 뒤 결과가 준비된 경우에만 상태를 교체합니다. Move를 건너뛴 뒤 잘린 Bézier·잘못된 type·개수 오류가 발생해도 좌표 cursor, PointR 누적, RLE run, command figure 상태와 fill 상태가 모두 원복됩니다. 명시적 CloseSubpath의 closure는 endpoint command를 반환할 때 예약하므로 다음 Start를 읽지 않고 한 번만 반환합니다. 입력을 빌리고 할당하지 않습니다.

이 계층은 FillPath에 필요한 figure boundary topology까지만 구현하고 [Path device segment 계층](emf-plus-path-device-segments.md)이 원래 segment와 명시적·암묵적 closure에 일반 world/page/device 변환을 적용합니다. alternate/winding FillMode 적용, self-intersection 처리, Brush sampling, clipping, anti-aliasing·rasterization, Object Table의 Path payload 보유·record replay와 저장은 후속 범위입니다. PathGradient와 CustomLineCap의 fill path가 이 경계를 재사용할지는 각 상위 객체 의미가 결정합니다. 로컬 지원 HWP corpus에는 EMF+ signature 표본이 0개라 실제 한컴 렌더링 동등성은 주장하지 않습니다.

## 검증 기록

합성 fixture는 다중 Line의 열린 figure를 다음 Start에서 닫기, 열린 Bézier를 다음 Start에서 닫기, 마지막 열린 figure의 EOF 닫힘, 명시적 closure 비중복과 다음 Start 미소비, 빈 닫힌 figure, 원래 segment→closure 순서와 반복 종료를 검사합니다. signed-zero·NaN 원비트와 동일 integer 좌표의 퇴화 implicit closure도 보존합니다. 잘린 PointR Bézier는 건너뛴 Move까지 포함해 command/fill 상태 전체의 원복을 확인합니다. 기존 floating Path wire fixture는 `Path.fillSegments()` 공개 연결을 검사합니다.

적대적 검증은 (1) Start 경계 closure 누락, (2) EOF closure 누락, (3~4) closure 시작·끝점 오염, (5) closure 반복, (6) Move를 segment로 방출, (7) 명시적 closure 중복, (8) closure를 원래 line보다 먼저 방출, (9~10) 열린 figure 시작·끝점 오염, (11) Bézier 추적 누락, (12) 동일 좌표 closure 제거, (13) 오류 시 source 선소비, (14) `Path.fillSegments()` 연결 단절, (15) 명시적 closure 예약 제거와 다음 Start 선소비를 독립 복사본에 주입했습니다. 변이·모드별 local/global cache를 분리한 Debug·ReleaseSafe·ReleaseFast 45회가 모두 의미 assertion으로 검출됐습니다.

최초 캠페인의 좌표 오염 네 변이는 미사용 변수 오류, Move 방출 변이는 도달 불가 코드 오류로 컴파일에 실패했습니다. 이 15회는 유효 검출로 세지 않았습니다. 같은 의미를 유지하면서 원래 값을 명시적으로 소비하고 조건부 제어 흐름을 사용하는 변이로 교체해 새 복사본·cache에서 재실행했습니다. 이후 명시적 closure 예약 제거 변이 3회를 별도 새 복사본·cache에서 추가했습니다. 최종 유효 45/45회에는 생존·컴파일 오류·panic·timeout이 없습니다. 제품 작업 트리에는 변이를 적용하지 않았습니다.

변경 소스를 고정한 뒤 전체 audit를 순차 실행했습니다. Debug·ReleaseSafe·ReleaseFast가 각각 40/40 단계와 1941/1941 테스트(코어 1902, chart ownership 31, WMF Contents 8)를 통과했습니다. 각 모드의 corpus 검사는 8,905,827 checks, imports 0이었고, strict mutation sweep는 12,000 mutations, traps 0이었습니다.
