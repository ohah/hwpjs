# EMF+ Path device figure polyline

## 범위와 단일 출처

`src/image/emf/emf_plus_path_device_polyline.zig`는 [Path device figure geometry](emf-plus-path-device-geometry.md)의 figure별 Line·cubic Bézier command를 device polyline으로 평탄화합니다. wire bytes·PointR 누적·point type 해석·world/page/device 변환·figure 조립을 다시 구현하지 않으며, Bézier는 [공용 adaptive cubic flattening](emf-plus-cubic-flattening.md)에 위임합니다. `Path.devicePolyline()`은 device command 조립부터 임시 figure geometry 해제까지 연결합니다.

## 소유권·범위·metadata

결과 `Geometry`는 figure, 원본 device command snapshot, 평탄화 point를 모두 호출자 allocator로 소유하며 `deinit()`이 세 배열을 해제합니다. 각 figure는 원래 Move, source point/command range, 결과 point range, 닫힘 상태를 보존합니다. `pointsFor()`와 `commandsFor()`는 figure index뿐 아니라 공개 결과가 변경된 뒤의 start/count도 검사하고 bounded view 또는 명시적 오류를 반환합니다.

각 결과 figure는 Move를 첫 point로 저장하고 Line endpoint를 그대로 추가합니다. Bézier는 공용 flattener의 공유 start를 제외한 중간점과 endpoint를 추가합니다. 생성된 중간점은 `source_type=null`, Move·Line endpoint·Bézier endpoint는 원래 일반/RLE `PathPointType`을 갖습니다. control point metadata까지 잃지 않도록 원본 command snapshot도 함께 소유합니다. collapsed Bézier도 동일 좌표 endpoint를 별도 point로 유지하므로 endpoint의 DashMode·PathMarker·CloseSubpath를 잃지 않습니다.

figure별 source command/point range는 연속이어야 하며 point count는 Move 1, Line 1, Bézier 3의 실제 소비량과 일치해야 합니다. command의 `figure_start`와 `start`는 Move 및 직전 endpoint와 좌표 비트까지 같아야 합니다. 이 검사는 공개 struct를 손으로 조립한 경우에도 slice trap 전에 오류를 반환합니다.

## 한도·원자성·지원 경계

`Options.tolerance`와 `max_depth`는 빈 입력에서도 먼저 검증합니다. `max_points`는 모든 figure를 합친 결과 point의 전역 한도이며 0인 빈 geometry는 성공합니다. 정확한 한도는 성공하고 하나 부족하면 `EmfPlusCubicPointLimitExceeded`입니다. source 검증, 평탄화, 한도, 할당 실패에서 부분 결과를 노출하지 않고 임시 polyline·figure·point·command storage를 모두 해제합니다.

이 계층은 source topology와 metadata를 보존한 device polyline까지만 구현합니다. 명시적 closing edge와 fill의 암묵적 closure는 [별도 boundary polyline 계층](emf-plus-path-device-boundary-polyline.md)이 기존 segment 정책과 같은 구분으로 적용합니다. DashMode·PathMarker 소비, Pen 폭·cap·join·dash, fill rule, clipping, hit testing, anti-aliasing, rasterization과 record replay는 후속 책임입니다. 로컬 지원 HWP corpus에 EMF+ signature 표본이 없으므로 실제 한컴 렌더링 동등성을 주장하지 않습니다.

## 검증 기록

합성 fixture는 Line 뒤의 곡선 Bézier, 닫힌 빈 figure, 열린 Line figure를 함께 사용해 figure/source/output range, 좌표 순서, 공용 flattener와의 일치, 생성점의 metadata 부재, Move·endpoint·control metadata, 닫힘을 검사합니다. 별도 collapsed Bézier는 같은 좌표 두 point와 endpoint metadata를 확인합니다. 정확한 전역 한도와 하나 부족한 실패, 빈 geometry의 0 한도, tolerance/depth 선검증, 잘못된 command/point range, 불연속 start/figure-start, index 오류, 모든 할당 실패와 정상·평탄화 오류 해제를 검사합니다. 공개 `Path.devicePolyline()`은 실제 Path의 mapping, geometry option, flattening option 우선순위를 확인합니다.

적대적 검증은 tolerance/depth 경계와 전달, Move·Line·Bézier 좌표/metadata, 생성점 metadata, global point gate, figure 닫힘, source point/command range와 세 역할의 소비량 SSOT, output point range와 accessor bounds, command snapshot, index 오류, source range/연속성 검증, command·오류 경로 해제, 공개 mapping/options 연결이라는 32개 의미 변이를 source-only 복사본에 적용했습니다. 변이·모드마다 새 local/global Zig cache를 사용한 Debug·ReleaseSafe·ReleaseFast 96/96회가 모두 기대 assertion으로 검출됐고 생존·compile error·panic은 없습니다. 최종 캠페인은 `/private/tmp/hwpjs-path-device-polyline-mutants.yYPAj4`입니다. 하위 flattener가 대신 잡은 option 경계, optional unwrap panic, tolerance 0.5→1.0의 동등 subdivision, aggregate gate가 이미 막는 하위 임시 budget 확대를 드러낸 선행 캠페인은 완료 수치에서 제외하고 테스트와 변이를 보정했습니다. Move·Line·Bézier 소비량 SSOT와 public 결과 range 방어를 추가할 때마다 전용 변이를 더한 전체 캠페인을 다시 실행했습니다.

최종 accessor와 Move 소비량 SSOT 보강까지 소스와 테스트를 고정한 Debug → ReleaseSafe → ReleaseFast 전체 audit는 모드별 40/40 단계·2,034/2,034 테스트(공통 native 1,995개, 차트 31개, WMF 8개)를 통과했습니다. 각 로그에서 HWP/WASM `checks=8,905,827`, `imports=0`, CFB `mutations=12,000`·`traps=0`을 한 번씩 확인했습니다. 로그는 `/tmp/hwpjs-path-device-polyline-final3-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다. 이 결과는 Path device figure polyline의 소유·metadata·범위·평탄화 계약 근거이며 closure 정책, stroke/fill/rasterization이나 실제 한컴 렌더링 동등성의 근거가 아닙니다.
