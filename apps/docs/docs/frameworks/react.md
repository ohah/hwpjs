# React

```sh
npm install @ohah/hwpjs@0.1.0 react@19.3.1 react-dom@19.3.1
```

먼저 [웹 Worker·WASM 배치](../guide/installation.md#웹에서-worker와-wasm-제공)를 진행하세요. <a href="__HWPJS_DOCS_BASE__editor/demo/react/">이 프레임워크의 실행 데모</a>에서 HWP·HWPX 파일을 직접 열 수 있습니다.


React 어댑터는 외부에서 소유한 `HeadlessEditor`를 받아 Canvas 호스트만 관리합니다. 예제는 공개 패키지 0.1.0과 React 19.3.1을 사용합니다.

<!-- example:react.tsx -->
```tsx
import { CanvasSurface, useEditorState } from '@ohah/hwpjs/react';
import type { HeadlessEditor } from '@ohah/hwpjs';

// editor의 생성·load·save·dispose는 부모 앱이 소유합니다.
export function DocumentPane({ editor }: { editor: HeadlessEditor }) {
  const state = useEditorState(editor);
  return (
    <section aria-label="문서 편집">
      <p role="status">{state.status}</p>
      <div style={{ height: '70vh' }}>
        <CanvasSurface editor={editor} onError={console.error} />
      </div>
    </section>
  );
}
```

부모 앱은 [Runtime helper](../guide/runtime.md)로 editor를 만들고, 파일 bytes를 load한 뒤 `DocumentPane`에 전달합니다. React 렌더마다 새 editor를 만들지 마세요. 한 editor를 여러 surface에 동시에 연결하지 않습니다. `environment` 객체를 전달할 때는 identity를 안정적으로 유지하세요.

`CanvasSurface`/`useCanvasSurface`는 effect에서 surface를 생성하고 분리합니다. editor 자체를 load하거나 dispose하지 않으므로 최종 소유자인 부모가 종료해야 합니다. StrictMode의 재마운트를 고려해 자원 생성과 정리를 짝지으세요. `useEditorState`는 현재 상태를 구독합니다. async mutation을 render나 `editor.read()` 콜백 안에서 실행하지 않습니다.

`ref`를 쓰면 CanvasSurfaceHandle의 focus/scale/selection/flushComposition에 접근할 수 있습니다. 이는 문서의 typed 명령 전체를 대신하는 API가 아닙니다. SSR에서는 빈 호스트가 렌더링되고 실제 Canvas/Worker는 클라이언트 수명에서 준비합니다.
