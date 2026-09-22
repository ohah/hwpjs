# EMF+ Path device figure geometry

## 범위와 단일 출처

`src/image/emf/emf_plus_path_device_geometry.zig`는 [Path device command 계층](emf-plus-path-device-commands.md)의 유효한 iterator를 소비해 figure와 drawable command를 소유하는 `Geometry`로 조립합니다. wire bytes·PointR 누적·PathPointType/RLE 해석·figure 문법·world/page/device 변환을 다시 구현하지 않고 `Path.deviceCommands()`의 Move·Line·Bézier를 그대로 보존합니다. `Path.deviceGeometry()`는 이 조립기에 mapping과 한도를 전달하는 공개 연결입니다.

## 소유 모델과 figure 범위

`Geometry.figures`와 `Geometry.commands`는 호출자 allocator로 독립 소유하며 `deinit()`이 둘 다 해제합니다. 각 `Figure`는 원래 device `move_to`, source point `Range`, drawable command `Range`, 정규화된 `closed`를 가집니다. `commandsFor()`는 figure index를 검증하고 해당 소유 배열의 bounded view만 반환합니다.

point range는 원래 Path point 소비량입니다. Move는 1, Line은 endpoint 1, cubic Bézier는 control1·control2·endpoint 3을 소비하며 이 값은 device command의 `sourcePointCount()`만 소유합니다. command range는 Line/Bézier 하나를 각각 1로 세며 Move는 별도 `Figure.move_to`에 보존합니다. 그러므로 빈 figure도 point count 1·command count 0으로 손실 없이 나타납니다.

새 Move는 이전의 열린 figure를 닫지 않은 상태로 종료하고 새 figure를 시작합니다. Move 자체나 Line/Bézier endpoint에 CloseSubpath가 있으면 해당 figure를 `closed=true`로 즉시 완료합니다. EOF의 열린 figure와 빈 열린 figure는 `closed=false`로 완료합니다. `closed`는 endpoint/Move metadata에서 파생된 figure 요약이며 원래 metadata도 command와 Move에 남습니다.

## 한도·원자성·지원 경계

`Options.max_figures`, `max_commands`, `max_points`는 서로 독립적인 전체 한도이며 기본값은 Path parser의 기본 point 한도와 같은 16 Mi입니다. 각 한도의 정확한 값은 성공하고 Move·Line·Bézier에서 하나라도 초과하면 각각 `EmfPlusPathFigureLimitExceeded`, `EmfPlusPathCommandLimitExceeded`, `EmfPlusPathPointLimitExceeded`를 반환합니다. 빈 Path는 세 한도가 모두 0이어도 빈 `Geometry`로 성공합니다.

source iterator는 값으로 복사해 소비합니다. iterator 오류, 한도, 할당 실패에서 부분 `Geometry`를 노출하지 않고 모든 figure·command storage를 해제합니다. 정상·source-error 경로는 safety allocator로 모든 build mode의 해제를 검사하고 `checkAllAllocationFailures`로 모든 할당 실패 위치를 검사합니다.

이 계층은 source command topology의 소유·figure 색인까지만 구현합니다. 명시적 closing edge·fill의 암묵적 closure는 기존 segment 계층의 별도 표현이며 이 aggregate의 command 배열에 가짜 Line으로 추가하지 않습니다. [figure별 device polyline](emf-plus-path-device-polyline.md)은 이 결과와 공용 cubic flattener를 조립합니다. DashMode·marker 소비, fill rule, stroke, clipping, rasterization과 record replay는 후속 책임입니다. 로컬 지원 HWP corpus에 EMF+ signature 표본이 없으므로 실제 한컴 렌더링 동등성을 주장하지 않습니다.

## 검증 기록

합성 fixture는 Bézier로 닫힌 figure, 빈 닫힌 figure, 다음 Move에서 종료되는 열린 figure, EOF의 빈 열린 figure를 함께 조립합니다. Move·Line·Bézier point 소비량, command 범위, 닫힘, 좌표, DashMode·PathMarker·CloseSubpath·RLE B, figure index 경계, 세 한도의 정확한 성공과 독립 초과, 빈 Path, 중간에 잘린 PointR Bézier, 공개 `Path.deviceGeometry()`의 mapping·options 연결을 검사합니다.

적대적 검증은 iterator 오류 은폐, Move 경계 종료, figure·Move point·Line/Bézier command·point 한도, 정확한 point budget, Move·Line metadata, Move·Line·Bézier source point 계수, Move·Line·Bézier·EOF 닫힘, Bézier control 역할, command·point range count, command range start·index 경계, 성공·source-error 해제, 공개 options·mapping 연결이라는 27개 의미 변이를 source-only 복사본에 적용했습니다. 변이·모드마다 새 local/global Zig cache를 사용한 Debug·ReleaseSafe·ReleaseFast 81/81회가 모두 기대 assertion으로 검출됐고 생존·compile error·panic은 없습니다. 최종 캠페인은 `/private/tmp/hwpjs-path-device-geometry-mutants.xtqr6x`입니다. leak 단언을 defer panic으로 변환해 오류 은폐·해제 변이를 유효 assertion으로 분류하지 못한 선행 캠페인과 SSOT 변경 후 스크립트 대상 변수·들여쓰기를 보정하느라 중단된 실행은 완료 수치에서 제외했습니다. allocator 종료를 테스트 본문의 assertion으로 바꾸고 소스 point 계수를 command 계약으로 옮긴 최종 소스·테스트로 전체 캠페인을 재실행했습니다.

소스와 테스트를 고정한 최종 Debug → ReleaseSafe → ReleaseFast 전체 audit는 모드별 40/40 단계·2,029/2,029 테스트(공통 native 1,990개, 차트 31개, WMF 8개)를 통과했습니다. 각 로그에서 HWP/WASM `checks=8,905,827`, `imports=0`, CFB `mutations=12,000`·`traps=0`을 한 번씩 확인했습니다. 로그는 `/tmp/hwpjs-path-device-geometry-final-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다. 이 결과는 Path device figure 소유·범위·닫힘 계약의 근거이며 figure polyline flattening·record replay나 실제 한컴 렌더링 동등성의 근거가 아닙니다.
