# 증분 조판 계약 v5

상태: 미구현 설계. 제품 성능·O(n) 전체 조판·원본 조판 동치를 검증한 문서가 아니다.
대상: HWP5/HWPX 공통 Canvas 호스트의 조판 계층. Native 문서/저장/undo SSOT와 기존 raw helper 계약을 변경하지 않는다.

## 1. 첫 구현 범위와 확장 순서

첫 단계는 고정 열폭, 병합·rowspan·중첩표·반복머리행 없는 표 셀의 일반 텍스트 편집이다. 문단 추가/삭제/분할/이동, 스타일/글꼴/자원 변경, 필드/번호/각주/float/다단/수식/균형배치가 영향을 주면 이 빠른 경로를 쓰지 않는다. 지원되지 않는 의존성이 없다는 것을 내부 입력 생산자가 판정하지 못하면 기존 전체 조판 경로를 사용한다. 존재하지 않는 기능을 검사한 척하지 않는다.

이 단계는 변경 없는 문단의 줄 측정 결과만 재사용한다. 표행과 페이지 placement는 기존 전체 알고리즘으로 재계산하며, 높이 비교에 의한 조기 종료는 도입하지 않는다. 변경 문단도 기존 줄 측정 함수를 사용한다. 다음 단계의 suffix 조기 종료/복잡한 의존성은 별도 계약과 증명이 있기 전까지 비활성이다. 이는 전체 문서 편집 지원을 줄이는 정책이 아니라 기존 전체 경로와 공존하는 제한된 최적화다.

## 2. 상태와 권위

- ModelBinding: editor/document incarnation, model generation, branch/operation identity. revision 숫자만으로 identity를 만들지 않는다. 실제 기존 owner의 identity를 재사용하고 재사용되지 않는 참조 또는 수명 토큰으로 비교한다.
- EnvironmentBinding: 실제 사용한 폭/글꼴측정·segmenter/provider/resource generation과 준비 상태. document revision과 별개다. 모르는 의존성은 불변으로 취급하지 않는다.
- LayoutInputBinding: ModelBinding, geometry 의존 EnvironmentBinding 및 조합 미리보기의 실제 text/range identity를 포함한다. draft가 줄 geometry를 바꾸면 이 binding이 바뀐다.
- PresentationBinding: viewport/scale와 selection/view revision. viewport가 가용폭 등 geometry 입력도 바꾸면 EnvironmentBinding도 바뀐다. scroll·caret/selection만 바뀌면 기존 계산은 계속하고 paint ticket만 갱신한다. 줄 geometry 재사용이 selection 쓰기 권한을 부여하지 않는다.
- LayoutCommit: LayoutInputBinding, geometry commit ID, 줄 결과, 표/페이지 결과, source→row mapping, 소비한 dirty 기준점을 함께 소유한다. 이전 commit은 문서 SSOT가 아니다. PresentationBinding은 이 ID의 일부가 아니다.
- PreparedGeometry: 아직 게시하지 않은 결과 ID, LayoutInputBinding, base geometry commit ID와 완전한 출력. 준비만으로 dirty를 소비하거나 ready를 발급하지 않는다.
- PaintAttempt: PreparedGeometry 또는 published geometry의 결과 ID, 최신 PresentationBinding, 고유 paint ticket을 결합한다. PresentationCommit은 이 시도가 정상 완료됐다는 frame 관측이며 geometry commit과 구분한다.
- Job: baseCommit, target binding, 고유 ticket, 예산, 임시 입력/인덱스/출력만 소유한다. 다른 job이나 live Native 모델을 해제/수정하지 않는다.

## 3. 내부 입력 진입과 raw 호환

빠른 경로는 기존 model owner에서 코드로 연결한 비공개 projection 생산자만 호출할 수 있다. 외부값의 freeze, Proxy 검사, canonical:true, 새 classifier/자기신고 brand로 권한을 발급하지 않는다. 내부 모듈은 owner의 일관된 immutable 관측을 받아 직접 소유한 plain 필드/배열을 만든다. immutable child를 공유하려면 owner의 불변 수명 계약이 있어야 한다. 그 계약이 없는 값은 복사하거나 빠른 경로를 사용하지 않는다. 원본을 freeze하지 않는다.

