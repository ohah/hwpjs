import { test } from "node:test";
import assert from "node:assert/strict";
import { createSurfaceLifecycle } from "../src/lifecycle.ts";
import type { CanvasSurface, CanvasSurfaceProps } from "../src/types.ts";
const editor = () =>
  ({
    dispose() {
      throw Error("ExternalEditorDisposed");
    },
  }) as unknown as CanvasSurfaceProps["editor"];
const surface = (dispose: () => Promise<void> = async () => {}) =>
  ({
    dispose,
    focus() {},
    setScale: () => true,
    getSelection: () => null,
    flushComposition: async () => "unchanged" as const,
  }) satisfies CanvasSurface;
const turn = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

test("callback update retains surface and uses newest callback", async () => {
  const messages: string[] = [],
    ready: string[] = [];
  let creates = 0,
    options: any;
  const life = createSurfaceLifecycle({} as HTMLElement, (o) => {
    creates++;
    options = o;
    o.onStatus?.("mount");
    return surface();
  });
  const e = editor();
  life.update({
    editor: e,
    onStatus: (m) => messages.push("old:" + m),
    onReady: () => ready.push("old"),
  });
  await life.settled();
  life.update({
    editor: e,
    onStatus: (m) => messages.push("new:" + m),
    onReady: () => ready.push("new"),
  });
  await life.settled();
  options.onStatus("changed");
  assert.equal(creates, 1);
  assert.deepEqual(messages, ["old:mount", "new:changed"]);
  assert.deepEqual(ready, ["old"]);
  await life.destroy();
});
test("editor replacement waits for old async dispose; rapid replacement skips intermediate editor", async () => {
  const events: string[] = [];
  let release!: () => void;
  const a = editor(),
    b = editor(),
    c = editor();
  const life = createSurfaceLifecycle({} as HTMLElement, (o) => {
    events.push(o.editor === a ? "a" : o.editor === b ? "b" : "c");
    return surface(
      o.editor === a
        ? () => {
            events.push("dispose-a");
            return new Promise((r) => (release = r));
          }
        : async () => {
            events.push("dispose-c");
          },
    );
  });
  life.update({ editor: a });
  await life.settled();
  life.update({ editor: b });
  await turn();
  life.update({ editor: c });
  assert.deepEqual(events, ["a", "dispose-a"]);
  release();
  await life.settled();
  assert.deepEqual(events, ["a", "dispose-a", "c"]);
  await life.destroy();
  await life.destroy();
  assert.deepEqual(events, ["a", "dispose-a", "c", "dispose-c"]);
});
test("unmount while factory resolves disposes late surface without ready callback", async () => {
  let resolve!: (s: CanvasSurface) => void,
    disposed = 0,
    ready = 0;
  const life = createSurfaceLifecycle({} as HTMLElement, () => new Promise((r) => (resolve = r)));
  life.update({ editor: editor(), onReady: () => ready++ });
  await turn();
  const done = life.destroy();
  resolve(
    surface(async () => {
      disposed++;
    }),
  );
  await done;
  assert.equal(disposed, 1);
  assert.equal(ready, 0);
  assert.equal(life.getSurface(), undefined);
});
test("failed disposal reports error and blocks overlapping replacement", async () => {
  let creates = 0;
  const errors: unknown[] = [];
  const life = createSurfaceLifecycle({} as HTMLElement, () => {
    creates++;
    return surface(async () => {
      throw Error("DisposeFailed");
    });
  });
  life.update({ editor: editor(), onError: (e) => errors.push(e) });
  await life.settled();
  life.update({ editor: editor(), onError: (e) => errors.push(e) });
  await life.settled();
  life.update({ editor: editor(), onError: (e) => errors.push(e) });
  await life.settled();
  assert.equal(creates, 1);
  assert.equal(errors.length, 1);
  await life.destroy();
});
test("separate roots have independent lifecycle and external editors remain owned by caller", async () => {
  const one = createSurfaceLifecycle({} as HTMLElement, () => surface()),
    two = createSurfaceLifecycle({} as HTMLElement, () => surface());
  one.update({ editor: editor() });
  two.update({ editor: editor() });
  await Promise.all([one.settled(), two.settled()]);
  await one.destroy();
  assert.ok(two.getSurface());
  await two.destroy();
});

test("callback replacement while async setup is pending keeps the same surface", async () => {
  let resolve!: (s: CanvasSurface) => void,
    creates = 0,
    disposes = 0,
    ready = "";
  const e = editor();
  const life = createSurfaceLifecycle({} as HTMLElement, () => {
    creates++;
    return new Promise((r) => (resolve = r));
  });
  life.update({ editor: e, onReady: () => (ready = "old") });
  await turn();
  life.update({ editor: e, onReady: () => (ready = "new") });
  resolve(
    surface(async () => {
      disposes++;
    }),
  );
  await life.settled();
  assert.equal(creates, 1);
  assert.equal(disposes, 0);
  assert.equal(ready, "new");
  await life.destroy();
});
