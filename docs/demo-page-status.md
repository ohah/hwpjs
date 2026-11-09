# 데모 쪽 상태

`docs/webhwp-gap-audit.md`의 쪽 상태 gap은 작업 전 소스에도 남아 있었다. `demo-controller.ts`는 ready일 때 `pageLabel: '문서 열림'`만 전달했고, shell은 문자열 또는 `쪽 정보 없음`을 표시했다. 이 작업은 controller의 투영과 framework host 연결, 기존 vanilla Surface의 읽기 전용 관측만 변경한다. Core·Native·renderer 구현·원본 문서 필드는 변경하지 않는다.

## 표시 의미

- `미리보기 2 / 5쪽`: 현재 미리보기의 가시 쪽 순번과 측정된 전체 미리보기 쪽 수다. 가시 쪽은 세로 viewport와 교차하는 첫 용지이며, 여러 용지가 보이면 앞 용지를 선택한다.
- `부분 미리보기 내 2쪽 · 전체 쪽수 미확인`: limited 콘텐츠 또는 paragraph-window fragment 안의 로컬 순번이다. 부분 배치의 페이지 배열 길이를 전체 문서 쪽 수로 사용하지 않는다.
- 쪽 사이 빈 공간에 viewport 전체가 놓이면 현재 쪽은 `미확인`이다. 관측되지 않은 값에 1을 넣거나 근접 쪽으로 보정하지 않는다.
- 원본 쪽 번호(시작 번호·새 번호·구역별 번호)는 표시하지 않는다. 캐럿 쪽도 가시 쪽과 별개이며 이 기능의 관측값이 아니다. 미리보기 배치와 원본 한글 조판이 같다는 보증은 없다.

## 관측과 수명

Surface의 `getPageStatus()`는 `{ current, total, partial }` 또는 `null`을 반환한다. mutable layout/문서 모델은 반환하지 않는다. 기존 renderer의 `paintedFrame()`과 `isPaintedFrameCurrent()`를 재사용하며, 새 측정이나 `layout()` flush를 일으키지 않는다. 같은 painted frame·viewport 위치·높이에서는 용지 순회 결과를 재사용한다. 새 frame이 게시되면 같은 layout 객체가 재사용되어도 관측을 재계산한다.

세로 용지 좌표는 renderer와 동일하게 `scrollTop / scale`, viewport 높이는 `clientHeight / scale`로 해석한다. Surface stage는 가로 margin만 적용하며 세로 원점을 추가하지 않는다. Renderer의 scroll listener는 paint를 예약하고, paint도 기존 `onLayout`을 호출하므로 순수 scroll에 재조판 없이 알림이 연결된다. 이 소스 근거는 실제 브라우저 page 2/3 검증을 대신하지 않는다.

현재 문서·generation·operation/view revision에 연결된 표시만 허용한다. inactive lease, unpainted/deferred/stale frame, non-ready 상태 또는 disposed Surface는 `null`이다. disposed Surface는 Core를 읽지 않는다. Controller는 non-ready·busy·closed일 때 관측을 읽지 않고 빈 pageLabel을 전달하여 기존 shell의 `쪽 정보 없음`을 표시한다. 교체 후 새 프레임이 없으면 이전 숫자를 재사용하지 않는다.

`subscribePageStatus()`는 layout/paint 이후 microtask에서 scalar 값이 바뀔 때만 알린다. 반복 paint는 같은 숫자를 중복 통지하지 않는다. 알림은 listener snapshot을 순회하여 동기 재구독을 같은 알림에서 반복 실행하지 않는다. unsubscribe와 Surface dispose는 구독을 정리한다.

React/Svelte는 늦은 onReady와 StrictMode 재마운트를 relay로 연결한다. 교체 시 이전 Surface 구독을 해제한다. relay dispose는 terminal이며 이후 connect/subscribe는 구독·읽기·알림을 만들지 않는다. Surface 기능이 없는 host와 headless는 쪽 숫자를 추정하지 않는다.

## 집중 검증

