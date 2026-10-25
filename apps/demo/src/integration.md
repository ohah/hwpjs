# Demo shell 인계 — UI 담당

`createDemoShell(root, options)`는 독립 UI factory다. CSS는 진입점에서 `shell.css`를 불러온다. public core/vanilla/React/Svelte를 실제 사용하는 app entry·라우트·build·server는 주 에이전트 소유다. shell import는 DOM을 만들지 않는다. 원본 web/preview, js, src, root manifest 및 indent candidate는 이 구현에서 변경하지 않았다.

## 주입 계약

타입은 `shell-contract.ts`가 소유한다. 이는 **UI 전용 presentation/intent 타입**이며 core 명령·상태 계약을 재정의하는 package public barrel이 아니다.

- `framework`: headless / vanilla / react / svelte. RN은 웹 데모에 넣지 않는다.
- `routes`: 위 네 실제 페이지의 same-origin 절대 경로. 가짜 `#` 링크를 허용하지 않는다. 라우트·실제 framework package mounting은 진입점이 구현한다. 기존 `/web/preview/index.html` 호환 경로도 진입점/server 담당이다.
- `fixtures`: 기존 `web/preview/fixture-catalog.mjs`의 allowlisted `demoFixtures`를 전달한다. id/name/label만 UI에서 사용한다. catalog를 복사하거나 파일 경로를 해석하지 않는다.
- `getState()`: 현재 core/host 관측값에서 title/status/busy/pageLabel/selectionLabel/fontName/fontSizePoints/styleLabel/zoomPercent와 actions availability를 투영한다. UI는 snapshot/문서/selection을 복제·변경·낙관적으로 갱신하지 않는다.
- `onAction(action)`: `DemoAction` discriminated union. 일반 command 또는 `{command:'set-font-size', points}` / `{command:'set-zoom', percent}`다. callback에서 **public** editor/host API로 변환하고 core selection token·revision·capability·IME commit을 다시 검증한다. DOM focus 이동 전후 마지막 유효 선택 처리는 host/core 계약을 따른다. callback resolve는 UI가 native 적용 성공으로 표시하는 근거가 아니다. 성공 상태는 state listener가 전달한다.
- `onOpenFile(file)`: 실제 선택된 File을 전달한다. 동일 파일 재선택을 위해 input.value는 지운다. 바이트 읽기·형식 검출·runtime loading은 진입점 책임이다.
- `onOpenFixture(id)`: allowlist id만 전달한다. 실제 fetch/timeout/abort/빠른 문서 교체·세대 처리는 공통 load 경로가 담당한다. shell은 fetch를 실행하지 않는다.
- `onError(error)`: 동기 throw/비동기 reject 보고. 오류를 성공으로 표시하지 않는다. dispose 후 늦은 오류는 detached UI에 발행하지 않는다. 원본 오류를 UI text나 callback trace로 자동 stringify하지 않는다.

capability가 없거나 callback이 연결되지 않으면 버튼을 비활성화한다. reason은 title/aria-describedby 및 키보드로 열 수 있는 ‘도구 지원 안내’에 제공한다. 주입 callback 자체는 연결되었어도 해당 명령 bridge가 없으면 actions[id].enabled를 true로 주지 않아야 한다. unsupported인데 동작 없는 callback을 연결하지 않는다.

서식바 크기는 pt UI draft다. host textarea를 controlled input으로 만들지 않는다. 선택/문서 교체 시 bridge는 `update({resetFormatDraft:true})`를 호출해 focus 중인 서식 초안도 새 관측값으로 되돌린다. bridge/core는 명령 시 selection token을 재검증한다. shell이 표시하는 숫자를 native resource ID/원값으로 해석하지 않는다.

## surface·수명

반환값:

- `element`: shell이 소유하는 루트.
- `surfaceMount`: canvas framework의 실제 public host 장착 영역. headless면 null. shell은 Canvas/textarea/Worker/WASM/JSI를 만들지 않는다.
- `headlessMount`: headless 실제 core command 예제 form을 진입점이 장착할 영역. 다른 framework면 null.
- `update({resetFormatDraft?:boolean})`: core state/update/host view 구독에서 호출. 기존 host 하위 DOM은 재조정하지 않는다.
- `setTrace(entries)`: 이미 비밀을 제거한 `{event,detail}` 문자열 배열을 받는다. 최근100개만 text node로 출력한다. trace 수집·redaction은 진입점 책임이다.
- `destroy()`: 반복 안전한 terminal 정리. shell DOM과 자신의 listener만 정리한다. 주입 editor를 dispose하지 않는다. 진입점이 먼저 자기 host lease와 구독을 해제한 뒤 호출한다. StrictMode cleanup 후 이 객체를 재사용하지 않는다.

임의 상태를 복제하지 않으며 현재 예제 화면에 관한 DOM open/draft 상태만 소유한다. 고유 ID와 root/element 참조를 사용하고 전역 document.querySelector를 쓰지 않는다. 실제 multi-surface/IME/StrictMode 보장은 공유 host 및 framework 담당의 후속 E2E 대상이다.

## Reference·검증 범위

공개 reference의 `public-root.png`, `browser-state.json`, `manifest.json` 및 `webhwp.xml`을 읽었다. 1440×1000/ko의 실제 화면에서 제목·메뉴·큰 도구 모음·별도 서식바·눈금자·상태바 구조를 참고했다. 문서 주소 오류 modal/dimmer를 복제하지 않았다. XML manifest는 구조 inventory이며 browser-state의 한국어/viewport 관측과 구분했다. computed style 값은 이 자료에 없으므로 추출했다고 주장하지 않는다. white/gray/blue CSS와 문자 기호는 독립 작성했고 원본 코드/스타일/아이콘/폰트를 구현 자산으로 복사하지 않았다.

실행 가능한 가벼운 검증:

```
node --test apps/demo/tests/shell.test.mjs
bun test apps/demo/tests/shell.test.mjs
tsc --noEmit --strict --target ES2022 --module ESNext --moduleResolution bundler --allowImportingTsExtensions --lib ES2022,DOM apps/demo/src/shell-contract.ts apps/demo/src/shell-model.ts apps/demo/src/shell.ts
```

테스트는 dependency 없는 최소 DOM event fixture다. SSR import·callback 허용/거부·pt draft 검증·root isolation·terminal cleanup·오류·trace text escaping을 검사한다. 실제 DOM/CSS/layout/IME/접근성·React/Svelte SSR hydration·실제 Canvas·native 저장·tailnet 라우트·fixture 제공 성공의 증거가 아니다. 브라우저/서버는 이번 담당에서 새로 실행하지 않았다. 통합 후 실제 HWP5/HWPX E2E가 필요하다.

추가 runtime npm dependency는 없다. DOM 타입을 포함한 TypeScript 개발 도구 및 CSS 번들 연결만 진입점 설정에서 필요하다. core/vanilla/framework 패키지 dependency와 fixture route 제공은 주 에이전트가 관리한다.
