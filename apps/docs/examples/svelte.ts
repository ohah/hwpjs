import { mount, unmount } from "svelte";
import { CanvasEditor, type CanvasSurface } from "@ohah/hwpjs/svelte";
import type { HeadlessEditor } from "@ohah/hwpjs";

// Svelte 컴포넌트를 JS/TS 진입점에서 마운트하는 공식 public export 사용 예입니다.
export function mountSvelteDocument(root: HTMLElement, editor: HeadlessEditor) {
  let surface: CanvasSurface | undefined;
  const component = mount(CanvasEditor, {
    target: root,
    props: {
      editor,
      style: "height:70vh",
      onReady(value: CanvasSurface) {
        surface = value;
      },
      onError: console.error,
    },
  });
  return {
    focus: () => surface?.focus() ?? false,
    dispose: () => unmount(component),
  };
}