실행 명령의 단일 출처는 [개발·검증 명령](development-commands.md#canvas-미리보기-쪽-상태)입니다.

최종 집중 검사는 14pass·0fail·0skip이며 명시 lint와 format 검사는 각각 종료 0이다. Surface·controller·relay의 순수 양성/음성 검사이며 실제 브라우저 근거와 합산하지 않는다.

증거 위치: `zig-out/verification/demo-page-status-r1/`. fake Core/renderer/DOM의 집중 검증은 실제 Canvas 브라우저·Native·배포 성공을 뜻하지 않는다. 최초 실행의 환경변수 누락 실패는 `focused-tests-initial.log`에 보존한다.

## 실제 SDK·브라우저 검증

격리 소스의 production 4개가 `production-freeze.json`과 root 소스에 정확히 일치함을 확인한 뒤, 새 Native 38c4를 포함하는 private SDK 119개 파일을 생성했습니다. strict SDK declaration 빌드도 통과했습니다. 최초 빌드의 visiblePageCache undefined narrowing 오류(TS18048)는 명시적 부재 검사로 수정했고 실패 로그를 보존했습니다. Node type-erasure 테스트와 별개의 검증입니다.

Private Vite 서버와 이 SDK로 실제 Vanilla·React·Svelte UI를 각각 검사했습니다. Noori HWPX 파일 열기에서 `미리보기 1 / 3쪽`, viewport 1500px 스크롤 후 `2 / 3쪽`, 150% 확대 후 `2 / 3쪽`, HWP로 교체하면 `1 / 3쪽`을 확인했습니다. 실제 새 문서 대화상자의 만들기를 눌러 새 HWPX의 `1 / 1쪽`으로 초기화되는 것도 세 프레임워크 모두 확인했습니다. 대화상자 대기 중에는 이전 숫자를 숨깁니다. 전용 Canvas viewport와 실제 UI 이벤트를 사용했으며 제품 내부 API로 쪽수나 scroll 상태를 강제로 바꾸지 않았습니다.

3개 UI 모두 page error와 console error는 없었습니다. 이 검사는 쪽 상태 연결과 수명 검증이며 원본 한글의 조판·쪽 번호 동치, 모든 fixture, RN, 전체 편집·저장 검사는 아닙니다. partial/window의 음성 조건은 집중 검사에서 확인했고 실제 브라우저의 대형 window 문서 검증으로 부르지 않습니다.

최초 private 서버는 개발 모드가 요구하는 `/hwpjs` 자원 경로를 제공하지 않아 InvalidWasmArtifact로 실패했습니다. 이후 probe의 정규식 escape 오류와 모호한 새 문서 버튼 selector도 바로잡았습니다. 해당 시도는 최종 성공 코호트에 포함하지 않습니다. 마지막 `browser/e2e-r4/summary.json`과 프레임워크별 snapshot·state·reset·스크린샷, `browser/final-verification.json`을 근거로 사용합니다. `*-scrolled.png`는 reset 뒤 촬영된 파일이어서 정확한 이름의 `*-reset.png` 사본을 별도로 남겼으며 스크롤 화면 증거로 사용하지 않습니다.

전용 browser session의 inactive 상태와 전체 session 목록이 비었음을 확인했습니다. private Vite 서버도 종료했고 canonical dist·node_modules 링크·기존 서버·live assets는 수정하지 않았습니다. npm 게시·main 푸시·배포는 하지 않았습니다.

## 변경 증거

Production 4개와 별도 테스트 3개, 이 문서만 이 작업 소유다. 변경 전 별도 preimage 캡처는 하지 못했다. 처음 기록한 git status에서 clean이었던 세 기존 소스의 HEAD를 편집 후 복원했으며, 그 경위와 기준 HEAD는 `preimage-provenance.json`에 있다. 신규 파일의 preimage는 부재다. `production.patch`와 `sanitized.patch`는 이 소유 파일만 포함하며 기존 사용자 WIP는 포함하지 않는다. 로컬 커밋은 검증 후 진행하며 푸시·npm 게시·배포는 수행하지 않는다.
