import { test } from "node:test";
import assert from "node:assert/strict";
import { CanvasEditor, canvasSurface } from "@hwpjs/svelte";
import { render } from "svelte/server";

test("built public default export selects server component and performs no DOM/editor work", () => {
  assert.equal(typeof globalThis.document, "undefined");
  const editor = new Proxy(
    {},
    {
      get() {
        throw Error("EditorTouchedDuringSSR");
      },
    },
  ) as any;
  const result = render(CanvasEditor, {
    props: {
      editor,
      "aria-label": "public SSR",
      onReady() {
        throw Error("SurfaceMountedOnServer");
      },
    },
  });
  assert.match(result.body, /aria-label="public SSR"/);
  assert.doesNotMatch(result.body, /<canvas|<textarea/);
  assert.equal(typeof canvasSurface, "function");
  assert.equal(typeof globalThis.document, "undefined");
});
