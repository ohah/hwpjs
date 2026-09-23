# EMF+ Path device boundary edge iterator

## 범위와 단일 출처

`src/image/emf/emf_plus_path_device_boundary_edges.zig`는 [Path device boundary polyline](emf-plus-path-device-boundary-polyline.md)의 소유 배열을 allocation-free `Move`·`Edge` 이벤트로 순회합니다. 좌표 변환, figure 조립, cubic 평탄화와 stroke/fill closure 정책을 다시 구현하지 않습니다. 입력 `Geometry`와 그 배열은 iterator보다 오래 살아 있어야 하며 iterator는 이를 빌립니다.

`Move`는 결과 figure index, 원본 figure index, 시작 좌표·원본 point type과 closure 정책을 보존합니다. `Edge`는 연속한 두 좌표, 원본 endpoint metadata의 유무와 다음 역할 중 하나를 반환합니다.

- `flattened`: cubic 평탄화가 만든 중간점으로 끝나는 edge
- `source_endpoint`: 원본 Line/Bézier endpoint로 끝나는 edge
- `explicit_closure`: 원본 CloseSubpath 때문에 추가된 시작점으로 끝나는 edge
- `implicit_closure`: fill 정책이 열린 drawable figure에 추가한 시작점으로 끝나는 edge

같은 좌표의 퇴화 edge도 제거하지 않습니다. Move-only figure는 Move 한 개만 반환하고 다음 figure로 진행합니다. 이 이벤트 계층은 boundary polyline의 원본/null metadata와 `Closure`를 분류 근거로 삼으며 CloseSubpath나 열린 fill 정책을 별도로 추론하지 않습니다.

## 입력 검증과 진행 원자성

figure의 원본 index와 point range는 0부터 연속이어야 하고 EOF에서 전체 point 배열을 정확히 소비해야 합니다. 각 figure는 Start metadata가 있는 point로 시작해야 합니다. closure가 없는 drawable figure의 마지막 point는 원본 metadata를 가져야 하며, 명시적·암묵적 closure는 Move와 최소 한 drawable endpoint 뒤에 null metadata와 시작 좌표의 bit-level 복제본을 가져야 합니다. 따라서 closed figure는 최소 3점이고 `+0.0`과 `-0.0`을 closure 일치로 합치지 않습니다.

`next()`는 현재 상태의 복사본에서 figure range와 불변식을 검증하고 완전한 이벤트를 만든 뒤에만 진행 상태를 교체합니다. 잘못된 figure index·range·Move·closure와 EOF의 trailing point 오류에서는 iterator 상태가 유지됩니다. 유효한 빈 aggregate는 반복해서 EOF를 반환합니다.

이 계층은 선형 경계 이벤트와 endpoint metadata 전달까지만 구현합니다. DashMode 적용, PathMarker 소비, Pen 폭·cap·join·dash, alternate/winding fill, self-intersection, Brush sampling, clipping, hit testing, anti-aliasing, rasterization과 record replay는 후속 책임입니다. 로컬 지원 HWP corpus에 EMF+ signature 표본이 없으므로 실제 한컴 렌더링 동등성을 주장하지 않습니다.

## 검증 기록

합성 aggregate에서 평탄화 point, 원본 endpoint, 명시적 closure, 열린 edge, Move-only figure와 암묵적 closure의 전체 이벤트 값을 대조합니다. figure/source index, 모든 시작·끝 좌표, 원본 point type, null metadata와 역할을 필드별 일부가 아니라 union 전체로 비교하고 반복 EOF를 확인합니다. overlap, range 초과, source index 불일치, 빈 figure, Start metadata 부재·잘못된 kind, drawable endpoint가 없는 2점 closure, closure metadata·좌표, 열린 마지막 null metadata, signed-zero 불일치와 trailing point는 정확한 오류와 진행 상태 보존을 검사합니다.

첫 집중 검사에서 Move-only figure 뒤에 `point_index=1`이 남아 다음 호출이 범위를 벗어나는 결함을 재현해 즉시 다음 figure로 진행하도록 수정했습니다. 첫 변이 캠페인은 존재하지만 point count가 0인 figure의 정확한 오류 계약 누락을 찾아 테스트를 보강했습니다. 전체 저장소를 변이마다 복사해 임시 공간을 소진한 실행과 잘못된 직접 모듈 루트로 import가 거부된 실행은 제품 검증 수치에서 제외했습니다.

교정한 최종 캠페인은 검증 gate, closed figure의 최소 drawable endpoint, Move-only 진행, Move·Edge의 모든 반환 필드, flattened/source endpoint와 explicit/implicit 역할, figure 종료 진행이라는 25개 의미 변이를 독립 `src/` 복사본에 적용했습니다. 변이·모드마다 새 local/global Zig cache를 사용한 Debug·ReleaseSafe·ReleaseFast 75/75회가 모두 assertion으로 검출됐고 생존·compile error·panic은 없습니다. 결과는 `/private/tmp/hwpjs-path-boundary-edges-mutants.lNKVCM`에 있습니다.

최종 소스와 문서를 고정한 Debug → ReleaseSafe → ReleaseFast 전체 audit는 모드별 40/40 단계·2,041/2,041 테스트(공통 native 2,002개, 차트 31개, WMF 8개)를 통과했습니다. 각 로그에서 HWP/WASM `checks=8,905,827`, `imports=0`, CFB `mutations=12,000`·`traps=0`을 확인했습니다. 로그는 `/tmp/hwpjs-path-boundary-edges-final-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다. 이 결과는 boundary edge 이벤트의 분류·metadata·진행 계약 근거이며 실제 stroke/fill/rasterization이나 한컴 렌더링 동등성의 근거가 아닙니다.
