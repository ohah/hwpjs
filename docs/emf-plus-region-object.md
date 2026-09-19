# EMF+ Region 객체

## 범위와 단일 출처

- `emf_plus_region_values.zig`는 명세의 비연속 `RegionNodeDataType` 9개 값만 소유합니다.
- `emf_plus_region_node.zig`는 전위 순회 노드 해석, 자식 관계, 깊이 제한과 Rect/Path dispatch를 소유합니다.
- `emf_plus_region.zig`는 GraphicsVersion, `RegionNodeCount`, 전체 크기·노드 수·정확한 종료와 Object type 연결을 소유합니다.
- Rect는 `emf_plus_geometry.zig`, signed 길이 Path는 `emf_plus_sized_path.zig`, Path 내부는 `emf_plus_path.zig`를 재사용합니다. 이 문서나 Region 계층에서 해당 wire 규칙을 복제하지 않습니다.

기준은 Microsoft [MS-EMFPLUS] 2.1.1.26, 2.2.1.8, 2.2.2.40~42입니다. `RegionNodeCount`는 루트를 제외한 자식 노드 수이므로 실제 트리는 정확히 `RegionNodeCount + 1`개 노드를 가져야 합니다.

## 표현과 검증

Region은 입력 바이트를 빌리며 할당하지 않습니다. 노드는 wire 순서인 전위 순회 iterator로 노출하고 `index`, `depth`, type별 data를 반환합니다. combine 노드는 정확히 왼쪽·오른쪽 두 자식을 요구하고 Rect·Path·Empty·Infinite는 terminal입니다.

재귀 호출 대신 최대 256단계의 고정 스택을 사용합니다. 기본 제한은 Region 64 MiB, 노드 1,000,000개, 깊이 256, 중첩 Path 64 MiB입니다. 호출자는 더 작은 제한을 지정할 수 있지만 0 또는 저장 상한보다 큰 깊이 제한은 설정 오류입니다. 선언 수 overflow, 미지 type, 조기 종료, 미완성 트리, 초과 깊이, signed 음수 Path 길이, Path exact-slice 오류와 후행 바이트를 거부합니다.

Empty와 Infinite 뒤에 별도 data가 없는지는 트리 구조와 최종 exact-end 대조로 확인합니다. 부동소수 Rect 값은 공통 geometry 계약대로 IEEE 754 원비트를 해석하며 유한성 같은 렌더링 정책을 추가하지 않습니다.

## 검증 기록

구현 단위 테스트는 sparse type, combine/Rect/Infinite 순회, 선언 수와 실제 shape 불일치, overflow·크기·노드·깊이 제한, 미지 type, 모든 Path 잘림, 음수 Path 길이, 후행 바이트와 Object type을 검사합니다.

2026-09-19 적대적 검토에서 중첩된 좌우 subtree 뒤 형제 depth 복원, 256단계 경계, Rect 모든 잘림, 다섯 combine 종류, exact 한도와 iterator 오류 원자성을 추가했습니다. 참조 Rust 구현은 `RegionNodeCount`를 읽고 일반 element 한도만 검사할 뿐 실제 노드 수와 대조하지 않았으므로 그 동작은 채택하지 않았습니다.

독립 복사본에서 type domain, combine/terminal 분류, `count + 1`, Region·노드·Path exact 한도, count overflow, 조기 완료, 미완성 트리, 후행 data, 깊이 경계·설정, 자식 수, Rect 값·dispatch, Path dispatch, Object type과 형제 depth 복원을 망가뜨린 18개 의미 변이를 실행했습니다. Debug·ReleaseSafe·ReleaseFast의 54회 모두 테스트가 검출했고 컴파일 실패·생존 변이는 각각 0회였습니다. 복사본은 `/tmp/hwpjs-emfplus-region-mutants.F5D2Iz`, 실행 로그는 `/tmp/hwpjs-region-mutation-<변이>-<모드>.log`에 남겼습니다. 각 실행은 서로 다른 새 cache/global-cache 경로를 사용해 결과 재사용을 차단했습니다.

같은 날 전체 audit를 세 모드에서 순차 실행했습니다. 각 모드는 40/40 단계와 1,609/1,609 테스트(네이티브 1,570, 차트 31, WMF 8), HWP 감사 8,905,827 checks와 import 오류 0으로 통과했습니다. 로그는 `/tmp/hwpjs-emfplus-region-{Debug,ReleaseSafe,ReleaseFast}-audit.log`입니다. 이 수치는 현재 회귀 범위이며 Region 렌더링이나 실제 EMF+ Region corpus가 관측되었다는 뜻은 아닙니다.