capture 전후 owner binding이 같아야 하며, capture 내부에서 외부 callback/getter가 실행되는 연결은 빠른 경로에서 허용하지 않는다. 비동기 자원값은 pinned generation/lease의 값으로 고정한다. 임의 raw 값이 섞이는 경우 사후 fallback으로 해결하지 않는다.

raw/public helper는 기존 진입에서 기존 순서로 한 번 실행한다. raw helper를 먼저 관측한 뒤 전체 경로로 재시작해 getter/Proxy/callback을 두 번 실행하지 않는다. 내부 빠른 경로 여부는 raw 평가 이전에 호출 경로로 결정한다. 내부 계산 실패가 Native 명령 재실행을 유발하지 않는다.

배열과 nested scalar/버퍼의 외부 mutable alias를 허용하지 않는다. 내부 측정 callback은 원본 배열을 받지 않으며 pure 입력과 반환값만 사용한다. 기존 측정 callback의 부작용 유무를 모르면 내부 연결을 활성화하지 않는다. 실제 연결은 코드/소유 경계 감사와 실행 검증이 필요한 별도 gate다.

## 4. dirty 기준과 합치기

항상 마지막 정상 LayoutCommit→현재 target을 기준으로 한다. ACK/preview가 왔다고 baseCommit을 전진시키지 않는다. A commit 뒤 B 편집 계산 중 C가 오면 A→B 영향도 남는다. 최초 단계에서는 stable paragraph/owner identity가 유지되는 텍스트 교체만 순서대로 합성하며, 여러 문단이 dirty면 각 문단을 한 번 표시한다. journal 크기 상한을 넘거나 명령 경로/undo branch가 끊기면 전체 target snapshot을 대상으로 재계산한다.

undo/redo는 branch와 owner 연결이 증명되는 실제 전이만 합성한다. 삭제/분할/이동/owner 재사용 등 구조 변화는 첫 단계에서 전체 경로다. 숫자 ID 집합 합집합으로 좌표 변환을 추측하지 않는다. 실패/noop은 문서 dirty와 selection/view/resource invalidation을 구분한다.

계산 중 새 LayoutInputBinding이 오면 latest target 한 개만 보유하고 현재 job을 취소 표시한다. PresentationBinding만 바뀌면 geometry job은 취소하지 않는다. 잃어버린 중간 delta가 있으면 전체 target 계산으로 바꾼다. 취소된 작업의 dirty 소비 위치는 commit하지 않는다. 입력 Native 큐의 순서는 변경하지 않는다.

## 5. 재사용과 배치

이전 결과 재사용은 stable owner/membership, 정확 text/run/style/terminal 상태, 가용폭, font/segmenter/resource dependency가 모두 같을 때만 가능하다. 해시만 같은 것으로 승인하지 않는다. 기존 validated key 또는 정확한 scalar 동치와 source 권위 매핑을 사용한다. 같은 높이/텍스트만으로 승인하지 않는다.

측정 재사용 gate는 기존 validated context key의 모든 입력과 실제 측정 함수의 읽기 의존성 목록을 대조해야 한다. 시작 y/page/column, baseline grid, 페이지 상대 탭·정렬, 남은 row/공간 제한, 문단의 첫/마지막 위치가 결과에 관여하면 해당 값을 정확히 키에 넣거나 첫 범위에서 제외한다. 코드상 의존성 목록과 호출인자별 변경 음성 시험이 없으면 빠른 경로 활성0이다. 좌표 translation 불변성을 전체 baseline 출력과 비교해 입증하기 전에는 절대위치 이동 후 줄 재사용을 허용하지 않는다.

