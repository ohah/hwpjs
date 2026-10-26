import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { act, createElement, createRef, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { installDOM } from "./react-dom-fixture.mjs";

// Capture values before mock.module changes the live module namespace. A saved
// namespace alone is insufficient: Bun updates its exports when mocking.
const actualVanilla = Object.freeze({ ...(await import("@hwpjs/vanilla")) });
const surfaces: any[] = [];
let factoryFailure: unknown;
mock.module("@hwpjs/vanilla", () => ({
  ...actualVanilla,
  createCanvasSurface(options: any) {
    if (factoryFailure) throw factoryFailure;
    const surface = {
      options,
      disposed: 0,
      focused: 0,
      scale: 100,
      focus() {
        this.focused++;
      },
      setScale(value: number) {
        this.scale = value;
        return true;
      },
      getSelection() {
        return { owner: "test" };
      },
      async flushComposition() {
        return "unchanged";
      },
      dispose() {
        this.disposed++;
        return Promise.resolve();
      },
    };
    surfaces.push(surface);
    return surface;
  },
}));
const { CanvasSurface, useEditorState, useCanvasSurface } = await import("../src/index.ts");
let dom: ReturnType<typeof installDOM>;
beforeAll(() => {
  dom = installDOM();
});
afterAll(async () => {
  try {
    dom.restore();
  } finally {
    mock.restore();
    // mock.restore() resets spies, not module replacements. Explicitly restore
    // the public alias for app/adapter tests sharing this Bun process.
    mock.module("@hwpjs/vanilla", () => ({ ...actualVanilla }));
  }
  const restored = await import("@hwpjs/vanilla");
  for (const key of Object.keys(actualVanilla) as (keyof typeof actualVanilla)[]) {
    expect(restored[key]).toBe(actualVanilla[key]);
  }
});
function editor() {
  let state = Object.freeze({ status: "empty", stateVersion: 0 });
  const listeners = new Set<() => void>();
  return {
    disposed: 0,
    getEditorState: () => state,
    registerStateListener(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose() {
      this.disposed++;
      return Promise.resolve();
    },
    publish() {
      state = Object.freeze({ status: "empty", stateVersion: state.stateVersion + 1 });
      for (const notify of listeners) notify();
    },
    listeners,
  };
}
const properties = (value: ReturnType<typeof editor>, extra: any = {}) => ({
  editor: value as any,
  ...extra,
});
async function mount(element: any) {
  const container = dom.document.createElement("div");
  dom.document.body.appendChild(container);
  const root = createRoot(container as any);
  await act(async () => {
    root.render(element);
  });
  return {
    container,
    root,
    async render(next: any) {
      await act(async () => {
        root.render(next);
      });
    },
    async unmount() {
      await act(async () => {
        root.unmount();
      });
      dom.document.body.removeChild(container);
    },
  };
}

describe("real React lifecycle with an injected surface port", () => {
  test("surface injection preserves every other real public vanilla export", async () => {
    const injected = await import("@hwpjs/vanilla");
    for (const key of Object.keys(actualVanilla) as (keyof typeof actualVanilla)[]) {
      if (key !== "createCanvasSurface") expect(injected[key]).toBe(actualVanilla[key]);
    }
    expect(injected.createCanvasSurface).not.toBe(actualVanilla.createCanvasSurface);
    expect(typeof injected.createKeyboardShortcuts).toBe("function");
  });
  test("SSR render is an empty height100 host and never creates a surface", () => {
    const count = surfaces.length,
      e = editor();
    const html = renderToString(
      createElement(
        CanvasSurface,
        properties(e, {
          className: "host",
          "aria-label": "문서",
          style: { height: 20, width: "100%" },
        }),
      ),
    );
    expect(html).toContain("height:100%");
    expect(html).toContain("min-height:0");
    expect(html).toContain('aria-label="문서"');
    expect(html).not.toContain("canvas");
    expect(surfaces.length).toBe(count);
    expect(e.disposed).toBe(0);
  });

  test("JavaScript children and HTML cannot enter the vanilla-owned host", () => {
    const html = renderToString(
      createElement(
        CanvasSurface,
        properties(editor(), {
          children: "unowned child",
          dangerouslySetInnerHTML: { __html: "unowned HTML" },
        }),
      ),
    );
    expect(html).not.toContain("unowned");
  });

  test("StrictMode mount and external editor reuse allocate fresh surfaces without owning the editor", async () => {
    const start = surfaces.length,
      e = editor(),
      ready: any[] = [];
    const ref = createRef<any>();
    const h = await mount(
      createElement(
        StrictMode,
        null,
        createElement(
          CanvasSurface,
          properties(e, { ref, onReady: (value: any) => ready.push(value) }),
        ),
      ),
    );
    const created = surfaces.slice(start);
    // StrictMode's initial replay may precede the callback-ref state commit.
    // A surface is created only once there is a committed host, never in render.
    expect(created.length).toBeGreaterThanOrEqual(1);
    expect(new Set(created).size).toBe(created.length);
    expect(created.slice(0, -1).every((value) => value.disposed === 1)).toBe(true);
    expect(ref.current.surface).toBe(created.at(-1));
    expect(ref.current.element).toBe(h.container.firstChild);
    ref.current.focus();
    expect(created.at(-1).focused).toBe(1);
    expect(ref.current.setScale(125)).toBe(true);
    expect(created.at(-1).scale).toBe(125);
    expect(await ref.current.flushComposition()).toBe("unchanged");
    await h.unmount();
    expect(created.every((value) => value.disposed === 1)).toBe(true);
    expect(e.disposed).toBe(0);
    expect(ref.current).toBe(null);
    expect(ready.length).toBe(created.length);
    const reused = await mount(
      createElement(StrictMode, null, createElement(CanvasSurface, properties(e))),
    );
    expect(created.includes(surfaces.at(-1))).toBe(false);
    await reused.unmount();
    expect(e.disposed).toBe(0);
  });

  test("callback updates do not recreate; editor replacement cleans old surface; stale status is fenced", async () => {
    const a = editor(),
      b = editor(),
      statuses: string[] = [],
      callbackRef: any[] = [];
    const start = surfaces.length;
    const h = await mount(
      createElement(
        CanvasSurface,
        properties(a, {
          ref: (handle: any) => {
            callbackRef.push(handle);
          },
          onStatus: (text: string) => statuses.push(`old:${text}`),
        }),
      ),
    );
    const old = surfaces.at(-1);
    await h.render(
      createElement(
        CanvasSurface,
        properties(a, { onStatus: (text: string) => statuses.push(`new:${text}`) }),
      ),
    );
    expect(surfaces.length).toBe(start + 1);
    old.options.onStatus("active");
    expect(statuses).toEqual(["new:active"]);
    await h.render(
      createElement(
        CanvasSurface,
        properties(b, { onStatus: (text: string) => statuses.push(`b:${text}`) }),
      ),
    );
    expect(old.disposed).toBe(1);
    old.options.onStatus("late");
    expect(statuses).toEqual(["new:active"]);
    surfaces.at(-1).options.onStatus("current");
    expect(statuses.at(-1)).toBe("b:current");
    await h.unmount();
    surfaces.at(-1).options.onStatus("detached");
    expect(statuses.at(-1)).toBe("b:current");
    expect(callbackRef.some((value) => value === null)).toBe(true);
    expect(a.disposed + b.disposed).toBe(0);
  });

  test("environment identity replacement cleans up and creates a new host", async () => {
    const e = editor(),
      first = {},
      next = {};
    const h = await mount(createElement(CanvasSurface, properties(e, { environment: first })));
    const original = surfaces.at(-1),
      count = surfaces.length;
    await h.render(createElement(CanvasSurface, properties(e, { environment: first })));
    expect(surfaces.length).toBe(count);
    await h.render(createElement(CanvasSurface, properties(e, { environment: next })));
    expect(original.disposed).toBe(1);
    expect(surfaces.length).toBe(count + 1);
    await h.unmount();
    expect(e.disposed).toBe(0);
  });

  test("setup and consumer callback errors report without leaking a surface/editor", async () => {
    const e = editor(),
      errors: unknown[] = [];
    factoryFailure = Error("surface setup");
    const failed = await mount(
      createElement(
        CanvasSurface,
        properties(e, { onError: (error: unknown) => errors.push(error) }),
      ),
    );
    factoryFailure = undefined;
    expect(errors.length).toBe(1);
    await failed.unmount();
    const h = await mount(
      createElement(
        CanvasSurface,
        properties(e, {
          onReady() {
            throw Error("consumer");
          },
          onError: (error: unknown) => errors.push(error),
        }),
      ),
    );
    const owned = surfaces.at(-1);
    expect(owned.disposed).toBe(1);
    await h.unmount();
    expect(owned.disposed).toBe(1);
    expect(e.disposed).toBe(0);
    expect(errors.length).toBe(2);
  });

  test("deferred disposal serializes replacement and skips superseded setups", async () => {
    const a = editor(),
      b = editor(),
      c = editor(),
      ref = createRef<any>();
    const h = await mount(createElement(CanvasSurface, properties(a, { ref })));
    const first = surfaces.at(-1),
      count = surfaces.length;
    let resolve!: () => void;
    first.dispose = () => {
      first.disposed++;
      return new Promise<void>((done) => {
        resolve = done;
      });
    };
    await h.render(createElement(CanvasSurface, properties(b, { ref })));
    expect(first.disposed).toBe(1);
    expect(surfaces.length).toBe(count);
    expect(ref.current.surface).toBe(null);
    await h.render(createElement(CanvasSurface, properties(c, { ref })));
    expect(surfaces.length).toBe(count);
    await act(async () => {
      resolve();
    });
    expect(surfaces.length).toBe(count + 1);
    expect(surfaces.at(-1).options.editor).toBe(c);
    await h.unmount();
    expect(a.disposed + b.disposed + c.disposed).toBe(0);
  });

  test("unmount fences a pending replacement and disposal rejection is handled", async () => {
    const a = editor(),
      b = editor();
    const errors: unknown[] = [];
    const h = await mount(createElement(CanvasSurface, properties(a)));
    const first = surfaces.at(-1),
      count = surfaces.length;
    let reject!: (error: unknown) => void;
    first.dispose = () => {
      first.disposed++;
      return new Promise<void>((_, fail) => {
        reject = fail;
      });
    };
    await h.render(
      createElement(
        CanvasSurface,
        properties(b, { onError: (error: unknown) => errors.push(error) }),
      ),
    );
    await h.unmount();
    await act(async () => {
      reject(Error("late disposal"));
    });
    expect(surfaces.length).toBe(count);
    expect(errors.length).toBe(0);
    expect(first.disposed).toBe(1);
    expect(a.disposed + b.disposed).toBe(0);
  });

  test("failed disposal blocks current and later replacement within this hook", async () => {
    const a = editor(),
      b = editor(),
      c = editor(),
      errors: unknown[] = [];
    const onError = (error: unknown) => errors.push(error);
    const h = await mount(createElement(CanvasSurface, properties(a, { onError })));
    const first = surfaces.at(-1),
      count = surfaces.length;
    first.dispose = () => {
      first.disposed++;
      return Promise.reject(Error("dispose failed"));
    };
    await h.render(createElement(CanvasSurface, properties(b, { onError })));
    expect(surfaces.length).toBe(count);
    expect(errors.length).toBe(1);
    await h.render(createElement(CanvasSurface, properties(c, { onError })));
    expect(surfaces.length).toBe(count);
    expect(errors.length).toBe(2);
    await h.unmount();
    expect(first.disposed).toBe(1);
  });

  test("ready callback failure fences that disposed surface's late notifications", async () => {
    const statuses: string[] = [],
      errors: unknown[] = [];
    const h = await mount(
      createElement(
        CanvasSurface,
        properties(editor(), {
          onReady() {
            throw Error("ready");
          },
          onStatus: (message: string) => statuses.push(message),
          onError: (error: unknown) => errors.push(error),
        }),
      ),
    );
    const first = surfaces.at(-1);
    first.options.onStatus("late");
    expect(statuses.length).toBe(0);
    expect(errors.length).toBe(1);
    expect(first.disposed).toBe(1);
    await h.unmount();
  });

  test("async consumer callbacks are observed without reviving a detached surface", async () => {
    const errors: unknown[] = [];
    const h = await mount(
      createElement(
        CanvasSurface,
        properties(editor(), {
          onStatus: async () => {
            throw Error("async status");
          },
          onError: async (error: unknown) => {
            errors.push(error);
            throw Error("reporter failure");
          },
        }),
      ),
    );
    await act(async () => {
      surfaces.at(-1).options.onStatus("active");
    });
    expect(errors.length).toBe(1);
    await h.unmount();
    const readyErrors: unknown[] = [];
    const ready = await mount(
      createElement(
        CanvasSurface,
        properties(editor(), {
          onReady: async () => {
            throw Error("async ready");
          },
          onError: (error: unknown) => readyErrors.push(error),
        }),
      ),
    );
    const owned = surfaces.at(-1);
    expect(readyErrors.length).toBe(1);
    expect(owned.disposed).toBe(1);
    await ready.unmount();
    expect(owned.disposed).toBe(1);
  });

  test("useEditorState uses stable snapshots, replaces subscriptions, and never owns editor lifetime", async () => {
    const a = editor(),
      b = editor(),
      seen: any[] = [];
    function Observe({ value }: any) {
      const state = useEditorState(value);
      seen.push(state);
      return createElement("span", null, String(state.stateVersion));
    }
    const h = await mount(createElement(Observe, { value: a }));
    expect(a.listeners.size).toBe(1);
    const initial = seen.at(-1);
    await h.render(createElement(Observe, { value: a }));
    expect(seen.at(-1)).toBe(initial);
    await act(async () => {
      a.publish();
    });
    expect(seen.at(-1).stateVersion).toBe(1);
    await h.render(createElement(Observe, { value: b }));
    expect(a.listeners.size).toBe(0);
    expect(b.listeners.size).toBe(1);
    await h.unmount();
    expect(b.listeners.size).toBe(0);
    expect(a.disposed + b.disposed).toBe(0);
  });

  test("hook follows a replaced DOM root and detached handle calls are safe", async () => {
    const e = editor();
    let handle: any;
    function Host({ alternate }: any) {
      const result = useCanvasSurface(properties(e));
      handle = result.handle;
      return createElement(alternate ? "section" : "div", { ref: result.mountRef });
    }
    const h = await mount(createElement(Host, { alternate: false }));
    const previous = surfaces.at(-1);
    await h.render(createElement(Host, { alternate: true }));
    expect(previous.disposed).toBe(1);
    expect(handle.element.nodeName).toBe("SECTION");
    await h.unmount();
    expect(handle.surface).toBe(null);
    expect(handle.element).toBe(null);
    expect(handle.setScale(1)).toBe(false);
    expect(handle.getSelection()).toBe(null);
    expect(await handle.flushComposition()).toBe("blocked");
  });
});
