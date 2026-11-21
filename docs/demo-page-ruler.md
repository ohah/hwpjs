# 페이지별 용지 자

페이지 상단 자는 현재 **가시 미리보기 쪽**의 용지와 본문 영역을 읽기 전용으로 표시한다. 문단 들여쓰기나 탭을 편집하는 핸들은 제공하지 않는다. 제한된 미리보기에는 부분 범위임을 표시하며 원본 쪽 번호나 캐럿 쪽으로 간주하지 않는다.

## 지오메트리 단일 출처

Vanilla Surface의 `getPageGeometry()`는 실제 viewport와 가로·세로 모두 양의 면적으로 교차하는 첫 용지를 `getPageStatus()`로 선택한 현재 painted frame의 `paper`와 `page` 사각형을 복사·동결해 반환한다. 현재 문서·세대·revision과 활성 lease를 검증한다. Renderer는 이미 그린 프레임의 조판 세대와 문서 소유권이 유지되는 동안 페이지 지오메트리를 제공한다. 새 문서 파싱, 조판 flush, A4 기본값 또는 뷰포트 너비로 용지 크기를 추정하지 않는다.

`paperLeft`는 실제 stage의 화면 좌표에 기존 용지 x와 확대율을 적용한 값이다. 가로 스크롤, stage 중앙 정렬, 고전식 스크롤바와 오른쪽 패널을 포함한 실제 host 크기를 그대로 따른다. 클립 폭은 스크롤바를 제외한 viewport의 `clientWidth`다. 용지별 폭·방향과 좌우 본문 여백은 해당 페이지의 사각형에서 파생한다. mm/cm는 기존 HWP 단위의 CSS 픽셀 변환을 사용한다. 제본·맞쪽·가로 구역은 이미 계산된 compositor 사각형을 재사용한다.

0 너비·높이의 숨김 host, 쪽 사이 공백이나 가로로 용지가 완전히 사라진 구간, 이전 조판 세대의 프레임, loading/disposed 상태에서는 지오메트리를 반환하지 않는다. 자는 유효하지 않은 눈금을 숨기면서 자신의 행 높이를 유지한다. 행을 접어 스크롤 앵커를 이동시키지 않는다. 실제 재표시 뒤 ResizeObserver/paint 알림으로 새 값을 읽는다.

## 책임과 수명

- `packages/vanilla/src/page-geometry.ts`: 불변 페이지 관측과 화면 좌표 투영 검증.
- `apps/demo/src/page-ruler-model.ts`: 물리 단위 눈금·여백·용지 설명 계산.
- `apps/demo/src/page-ruler.ts`, `page-ruler.css`: DOM 표시, 프레임 단위 갱신과 이벤트/observer 정리.
- Shell은 mount만 제공한다. Demo controller는 host 연결 뒤 자를 연결하고 dispose한다. React/Svelte는 기존 페이지 상태 relay를 통해 같은 관측을 전달한다.

`subscribePageStatus()`는 쪽 번호뿐 아니라 페이지 지오메트리가 바뀌어도 알린다. 현재 쪽 캐시는 실제 stage 원점으로 환산한 가로 구간과 뷰포트 폭도 비교한다. 용지 경계와 맞닿기만 하는 경우는 교차로 보지 않는다. 같은 세로 구간에서 가로 스크롤만 바뀌어도 보이는 쪽이 달라질 수 있다.

Core의 loading/empty/refresh-required/disposed, 새 revision의 아직 게시되지 않은 frame, lease 취소는 repaint 없이도 무효화 알림을 전달한다. Surface dispose는 getter가 null을 반환하도록 닫은 뒤 구독 정리 전에 최종 알림을 보낸다. 유지된 ruler/relay는 교체 Surface가 오지 않아도 이전 용지를 숨기고 쪽 dataset과 설명도 비운다. relay dispose 역시 최종 무효화를 알리며, 이전 Surface의 늦은 알림은 새 연결로 전달하지 않는다. observer 오류가 다른 observer나 lease 정리를 막지 않으며 재진입 dispose는 같은 Promise를 돌려준다.

