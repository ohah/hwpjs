# 그림 소유 위치의 임시 일괄 조회

## 병목과 계약

[자동 번호 화면 snapshot 조사](hwpx-automatic-number-display-snapshot.md)의 실제 load에서 picture_owner82회/21,424ms를 관측했습니다. 기존 `picture_owner.read`는 매 그림마다 display_current_paragraphs를 생성·해제합니다. 이는 전체 화면 시간이 아닌 호출 추적의 부분 비용입니다.

로컬 `picture_owner.readMany`는 요청한 그림들에 현재 문단 view 하나만 생성합니다. 기존 단일 read와 새 batch는 같은 readCurrent·picture_display_host 함수를 공유하여 문단·소유 그룹 앵커·UTF-16 위치 계산을 복제하지 않습니다. batch 결과는 입력 순서이며 그림별 정책 오류를 failure로 유지하고, OutOfMemory는 전체 batch 오류로 반환합니다. 구역 오류는 시작 전에 거부합니다. 결과 배열은 caller 소유이며 임시 view는 반환 전에 해제합니다. 다음 편집 이후 재사용하는 영구 캐시를 만들지 않습니다.

## 현재 검증과 미연결 경계

`zig test src/picture_owner_batch_regression_test.zig -O ReleaseSafe --test-filter 'picture owner batch'`는2/2 exit0입니다. 실제 sample-5017-pics의 모든 그림에서 기존 단일 조회와 batch의 owner/오류가 같고 원문 저장 byte-exact를 확인했습니다. 작은 합성 그림의 전체 할당 실패 sweep·범위 밖 요청과 정상/중복 요청의 분리·원문 불변도 검사했습니다. 정규 root에 두 회귀를 등록했고 build.zig/src 전체 fmt 검사도 exit0입니다.

`src/picture_owner_batch_benchmark.zig`는1/1 exit0으로 대형 형광펜 원본82개 그림의 기존 단일/일괄 결과와 저장 바이트가 같음을 확인했습니다. native std.testing allocator의 단일162,518ms/일괄5,160ms 실측이며 Worker/WASM 시간과 직접 비교하거나 전체 UI 개선 비율로 사용하지 않습니다.

## WASM·JS·UI 연결

선택적 `hwpx_edit_picture_owners(section)`는 구역 원본의 정확한 pic 노드를 열거하고 기존 readMany를 재사용합니다. JSON row는 picture_node와 owner 또는 failure이며 failure 문자열은 정적 errorName입니다. JS는 UTF-8·응답 크기/개수·u32 필드·중복 node·owner/error 상호 배타·0문단을 검사하고 camelCase 응답으로 변환합니다. native 요청/보고서의 그림 수 한도는 picture_owner.max_pictures가 소유합니다.

UI 부착은 구역별 한 번 조회하며 그림별 오류를 유지합니다. 기존 ABI 부재일 때만 단일 조회로 돌아가고, OOM·응답 누락·기타 오류를 재조회로 숨기지 않습니다. 첫 공개 비교 테스트는 존재하지 않는 editor.sectionCount 메서드를 호출한 검사 오류로2개 실패했으며, open의 sectionCount 반환값으로 교정했습니다.

첫 연결 후보 SHA256 `4ab991122bd15f82e74e3aed609c8e35e531bb0716d0d2d810aec42eb43a61e3`는 ReleaseSafe6/6 및 그림 관련8/8 exit0입니다. 기존44문서 Worker 그림 연결/bytes-on-demand 검사와 실제 일반/그룹 그림의 일괄-단일 비교, 순수 ABI/오류/기존 ABI fallback을 포함합니다. 대형 원본82개를 포함한 별도 공개 비교는3/3 exit0이며 이력 revision·원문 저장 불변도 확인했습니다.

같은 후보의 대형 원본 Canvas 입력/독립 XML/save/undo/redo는1/1 exit0,45.6초입니다. 앞선 자동 번호 공유만 적용한 실행143.6초보다 단축됐지만 각각 단회 실측으로, 실제 브라우저 E2E 또는 모든 문서의 속도 개선 보장은 아닙니다. 구 ABI를 가진 df16a06 후보도 기존 그림 부착/순수 회귀6/6 exit0으로 확인했습니다.

그림 수 한도를 상수로 공유한 후속 후보 SHA256 `100483796a4f80452e96cc5761f7949da13f35e0cdcf8f4e9d5d7824c2bd2a9a`도 ReleaseSafe6/6입니다. 새 후보로 집중 재검사9/9 exit0, skip/fail/cancel0을 확인했습니다. 앞선4ab의 Canvas45.6초 결과는 이 후보로 자동 소급하지 않습니다. 기본 검증 등록·소스 전체 fmt·누락 방지 검사도 확인했으나 최신 전체 gate는 여전히 남습니다. native 코드 커밋과 제품 승격은 보류합니다.

## 후속 편집 이력과 빈 요청 경계

같은10048379 후보의 `picture-owners-history.test.mjs`는1/1 exit0입니다. 실제 shapepict-scaled에서 split으로 소유 문단이+1, 앞😀 입력으로 앵커 위치가+3, merge로 소유 문단이 원래 번호로 돌아옴을 확인했습니다. 각 상태에서 batch/단일 조회·이력 revision·save 불변을 대조하고, 독립 객체 XML/ZIP normal/-O·undo/redo·재열기/재저장도 검사했습니다. 재열기 뒤 원본 노드 번호는 동일하다고 가정하지 않고 문단 소유 관계를 확인합니다.

로컬 native는 빈 요청에서 구역/한도 검증 후0길이 결과를 즉시 반환하도록 수정했습니다. 첫 할당부터 실패하는 allocator에서도 빈 요청이 성공해 불필요한 문단 모델 할당이 없음을 확인했습니다. 보고서의 node/owner/failure를 직접 확인하는 검사도 추가했고 native2/2 및 후속 실패 allocator 집중1/1 exit0입니다. 이 변경은 앞선10048379 WASM 빌드 이후의 source 수정이며 제품/전체 gate에 소급 반영하지 않습니다. 새 이력 회귀를 기본 목록에 등록한 누락 방지 검사와 전체 fmt도 통과했습니다.