재사용된 줄은 content-relative geometry다. 이전 절대 page/y/hit binding을 그대로 가져오지 않고 현재 placement에서 source mapping을 갱신한다. 같은 크기 그림·색/링크 등 paint 변경도 무시하지 않는다. 첫 범위에서 그런 변화는 전체 경로다.

소유 입력을 한 번 순회해 paragraph/flow index와 duplicate 정보를 만든다. 순서·중복·필드부재 오류 계약을 보존한다. 각 대상은 한 번 측정/재사용하고, 표/페이지 placement는 한 번의 기존 전체 pass로 수행한다. 빠른 경로 자체에 페이지별 suffix 재시작 루프를 추가하지 않는다.

확장 단계에서 조기 종료하려면 같은 논리 source/fragment 경계, 모든 dirty predecessor 반영, 미변경 suffix의 일관성 및 완전 outbound 상태 동치가 필요하다. outbound에는 page/column/잔여폭·높이, 표행/span/반복머리행, float 제외영역, note carry/번호/header-footer, resource context가 포함된다. 목록은 실제 알고리즘의 읽기 의존성 감사로 닫혀야 한다. 이 계약이 없는 현재 단계는 조기 종료하지 않는다. cycle/불명확한 의존성은 부분 결과를 게시하지 않는다.

## 6. 복잡도·예산·양보

N은 실행 전에 고정한 logical owned 입력 그래프의 크기다. 공유 객체 노드는 한 번, 각 실제 필드/배열 edge는 각각 한 번 센다. 문자열은 각 고유 소유 필드의 UTF-16 단위, 버퍼는 명시 owner의 저장 바이트로 센다. 동일 문자열 값이라는 이유로 서로 다른 필드를 합치지 않는다. 공유 backing은 실제 소유 저장소 ID/수명이 명시된 경우만 한 번 세며 그렇지 않은 view는 각 입력 길이로 보수 계수한다. N은 실행 중 반복 방문이나 파생 key를 추가해 늘리지 않는다. R은 최종 공개 출력의 행/segment와 문자열·버퍼 길이다. 임시 파생 key/인덱스는 공개 출력 R에도 포함하지 않는다.

W는 실제 반복 방문·키 생성/해싱·정확 비교·복제·임시 할당 작업량의 별도 합계다. 공유 자원 그래프 S를 C개 셀의 context마다 다시 읽으면 N=O(C+S)인데 W=O(CS)가 될 수 있으며 이를 선형이라고 표시하지 않는다. 인덱스/dirty 및 모든 context key 생성·비교를 포함한 bookkeeping 합계 W가 평균 Map 조회 가정하 O(N+R)인지 검사한다. key/비교를 계수에서 빼거나 새로 생성한 key 크기를 입력 N에 더해 이차 증가를 숨기지 않는다. 공유 owned 하위값을 재사용하려면 내부 소유·정책별 동치가 유지돼야 하며 raw 값으로 이 권한을 확대하지 않는다. C와 S를 독립적으로 늘린 경우와 N/2N/4N 경우를 모두 계수해 CS 증가면 이 gate 실패다.

중첩 DAG는 방문표로 중복을 제어하며 cycle/폭발적 edge는 사전 예산으로 빠른 경로를 거부한다. 측정/기존 전체 배치 알고리즘의 복잡도는 별도이며 bookkeeping gate 통과를 전체 O(n) 증명으로 부르지 않는다. 입증되지 않은 복잡도는 gate 실패다. 입력크기는 예산상태와 무관한 동일 정의로 baseline/candidate에 적용한다.

매 입력마다 전체 snapshot을 만들면 K회 비용은 적어도 각 N_i의 합이다. 공유/복제/측정/placement/출력복제 계수를 따로 수집한다. K회 입력을 O(N)이라고 하지 않는다. 초기 성능 gate는 같은 baseline 대비 실제40입력/40취소/재입력의 모델·선택 동치와 측정/복제량·브라우저 지연을 함께 비교한다.

