# React adapter 인계

공개 barrel: `packages/react/src/index.ts`.
생산 코드의 cross-package import는 `@hwpjs/core`(type) 및 `@hwpjs/vanilla`(createCanvasSurface)뿐이다. manifest/lock/다른 패키지/기존 web UI/indent candidate는 이 담당에서 수정하지 않았다.

## main app entry 연결

```tsx
import { CanvasSurface, type CanvasSurfaceHandle } from '@hwpjs/react';

// editor is externally owned and is never disposed by this component.
// The surrounding shell's container must also have a definite height.
<CanvasSurface
  editor={editor}
  ref={surfaceRef}
  aria-label="문서 편집 영역"
  onStatus={message => presentStatus(message)}
  onReady={surface => { /* public surface API only */ }}
  onError={error => presentError(error)}
/>
```

props: editor(필수), environment, onStatus, onReady, onError, 일반 div 속성/className/style. host div의 height:100%, min-height:0은 wrapper가 보장한다. children/dangerouslySetInnerHTML은 타입에서 제외하고 JS 소비자에게도 제거한다. React는 host div만, vanilla는 그 하위 DOM 전체를 소유한다.

`CanvasSurfaceHandle`은 element/surface getter와 focus/setScale/getSelection/flushComposition을 제공한다. surface는 effect setup 완료 전과 teardown/drain 중 null이다. onReady에서 실제 준비를 관측하며 ref가 생겼다는 것만으로 Canvas가 준비됐다고 판정하지 않는다. DOM root detach 때 handle의 surface를 즉시 비워 오래된 host로 명령하지 않는다.

`useCanvasSurface(options)`는 직접 host 요소에 붙일 mountRef와 같은 handle을 반환한다. 한 root에 연결하며 root 교체 시 effect 수명으로 정리/재장착한다. `useEditorState(editor)`는 registerStateListener/getEditorState와 useSyncExternalStore를 사용한다. server snapshot도 editor의 안정된 관측값을 읽으며 import/render 중 editor/Worker/DOM을 만들지 않는다.

## 수명과 callback

- editor는 외부 소유다. load/save/dispose를 wrapper가 대신하지 않는다.
- editor/environment identity 변경 시 old surface.dispose Promise가 완료된 뒤 새 surface를 만든다. callback-only 변경은 surface를 재생성하지 않는다. environment 객체는 소비자가 memoize한다.
- 최신 callback은 commit된 effect에서만 설치한다. 중단된 render가 활성 callback을 덮지 않는다. callback 교체가 새 onReady 호출을 의미하지 않으며 onReady는 실제 surface setup당 한 번이다.
- StrictMode cleanup 뒤 terminal surface는 재사용하지 않는다. setup할 때마다 createCanvasSurface를 다시 호출한다. callback-ref root state가 처음 반영되기 전에는 surface가 없으므로 실제 StrictMode 초기 replay의 surface 생성 횟수를 고정하지 않는다.
- 빠른 A→B→C 교체에서 disposal을 기다리던 B는 생략한다. 기다리는 중 unmount되면 mount하지 않는다. dispose 실패는 해당 hook 수명의 재장착을 막고 onError로 보고한다. 이미 unmount된 UI에는 늦은 status/error를 발행하지 않는다. native 요청 오류의 권위는 editor error channel이다.
- onReady/onStatus/onError는 Promise를 반환할 수 있다. onReady 실패는 만든 surface를 정리한다. status callback 실패는 onError에 보고하며 onError 자체 실패는 재귀 통지하지 않는다.

## 검사와 한계

`bun test packages/react/tests` — 현재 14/14.

실제 React/ReactDOM 개발 renderer와 최소 DOM host fixture를 사용한다. surface port는 lifecycle 테스트에서 주입 대역이다. StrictMode mount·cleanup·외부 editor 재사용, ref/callback, editor/environment 교체, 지연 dispose·중간 setup 생략·unmount·실패, 비동기 callback 오류, snapshot identity/구독 교체, host DOM 단독 소유를 검사한다.

별도 프로세스 SSR 검사는 module mock 없이 실제 vanilla 공개 source entry와 React 서버 renderer를 import한다. source workspace의 public 이름만 테스트 resolver로 public entry에 연결한다. window/document/ResizeObserver 없이 Worker/fetch를 만들지 않고 SSR host를 출력한다. 이것은 외부 tarball/배포 조건 검사의 대체가 아니다.

타입 검사:

```
node_modules/.bin/tsc --ignoreConfig --noEmit --strict --target ES2023 --module ESNext --moduleResolution Bundler --allowImportingTsExtensions --lib ES2023,DOM --skipLibCheck packages/react/src/index.ts
```

실제 브라우저 Canvas paint/hit-test/한글 IME/selection/저장·재열기·hydration·tailnet 페이지 E2E는 main 후속이며 이번 단위 결과로 완료 주장하지 않는다. 새 browser/server/native build는 실행하지 않았다. runtime dependency 추가는 기존 React/vanilla/core 이외에 없다. lifecycle 테스트는 이미 설치된 react-dom과 Bun runner를 사용한다.
