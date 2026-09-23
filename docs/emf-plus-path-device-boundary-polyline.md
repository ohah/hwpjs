# EMF+ Path device boundary polyline

## 범위와 단일 출처

`src/image/emf/emf_plus_path_device_boundary_polyline.zig`는 [Path device figure polyline](emf-plus-path-device-polyline.md)에 stroke와 fill의 서로 다른 figure closure 정책을 적용합니다. wire Path, PointR, point type, 좌표 변환, figure 조립과 cubic 평탄화를 다시 구현하지 않습니다. `Path.strokeDevicePolyline()`과 `Path.fillDevicePolyline()`은 device command부터 임시 figure polyline 해제까지 연결합니다.

Move·Line·Bézier의 source point 수와 CloseSubpath 판정은 [device command 역할 타입](emf-plus-path-device-commands.md)의 `sourcePointCount()`와 `closesFigure()`가 단일 출처입니다. device figure geometry와 boundary 계층은 이 메서드를 재사용합니다.

## stroke·fill closure 계약

drawable command가 있는 명시적 closed figure는 stroke와 fill 모두 마지막 point 뒤에 시작 좌표를 한 번 추가하고 `Closure.explicit`으로 기록합니다. 열린 drawable figure는 stroke에서 그대로 두고 `Closure.none`, fill에서는 시작 좌표를 추가하고 `Closure.implicit`으로 기록합니다. Move만 있는 빈 figure는 Move 자체의 CloseSubpath 여부와 무관하게 두 정책 모두 point를 추가하지 않고 `Closure.none`입니다.

마지막 point와 시작점의 좌표 비트가 같아도 명시적·암묵적 closure point를 제거하지 않습니다. 좌표 일치만으로 cap/join 또는 fill boundary 의미를 없앨 수 없기 때문입니다. 원래 polyline point와 일반/RLE metadata는 그대로 복사하고, point 배열에 없던 의미상 closing edge의 끝점은 시작 좌표와 `source_type=null`을 갖습니다.

## 소유권·검증·한도

결과 `Geometry`는 figure와 point 배열을 호출자 allocator로 소유하며 `deinit()`이 둘 다 해제합니다. 각 figure는 원본 figure index, 결과 point range, closure 종류를 보존합니다. `pointsFor()`는 index와 공개 결과가 변경된 뒤의 range를 검사합니다.

입력 figure의 point/command range는 0부터 연속이어야 하고 두 원본 배열을 정확히 모두 소비해야 합니다. 첫 polyline point는 Move와 좌표 비트까지 같아야 하며, `closed` 요약은 빈 figure의 Move 또는 마지막 Line/Bézier endpoint가 보고하는 `closesFigure()`와 일치해야 합니다. overlap, gap, trailing data, 범위 초과와 closure 불일치는 slice trap 전에 오류로 반환합니다.

`Options.max_points`는 모든 figure와 추가 closure를 합친 전역 결과 한도입니다. closure가 없는 정확한 source slice 한도와 closure를 포함한 정확한 한도는 성공하고 하나 부족하면 `EmfPlusPathBoundaryPointLimitExceeded`입니다. source 검증, 한도, 할당 실패에서는 부분 결과를 노출하지 않고 모든 임시 polyline·figure·point storage를 해제합니다.

이 계층은 closure가 포함된 device-space 선형 경계까지만 구현합니다. DashMode·PathMarker 소비, Pen 폭·cap·join·dash, alternate/winding fill rule, self-intersection, clipping, Brush sampling, hit testing, anti-aliasing, rasterization과 record replay는 후속 책임입니다. 로컬 지원 HWP corpus에 EMF+ signature 표본이 없으므로 실제 한컴 렌더링 동등성을 주장하지 않습니다.

## 검증 기록

합성 aggregate는 닫힌 Bézier figure, 열린 Line figure, 닫힌 빈 figure, 시작·끝 좌표가 같은 닫힌 Line figure를 함께 사용합니다. stroke/fill의 explicit·implicit·none 구분, source figure index와 결과 range, 원래 metadata, 추가 closure의 null metadata, 퇴화 closure 보존을 검사합니다. closure 없는 stroke와 closure 포함 stroke/fill의 정확한 한도 및 하나 부족한 실패, 빈 입력 0 한도, source point/command 범위 초과·overlap·trailing, Move 불일치, closed 불일치, 결과 accessor 변형, 모든 할당 실패와 정상·한도 오류 해제를 검사합니다. 공개 Path API는 실제 닫힌·열린 Path에서 mapping, 정책, flattening option, boundary option을 확인합니다.

적대적 검증은 source point/command 연속성·전체 소비, 빈 source, Move bit 일치, closure 요약 검증, Move·Line·Bézier `closesFigure()`와 geometry 위임, drawable 판정, stroke/fill 정책, closure 추가·좌표·metadata, source point 복제, 두 exact global limit gate, source index와 output range, accessor 오류·bounds, 성공·오류 경로 해제, collect 정책, 공개 stroke 정책·mapping·flattening/boundary options라는 33개 의미 변이를 source-only 복사본에 적용했습니다. 변이·모드마다 새 local/global Zig cache를 사용한 Debug·ReleaseSafe·ReleaseFast 99/99회가 모두 기대 assertion으로 검출됐고 생존·compile error·panic은 없습니다. 최종 캠페인은 `/private/tmp/hwpjs-path-boundary-polyline-mutants.9D3uCZ`입니다. 빈 figure closure 변이의 미사용 매개변수 compile error, collect policy의 미사용 매개변수 compile error, closure 없는 exact slice 경계 미관측을 드러낸 선행 캠페인은 완료 수치에서 제외하고 변이와 fixture를 보정했습니다. closure SSOT 리팩터링과 Move 초기 closed 중복 제거 후 전체 캠페인을 매번 새 캐시로 다시 실행했습니다.

최종 closure SSOT 소스와 테스트를 고정한 Debug → ReleaseSafe → ReleaseFast 전체 audit는 모드별 40/40 단계·2,038/2,038 테스트(공통 native 1,999개, 차트 31개, WMF 8개)를 통과했습니다. 각 로그에서 HWP/WASM `checks=8,905,827`, `imports=0`, CFB `mutations=12,000`·`traps=0`을 한 번씩 확인했습니다. 최종 로그는 `/tmp/hwpjs-path-boundary-polyline-final2-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다. 이 결과는 Path device boundary polyline의 closure 정책·소유·range·한도 계약 근거이며 실제 stroke/fill/rasterization이나 한컴 렌더링 동등성의 근거가 아닙니다.