scheduler는 target별 예산 외에 모든 취소 작업을 합친 turn 단위 작업량과 작업 대기열 상한도 적용한다. 새 입력/target이 왔다고 turn 예산을 초기화하지 않는다. 실행 중 하나와 최신 대기 하나만 보유하고 다음 안전점까지의 초과도 계수한다. 기존 입력 preview 경로는 유지하되 stale geometry를 현재 hit-test/선택 근거로 쓰지 않는다. 지속적인 문서 변경 중 항상 최신 ready frame을 보장하지 않으며 pending 상태를 명시한다. 입력과 자원/환경 변경이 멎고 owner가 유효하며 설정 예산이 충분하고 scheduler가 실행 기회를 받으면, 마지막 target의 geometry 계산은 종료해 준비 상태가 되어야 한다. scroll/selection만의 무한 변화는 geometry 계산을 재시작하지 않지만 최신 paint의 ready는 presentation이 안정된 완료 paint 뒤에만 허용한다.

여기서 turn은 일반 JS event-loop task가 아니라 host scheduler가 발급하는 고유 grant ID의 구간이다. 한 animation frame의 grant는 한 번만 받으며 같은 ID 재전달은 보충하지 않는다. job 교체, 새 target, Promise/microtask continuation 또는 단순 yield는 새 grant를 발급하지 않는다. grant 소진은 terminal 오류가 아니라 다음 host frame grant까지의 양보다. 다음 grant에서 turn 방문/soft time 예산만 보충하고 target 누적 작업량/fallback 횟수와 retained bytes 계정은 유지한다. host가 멈춘 동안 실행/진행을 보장하지 않는다. 숨김 탭의 별도 timer 실행을 원하면 rate limit과 단조 grant ID를 가진 명시 host 정책으로만 제공하며 이 설계의 기본 경로는 아니다. scheduler는 clock/frame 주입 경계이고 문서 코어에 브라우저 시계를 넣지 않는다.

시간 양보는 grant 내부 elapsed-time soft limit이다. target 자원 예산은 누적 방문/할당·출력량이며 대기 wall time을 계산 작업으로 차감하지 않는다. 하나의 기존 동기 측정이 grant를 초과할 수 있음을 기록하고 그 다음 작업은 시작하지 않는다. 이 경우 프레임 시간 상한은 아직 증명되지 않았으며 원자 측정의 분할/상한 검증 전에는 무지연을 주장하지 않는다.

target별 예산/fallback 횟수의 키는 document incarnation+ModelBinding+composition text/range identity+명시 retry ID(최초 0)다. 같은 입력에서 environment/provider/view만 바뀌면 새 job ticket은 만들 수 있지만 이 누적 계정을 초기화하지 않는다. 새 문서/실제 모델 편집/새 조합 입력은 새 계정을 만든다. resource-limited terminal 뒤 같은 계정을 자동 재시작하지 않는다. 사용자 명시 retry는 새 retry ID로 유한 config의 target 작업 예산/fallback 횟수만 새로 만들고, 기존 turn 예산·실제 retained bytes·미소비 dirty·마지막 geometry commit 기준은 유지한다. Native 편집 명령은 재실행하지 않는다. retry도 turn 전체 예산을 우회하지 않는다. 환경이 계속 바뀌는 동안의 최신 ready를 보장하지 않는 한계는 동일하다.

각 target에는 방문/바이트/출력/시간 양보 예산을 scheduler가 부여한다. 세부 수치는 배포 환경별 명시 config이며 무한대 기본값은 허용하지 않는다. fast→full fallback은 같은 target당 최대1회이며 누적 예산을 초기화하지 않는다. 예산이 부족하면 resource-limited 상태로 끝내고 자동 재시도하지 않는다. full 자체 실패는 명시 실패다. resource-limited는 baseline의 문서 오류가 아니라 새 opt-in scheduler 자원 상태이며 이를 baseline parse/layout 오류로 치환하지 않는다. 이 정책은 기본 기존 raw/full 경로에는 소급 적용하지 않는다. 오류 동치 gate는 예산이 충분하고 같은 순수 입력을 계산한 성공/문서 오류 영역에 적용한다. 예산 음성 시험에서는 별도 resource-limited 상태·Native/dirty 보존·부분 commit0을 검증한다. 실제 배포에서 새 정책 활성은 명시 config와 기존 입력 UX 회귀 검증을 통과해야 한다. 작은 예산으로 기존 성공 입력이 제한될 수 있다는 점을 숨기거나 동치 통과로 세지 않는다. raw 부작용 경로는 재시작하지 않는다. 검출 가능한 allocation 오류는 정리하지만 JS process OOM 회복을 약속하지 않는다.

