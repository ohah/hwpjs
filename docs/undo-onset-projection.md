# 대기 입력 중 첫 실행 취소와 화면 투영

## 지원 범위

rapid input의 앞선 Native 응답이 남아 있을 때 첫 undo 의도를 접수하는 것과 실제 Native undo 실행을 구분한다. 요청 FIFO·각 ACK·텍스트/선택 권한을 유지하면서 중간 투영의 불필요한 동기 계산과 예약 frame 재계산을 제한한다. 표·페이지 재조판 후보나 전체 편집/조판 완료를 포함하지 않는다.

## 책임과 private frame hold

`history-input-intent-queue.mjs`는 FIFO와 실행 준비 검사, `canvas-editor.mjs`는 ACK·draft staging·논리 DOM 선택 sync·permission/currentReference, `packages/vanilla/src/surface.ts`는 bridge pending/finish 수명, `renderer.mjs`는 geometry/예약 frame/최종 paint를 소유한다. 앞선 요청을 합치거나 버리거나 undo가 앞지르게 하지 않는다.

명시 private Surface 포트에서 일반 문단 plain splice ACK·남은 앞선 텍스트·history FIFO head·같은 state/lease/pending kind splice와 controller 현재성을 확인할 때만 hold한다. 일회 receipt와 hold는 Native·selection·paint-ready 권한이 아니다. held paint는 이전 snapshot을 유지하고 스스로 RAF를 재예약하지 않는다. RAF spin으로 입력 대기를 대체하지 않는다.

외부/default schedule은 hold를 해제한다. stage와 연결된 deferGeometry ACK만 hold를 보존하며 명시 geometry query·reflow/show·clear/close·resource 무효화도 기존 경로로 해제한다. IME·서식·오류·선택/lease/state/reset 변화는 fallback한다. 마지막 앞선 ACK와 undo 복원은 기존 fresh geometry/paint barrier를 통과해야 한다. raw 포트 미지정의 기본 callback 인자 수와 scheduling 관측은 유지한다. 새 Native backend 조회나 권위 발급을 추가하지 않는다.

## source와 controlled 연결 검증

정규 선택은 source70·controlled Surface/frame6·기존 renderer18의94개 고유 시험이며 격리 canonical provider와 실제 root 검사에서 통과했다. 실제 Surface/controller/renderer 함수와 Core public EditorState를 사용하지만 editor lease·DOM·Canvas·RAF는 통제 모형이다. 현재 Core를 재빌드한 CI 성공과는 구분한다. source 함수 모형을 실제 Native 성공으로 부르지 않는다. 독립 Oracle5와 별도 Surface5그룹/11scenario도 각 근거로 구분하며 합산 시험 총계를 만들지 않는다. Surface 독립 범위는 hold/final fresh·lease/state·scroll/selection/query·reset/reentry·close·IME/error다. 이전 fce 후보나 반복 하네스 결과를 새 성공 수에 더하지 않는다.

## 실제 브라우저 기능과 제한 측정

제품 QA 카운터·Debugger/Profiler 없는 DOM 관측 ABBA4의 A는 기존 baseline, B는 r2다. 입력 fixture는 Noori.hwp(HWP5)257536B, SHA-256 `b18be0217a5d9f81e587705edc0c514cdd11e6314bbe434f17d256aa21b75a7f`이며 section0/paragraph15/UTF-16 unit2에서 macOS Cmd+Z를 사용했다. 네 실행 모두 functional/onset-valid였다. 각 실행은 A80→첫Z→B80 interleaving, 합계undo160·redo159·r1과 원문 왕복·최종커서162를 확인했다. 이는 지정 workload의 결과이며 모든 문서·실OS IME·저장/전체 Canvas 동치로 일반화하지 않는다.

| 순서 | A1 | B1 | B2 | A2 |
| --- | ---: | ---: | ---: | ---: |
| keydown→host undo 시작 DOM 관측(ms) | 660.9 | 308.2 | 311.9 | 685.5 |

각 버전 n2·한 cohort의 중앙값은 A673.2/B310.05ms로53.94% 감소했다. host DOM callback 관측이며 Native issue/ACK 시각은 측정하지 않았다. CDP/DOM 관측 비용·외부 CPU 부하를 포함한다. paint marker는 B80까지 포함할 수 있으므로 undo-only paint latency가 아니다. 기존 fce pair·QA16counter·이전 무효 표본은 합산하지 않았다. Debugger/Profiler/추가 Native 조회 없이 수집한 이 제한 결과를 첫 파일 열기·일반 성능·통계적 유의성으로 확대하지 않는다.

