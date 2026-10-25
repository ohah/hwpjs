# Svelte

`@hwpjs/svelte`는 `CanvasEditor` 컴포넌트와 `canvasSurface` action을 공개합니다. 현재 workspace는 Svelte 5.57.2입니다. 아래는 실제 데모와 같은 `mount` 경계의 TypeScript 예제이며, 제품 컴포넌트의 public export 타입으로 검사합니다.

<!-- example:svelte.ts -->
```ts
import { mount, unmount } from 'svelte';
import { CanvasEditor, type CanvasSurface } from '@hwpjs/svelte';
import type { HeadlessEditor } from '@hwpjs/core';

// Svelte 컴포넌트를 JS/TS 진입점에서 마운트하는 공식 public export 사용 예입니다.
export function mountSvelteDocument(root: HTMLElement, editor: HeadlessEditor) {
  let surface: CanvasSurface | undefined;
  const component = mount(CanvasEditor, {
    target: root,
    props: {
      editor,
      style: 'height:70vh',
      onReady(value: CanvasSurface) { surface = value; },
      onError: console.error,
    },
  });
  return {
    focus: () => surface?.focus() ?? false,
    dispose: () => unmount(component),
  };
}
```

부모 앱이 editor의 생성·문서 열기·저장을 소유하고 위 함수에 전달합니다. 반환된 dispose는 Svelte 컴포넌트를 unmount합니다. 컴포넌트 분리 후 editor 소유자가 `await editor.dispose()`를 수행하세요. 한 editor에 동시에 여러 CanvasEditor를 마운트하지 않습니다.

Svelte 템플릿 안에서도 CanvasEditor를 사용할 수 있습니다. 이 페이지는 별도 미검증 템플릿을 중복 제공하지 않고 타입 검사하는 TS 진입점 예제만 제공합니다. 서버 export와 브라우저 export가 분리되어 있어 SSR 모듈 평가 시 DOM 호스트를 만들지 않습니다. 실제 Canvas 생성은 클라이언트 마운트 이후입니다.
