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