정규 명령은 [개발·검증 명령](development-commands.md#첫-undo-onset-화면-투영-선택-회귀)을 따른다. source 계약과 모형·실제 브라우저 증거 범위를 구분하며 이전 실패나 QA 표본을 성공 수에 더하지 않는다.

HWPX 기능 회귀는 같은 공개 앱 후보에서 `noori.hwpx`(SHA-256 `6ee9014f23650987803481e7aa51b3b2201f91f549dccfe34880469621d62aab`)의 실제 파일 선택 후 trusted 입력8·즉시 undo8을 검사했다. 원문과 커서2 복원 뒤 r 재입력·커서3 및 현재 paint를 확인했다. 이는 기능 검사이며 HWPX 속도나 저장·재열기 동치를 측정한 결과는 아니다.

## 중간 조판 생략과 Native source 관측 연속성

중간 layout을 건너뛸 때 현재 source 전이를 prepare에서만 처리하면 관측하지 못한 epoch 간격 때문에 기존 문단 버전 연결을 다시 만들 수 있다. `native-geometry-deps.mjs`와 `renderer.mjs` 두 파일에서 승인된 source의 관측과 실제 측정 scope 준비를 구분한다. 기존 history hold는 유지한다.

renderer는 이미 받은 현재 content/evidence를 source 전이 관측에 전달한다. observe는 owner generation과 연속 전이를 갱신하지만 geometry scope를 반환하지 않고 accepted를 늘리지 않는다. 새 content/epoch의 membership은 prepare가 검증하기 전까지 enabled=false다. host 의존성·현재 membership 검사와 실제 scope 발급은 기존 prepare가 담당한다. 오래된 scope·stamp를 새 source 권위로 사용하지 않으며 Native backend 조회를 추가하지 않는다.

기존 SDK05/Native의 단일 load·insert3·undo1(epoch2..6) 대조에서 중간 관측을 생략한 경로는 rebase2, observe 연결 경로는 rebase1이었다. owner generation 갱신과 prepare 전 비활성 상태를 확인했지만 이는 별도 실제 Native 소비자 검사다. 운영 Canvas·브라우저 cache hit·지연·전체 조판 성과가 아니다. 관측 경로의 전이 처리와 기존 prepare 비용은 남으며 rebase 감소만으로 속도 개선을 추정하지 않는다.

정규 선택은 기존94+새 관측6=100이며 최종 canonical 반복 실행에서100pass·0fail·0skip을 확인했다. 정확3파일 format 및 no-ignore/debugfiles 선택 oxlint도 종료0이며 새 source 변경은 없다. 이전 실행 수를 반복 합산하지 않는다.

전체 페이지 메모·셀 라우팅 인덱스·추가 frame coalescing 실험은 채택하지 않았다. 이 변경은 source 관측과 측정 준비의 분리에 한정한다.

새 ADDA4 비교는 사전 primary 기준을 통과했다. 같은 workload의 host undo 시작 DOM 관측은 기준324.7/325.3ms, 수정 후316.6/297.9ms이며 대응 pair 감소율은2.4946%/8.4230%다. 각 변형 n2·한 cohort의 중앙값은 기준325/수정 후307.25ms로5.46154% 감소해 양 pair 개선과 중앙값 감소5% 이상 기준을 충족했다. 통계적 유의성이나 모든 문서의 일반 성능을 증명한 것은 아니다. 기존 cohort·QA 계측 표본은 합산하지 않았다.

paint는 pair별+1.7186%/−2.7552%로 방향이 엇갈렸고 중앙값 감소는0.5243%뿐이다. 이 marker는 B80 입력까지 포함할 수 있어 undo-only paint latency 개선으로 주장하지 않는다. primary도 host DOM callback 관측이며 Native 발급/ACK 시각이나 첫 파일 열기 성능이 아니다. DOM/CDP 관측 비용과 외부 부하의 한계는 유지한다.

source100의 최종 실행과 Native 연속성·ADDA4는 각각 별도 증거다. 운영 반영은 별도로 확인하며 source 통과와 제한된 지연 개선을 배포 완료로 읽지 않는다.