Vanilla의 공개 `CanvasPageGeometry`와 `CanvasPageStatus`는 읽기 전용 관측 타입이다. React/Svelte Surface 타입에도 getter와 nullable 계약을 그대로 전달한다. 가로 스크롤·resize는 자 컨트롤러도 관측하며 repaint 뒤의 알림에서 최종 지오메트리를 다시 읽는다. 스크롤만 바뀌면 다음 Canvas repaint 전에 현재 viewport로 보이는 쪽을 계산한다. 같은 쪽에서는 눈금 노드를 유지하며, 다른 크기의 쪽에 도달하면 새 눈금을 표시한다. 개체를 클릭하는 경로는 현재 스크롤까지 일치하는 Canvas 프레임을 계속 요구한다. dispose는 예약 프레임, 구독, scroll/resize 이벤트와 ResizeObserver를 해제한다.

## 복구 원인과 검증

`756611a1d`의 데모 자는 정적 0~18 장식이었다. `499d73c85`가 추가한 `editor-layout.css`의 `#app .hwp-demo-ruler { display: none; }`이 HEAD `65e370697994638b091a97687abf1e3c0e1d419d`에서도 해당 요소를 숨겼다. 실제 브라우저의 원래 HEAD bundle에서 DOM 존재와 computed display none을 확인했다. 복구는 고정 폭/정적 눈금을 제거하고 현재 페이지의 관측을 연결한다.

집중 검증:

```sh
node --test apps/demo/tests/page-ruler.test.mjs apps/demo/tests/page-ruler-surface.test.mjs apps/demo/tests/page-ruler-lifetime.test.mjs apps/demo/tests/page-status.test.mjs packages/vanilla/tests/page-frame.test.ts
bun x --no-install tsc -p tools/tsconfig.page-ruler.json
```

집중 검사는 50~200% 물리 눈금, 비대칭 여백, 혼합 방향, 가로 이동, 숨김 host 복귀, 폐기·stale 거부 및 구독 정리를 다룬다. Surface/Core 경계는 통제된 mock이다. `page-status-surface.test.mjs`는 실제 Surface를 사용해 중복 통지를 거르고 폐기 시 마지막 `null`을 한 번 전달하는지 확인한다.

실제 로컬 producer는 공개 a66a15318385b04e0c3f150f8882d0598396918e0e160d43c939698dd424efe9 WASM을 재사용한다. 원본 Noori HWP/HWPX 및 사용자가 승인한 자산관리규정 HWPX의 로컬 브라우저 증거는 별도 OWN 패킷의 기록을 따른다. 새 Native 빌드, 루트 WIP 변경, 공개 배포와 npm 게시 증거가 아니다.

## successor 검증 범위

frozen ruler17/HEAD `65e3706`에서 소유 17파일을 이어받고 통합 수명 회귀와 공개 API 타입 검사 파일을 추가했다. 소스 통제 검사는 실제 Surface/ruler/relay와 통제된 renderer/Core/DOM을 사용한다. 50~200%의 혼합 방향 2D 교차, 가로 cache 변경, 양 축의 공백/경계, 부분 범위, repaint 없는 무효화와 Core detach hook, Surface만 폐기/교체/교체 실패, observer 오류와 재진입 dispose를 포함한다. 타입 검사는 후보 Vanilla 공개 source entry에 직접 연결하며 nullable·불변·React/Svelte 전파와 any 누출을 검사한다. noEmit 및 패키지 선언 빌드와 같은 allowJs=false 경계를 사용하고 새 패키지를 빌드하지 않는다.

## 로컬 브라우저 실측

공식 데모 빌드에서 세로·가로 용지가 섞이고 좌우 여백이 다른 HWPX를 열어, 50~200% 확대와 좁은 뷰포트의 가로 이동을 확인했다. 눈금자의 시작점은 Canvas에 그린 용지 왼쪽과 일치했고, 눈금 간격·여백 폭·용지 크기 표시는 원본 치수에 맞았다. 표시 쪽을 바꾸면 방향과 눈금 길이도 바뀌었다.

검증은 스크롤 위치를 직접 설정한 뒤 실제 스크롤 이벤트와 화면 갱신을 관찰했다. 물리 휠 입력과 공개 배포의 확인은 별도 범위다.
