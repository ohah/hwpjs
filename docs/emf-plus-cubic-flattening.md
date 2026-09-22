# EMF+ Cubic Bézier adaptive flattening

## 범위와 단일 출처

`src/image/emf/emf_plus_cubic_flattening.zig`는 device-space cubic을 tolerance 이내의 ordered polyline으로 변환합니다. 각 작업 항목은 [공용 flatness metric](emf-plus-cubic-analysis.md)으로 승인하거나 [정확한 midpoint subdivision](emf-plus-cubic-subdivision.md)으로 좌·우를 나눕니다. stack에는 right를 먼저 넣고 left를 나중에 넣어 LIFO 처리 순서를 원래 parameter 증가 순서로 유지합니다.

flatness metric은 두 control point에서 무한 직선이 아니라 유한 start→end chord segment까지의 최대 거리 제곱입니다. projection이 chord 앞·뒤면 해당 endpoint까지의 거리를 사용합니다. Bézier 곡선은 네 control point의 convex hull 안에 있고 chord segment는 convex set이므로, 네 점에서 chord까지의 최대 거리는 해당 cubic 구간 전체의 chord 거리 상한입니다. 공선이어도 control point가 endpoint 바깥에 있어 되돌아가는 곡선을 0으로 축약하지 않습니다.

`Options.tolerance`는 이미 world→page→device 변환된 좌표와 같은 device-space 단위이며 finite 양수여야 합니다. 비교는 제곱근 없이 `metric <= tolerance²`로 수행합니다. `max_depth`는 0..64이고 허용 split 횟수입니다. 한도 깊이에서 metric이 아직 크면 근사 성공으로 바꾸지 않고 `EmfPlusCubicDepthLimitExceeded`입니다. `max_points`는 start를 포함한 최소 2개이며, 다음 leaf endpoint를 추가할 수 없으면 `EmfPlusCubicPointLimitExceeded`입니다.

결과 `Polyline`은 allocator로 소유한 point slice이며 `deinit()`으로 해제합니다. start는 한 번만 추가하고 승인된 각 leaf의 end만 추가하므로 인접 leaf의 공유 endpoint를 두 번 쓰지 않습니다. 반복 DFS stack 크기는 최대 `max_depth+1`이고 재귀 호출을 사용하지 않습니다. option과 입력 좌표를 할당 전에 검증하며 이후 오류·OOM에서는 point와 work storage를 모두 해제합니다.

DrawBeziers device segment와 Path device Bézier의 `flatten()`은 기존 canonical cubic adapter를 재사용합니다. Path metadata는 출력 point 배열에 임의로 복제하지 않습니다.

## 지원 경계

이 계층은 한 cubic의 ordered device-space polyline 생성까지만 제공하며 DrawBeziers segment 연결은 [별도 aggregate 계층](emf-plus-bezier-device-polyline.md)이 담당합니다. Path metadata의 분할 위치 재배치, closed figure 종결, tolerance의 픽셀/anti-aliasing 정책, Pen 폭·cap·join·dash, fill rule, clipping, hit testing, rasterization과 저장은 후속 책임입니다. 표본 거리 검사가 모든 플랫폼의 픽셀 출력이나 한컴 렌더링 동등성을 뜻하지 않습니다.

## 검증 기록

비대칭 곡선에서 start/end·parameter 순서, midpoint 단일 출력과 257개 원곡선 표본의 polyline 최단거리²가 tolerance² 이내인지 독립 계산으로 검사합니다. 정상 공선 곡선은 두 점으로 끝나고, endpoint 바깥 control을 가진 공선 overshoot는 여러 점과 양쪽 overshoot를 보존합니다. metric이 0.25보다 크고 0.5보다 작은 별도 곡선은 tolerance 0.5에서 분할되어 거리와 거리 제곱의 단위 혼용을 막습니다. tolerance의 0·음수·NaN·±Inf, depth 65, point limit 1, 깊이 0/1 소진, 출력 한도 소진, 비유한 좌표와 무메모리에서의 좌표 오류 우선순위를 구분해 검사합니다. 모든 할당 실패 위치에서 누수가 없는지 `checkAllAllocationFailures`로 확인하고 DrawBeziers·Path 공개 adapter를 canonical 결과 전체와 대조합니다.

적대적 검증은 유한 segment metric의 projection 두 항·앞/뒤 gate·endpoint 선택·cross·분모, tolerance 유한성/양수·depth/point option, tolerance 제곱, 좌표 선검증, output start/leaf, 초기·증가 depth, 승인 비교, point/depth gate, midpoint parameter, 좌·우 순서와 branch 역할, DrawBeziers·Path adapter라는 27개 의미 변이를 source-only 복사본에 적용했습니다. 변이·모드마다 새 local/global Zig cache를 사용한 Debug·ReleaseSafe·ReleaseFast 81/81회가 모두 기대 assertion으로 검출됐고 생존·compile error·panic은 없습니다. 최종 캠페인은 `/private/tmp/hwpjs-cubic-flattening-mutants.92vcdY`입니다. 선행 캠페인에서 공선 adapter fixture, tolerance² 경계 누락, 관측 결과가 같은 depth off-by-one 변이와 다중행 치환 오류를 확인했으며 완료 수치에서 제외했습니다. 유한 chord가 아닌 무한 직선 거리로 공선 overshoot를 0 처리하던 선행 flatness 결함은 본 파트에서 수정했습니다.

소스와 테스트를 고정한 최종 Debug → ReleaseSafe → ReleaseFast 전체 audit는 모드별 40/40 단계·2,019/2,019 테스트(공통 native 1,980개, 차트 31개, WMF 8개)를 통과했습니다. 각 로그에서 HWP/WASM `checks=8,905,827`, `imports=0`, CFB `mutations=12,000`·`traps=0`을 한 번씩 확인했습니다. 로그는 `/tmp/hwpjs-cubic-flattening-final-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다. 이 결과는 단일 cubic의 device-space polyline 계약 근거이며 여러 segment/path replay나 실제 한컴 렌더링 동등성의 근거가 아닙니다.