양보 단위는 부작용 없는 내부 순회 chunk다. 기존 동기 측정 함수 중간을 강제로 중단하지 않는다. 취소는 다음 안전점에서 검사한다. 한 번의 기존 동기 측정이 길면 양보만으로 해결된다고 주장하지 않는다. 차후 개선/실측의 별도 대상이다.

## 7. 소유 수명과 메모리

renderer는 최대 하나의 published commit, 하나의 active job, 하나의 lightweight latest target을 보유한다. 이전 줄 cache는 published commit 안에 소유하고 별도의 무제한 세대 cache를 만들지 않는다. 새 commit은 필요한 소유값을 이전하거나 안전한 immutable 참조를 유지하며 bytes budget에 포함한다. 임시 index와 snapshot이 결과에 빌린 참조로 남지 않는다.

취소한 job은 안전점에서 먼저 닫고 새 job을 시작한다. old async callback은 ticket과 최소 handle만 보유하도록 연결하고 닫힌 job의 snapshot/output 참조를 분리한다. 자원 lease는 retain/release를 명시한다. current+active+cache+retained bytes를 하나의 budget으로 계산하며 GC/RSS 즉시 감소를 완료 조건으로 삼지 않는다. dispose/문서교체 후 release는 idempotent하며 해당 job 소유값에만 적용한다.

## 8. 실패·재진입·게시

상태는 pending→running→prepared→painted→committed 또는 cancelled/failed/resource-limited다. source가 바뀌면 이전 geometry의 hit/selection 현재성은 즉시 무효다. 옛 bitmap은 stale 표시로 남길 수 있으나 새 모델의 좌표 권한으로 쓰지 않는다. Native 편집 성공은 조판 실패로 되돌리지 않는다. 기존 입력 fence가 현재성 없는 caret를 사용하지 않게 유지하며 Native history 큐 권한을 새 조판 모듈이 대체하지 않는다.

조판을 마친 결과는 PreparedGeometry로 남기고 최신 presentation과 새 PaintAttempt를 만든다. 순수 scroll/selection 재paint는 geometry commit ID와 dirty cursor를 전진시키지 않는다. paint 도중 presentation이 바뀌면 해당 paint ticket만 폐기하고 유효한 PreparedGeometry는 보존해 다음 presentation에 재결합한다. Model/LayoutInputBinding이 바뀌면 결과 자체를 폐기한다. 옛 화면을 stale로 다시 표시하더라도 새 모델의 geometry commit으로 승격하지 않는다.

모든 외부 후처리 뒤 LayoutInputBinding/base geometry commit ID/geometry result ID와 현재 PaintAttempt의 presentation/ticket을 재확인한다. callback 없는 동기 commit 구간에서 새 geometry/dependency state/dirty 소비 위치를 함께 바꾸고 frame binding도 게시한다. dirty는 새 geometry commit에서 정확히 한 번만 소비하며 이미 게시된 geometry의 재paint는 frame binding만 바꾼다. 외부 listener 호출은 그 뒤 기존 g6 dispatcher 계약으로 수행하며 재진입/예외가 commit을 소급 변경하지 않는다. 실패한 paint는 ready를 발급하지 않는다. old job의 finally는 새 job/global 상태를 초기화하지 않는다.

selection·scroll/zoom만 바뀌면 presentation ticket을 무효화하고 준비된 geometry는 유효한 LayoutInputBinding일 때 보존한다. IME draft의 실제 text/range가 바뀌어 geometry를 바꾸면 LayoutInputBinding과 presentation ticket을 함께 무효화한다. document layout 재사용과 caret/selection 재게시를 구분한다. composition 시작/갱신/확정/취소는 기존 입력 소유자가 관리하며, 조판 모듈은 초안을 Native 저장값으로 승격하지 않는다. 폰트/자원 완료도 environment invalidation이며 unknown dependency는 context 전체 invalidation이다.

## 9. 구현 gate와 검증 종료 기준

1. 내부 owner/순수측정 연결 증명, raw 관측순서/예외 보존. 코드연결이 없으면 fast path 활성0.
2. 마지막 commit 기준 dirty 합성, branch/취소/실패/noop/문서교체/IME/resource 전이의 모델 검증.
3. full baseline과 같은 입력에서 행·문자범위·좌표·표/페이지·source/hit mapping·오류 동치. 허용오차를 임의 추가하지 않음.
4. 예산/양보/모든 경계실패·late callback·dispose에서 부분 commit0, 타job 해제0, stale geometry 권한0.
5. N/2N/4N 및 K편집의 방문·복제·측정·출력/retained bytes 계수. full layout/Native/실제 pixels 증거와 분리.
6. 공식 실제 SDK/앱/fixture/브라우저 E2E 및 OS IME 검사, 같은조건성능 비교. 설계/모델 검토만으로 대체하지 않음.

설계 회차의 종료는 문서 범위 내 새 actionable 계약 결함이 없다는 독립 검토로만 기록한다. 위 구현 gate 완료나 모든 미래 반례 부재를 뜻하지 않는다. 모든 변경은 새 버전으로 고정해 재검토하며, 이전 검토를 다른 버전의 승인으로 승계하지 않는다.

## 10. 설계 검토 기록 — 2026-11-02

최초 계약부터 v5까지 보완·재검토했다. 입력 소유권/관측 순서, 마지막 게시 결과 기준 dirty 합성, 실패 후 기하 권한, 측정 의존성, geometry와 paint ID, 누적 예산/host grant/명시 retry, 입력 크기와 반복 작업량의 구분을 보완했다. v5 고정 문서의 네 독립 검토 축에서 새 actionable 지적0이었다. 이는 현재 문서 범위의 정합성 검토이며 제품 구현 승인이나 실제 선형 복잡도 입증이 아니다.

전이 정책의 작은 추상 모델은 명시14사례와 깊이5의 유일상태2064/전이12213에서 제한 invariant 위반0이었다. 메인이 모델을 읽고 독립 재실행해 같은 결과를 확인했다. 탐색은 유한 owner/예산/기호 binding을 사용하며 거부/noop 전이도 포함한다. 전이 수를 실제 제품 테스트 수로 해석하지 않는다. 모델의 v4 전이 문구는 v5에서 동일하지만 v5의 N/W/R 계수 계약을 실행 검증한 것은 아니다.

실제 owner/측정 함수 연결, 원 전체 조판과 결과 동치, Native/저장/Canvas 픽셀/OS IME, 실제 메모리·복잡도·입력 지연은 이 설계 검토에서 검증하지 않았다. 빠른 경로는 구현 gate를 통과하기 전까지 활성화하지 않는다. 이번 문서 변경으로 운영 앱이나 WASM은 바뀌지 않는다.

## 글꼴 인덱스 후보 실측

[글꼴 인덱스 후보 검증 기록](font-resource-index-cache.md)은 정합성과 작업량 감소를 확인했지만 입력·취소 응답의 개선 근거를 확보하지 못해 채택하지 않은 실험을 소유한다. 이 기록으로 제품 코드·정규 시험·CI·운영·Pages 번들은 변경하지 않았다. 운영 버전 자체의 CPU 진단과 후속 복사·키 구축 조사도 같은 문서에서 구분한다.
