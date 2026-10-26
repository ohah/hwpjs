import { test, expect } from "bun:test";
import { createEditor } from "@hwpjs/core";
import { createDemoShell } from "../src/shell.ts";
import { createTextToolsBridge } from "../src/text-tools-bridge.ts";
import { documentFixture, all, fire } from "./text-tools-presentation-dom.ts";
const tick = () => new Promise((r) => setImmediate(r));
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}
async function setup({ observerThrows = false, inline = false } = {}) {
  const content = {
    format: "hwpx",
    paragraphs: [
      { section: 0, paragraph: 0, text: "AB AB", editable: true, selectionOwner: "section:0:body" },
    ],
  };
  const editor = createEditor({
    runtimeFactory: () => ({
      async request(m: any) {
        return {
          kind: m.kind,
          content,
          ...(!["load", "enable"].includes(m.kind)
            ? { meta: { application: "applied", changed: true } }
            : {}),
        };
      },
      dispose() {},
    }),
  });
  await editor.load(new Uint8Array([1]), { format: "hwpx" });
  const { root: node } = documentFixture();
  const root = node as any;
  let gate: ReturnType<typeof deferred> | undefined,
    fail = false,
    notifications = 0,
    focus = 0,
    shell: any;
  const port = {
    ...editor,
    registerStateListener(fn: any) {
      if (inline) fn({ ...editor.getEditorState(), status: "loading" });
      return editor.registerStateListener(fn);
    },
    async update(fn: any) {
      if (gate) await gate.promise;
      if (fail) throw Error("InjectedSearchFailure");
      return editor.update(fn);
    },
  };
  const bridge = createTextToolsBridge({
    editor: port,
    root,
    onStatus: () => shell?.update(),
    onClose: () => {
      focus++;
    },
    onPresentationChange: () => {
      notifications++;
      if (observerThrows) throw Error("ObserverFailure");
      shell?.update();
    },
  });
  shell = createDemoShell(root, {
    framework: "vanilla",
    routes: {
      headless: "/demo/headless",
      vanilla: "/demo/vanilla",
      react: "/demo/react",
      svelte: "/demo/svelte",
    },
    fixtures: [],
    getState: () => ({ title: "test", status: "", actions: bridge.presentation() }),
    onAction: async (a) => {
      await bridge.action(a);
      shell.update();
    },
  });
  const unsub = editor.registerStateListener(() => shell.update());
  const role = (r: string): any => all(root).find((n: any) => n.dataset.role === r);
  const buttons = (): any[] => all(root).filter((n: any) => n.dataset.command === "find");
  const assertReady = () => {
    expect(bridge.presentation().find?.enabled).toBe(true);
    for (const b of buttons()) {
      expect(b.disabled).toBe(false);
      expect(b.title).not.toContain("진행 중");
    }
  };
  return {
    editor,
    bridge,
    root,
    role,
    buttons,
    assertReady,
    get notifications() {
      return notifications;
    },
    get focus() {
      return focus;
    },
    block() {
      return (gate = deferred());
    },
    fail() {
      fail = true;
    },
    async open(mode: "find" | "replace" = "find") {
      await bridge.action({ command: mode });
      shell.update();
      role("search-query").value = "AB";
      role("search-replacement").value = "Y";
    },
    async finish() {
      await tick();
      await tick();
    },
    async cleanup() {
      bridge.dispose();
      unsub();
      shell.destroy();
      await editor.dispose();
    },
  };
}
test("선택 ACK 중 disabled가 된 실제 shell은 완료 후 복구되고 Escape 후 재열기 가능", async () => {
  const f = await setup();
  try {
    await f.open();
    fire(f.role("find-next"), "click");
    await f.finish();
    expect((f.editor.getEditorState().selection as any)?.startUnit).toBe(0);
    f.assertReady();
    fire(f.role("text-search"), "keydown", { key: "Escape" });
    await f.bridge.action({ command: "find" });
    expect(f.role("text-search").open).toBe(true);
  } finally {
    await f.cleanup();
  }
});
test("상태 이벤트 없는 빈 검색도 시작/종료 presentation을 통지", async () => {
  const f = await setup();
  try {
    await f.open();
    f.role("search-query").value = "";
    const n = f.notifications;
    fire(f.role("find-next"), "click");
    await f.finish();
    expect(f.notifications - n).toBe(2);
    f.assertReady();
  } finally {
    await f.cleanup();
  }
});
test("바꾸기 완료 후 실제 shell의 쓰기중 표시가 남지 않음", async () => {
  const f = await setup();
  try {
    await f.open("replace");
    fire(f.role("find-next"), "click");
    await f.finish();
    fire(f.role("replace-selection"), "click");
    await f.finish();
    f.assertReady();
  } finally {
    await f.cleanup();
  }
});
test("검색 오류 후 pending 해제와 presentation 갱신", async () => {
  const f = await setup();
  try {
    await f.open();
    f.fail();
    fire(f.role("find-next"), "click");
    await f.finish();
    f.assertReady();
    expect(f.role("search-status").textContent).toBe("InjectedSearchFailure");
  } finally {
    await f.cleanup();
  }
});
test("pending 중 닫기는 작업을 새로 허용하지 않고 늦은 완료 때 복구", async () => {
  const f = await setup();
  try {
    await f.open();
    const g = f.block();
    fire(f.role("find-next"), "click");
    fire(f.role("text-search"), "keydown", { key: "Escape" });
    expect(f.bridge.presentation().find?.enabled).toBe(false);
    const n = f.notifications;
    g.resolve();
    await f.finish();
    expect(f.notifications).toBe(n + 1);
    f.assertReady();
    expect(f.role("text-search")).toBeUndefined();
    expect(f.editor.getEditorState().selection).toBeUndefined();
  } finally {
    await f.cleanup();
  }
});
test("문서 교체 후 늦은 완료는 새 선택/포커스를 만들지 않고 새 문서 메뉴만 복구", async () => {
  const f = await setup();
  try {
    await f.open();
    const g = f.block();
    fire(f.role("find-next"), "click");
    await f.editor.load(new Uint8Array([2]), { format: "hwpx" });
    const id = f.editor.getEditorState().documentId;
    g.resolve();
    await f.finish();
    f.assertReady();
    expect(f.editor.getEditorState().documentId).toBe(id);
    expect(f.editor.getEditorState().selection).toBeUndefined();
    expect(f.focus).toBe(0);
  } finally {
    await f.cleanup();
  }
});
test("dispose 중 pending 늦은 완료는 presentation/성공/포커스 통지 없음", async () => {
  const f = await setup();
  try {
    await f.open();
    const g = f.block();
    fire(f.role("find-next"), "click");
    f.bridge.dispose();
    const n = f.notifications;
    g.resolve();
    await f.finish();
    expect(f.notifications).toBe(n);
    expect(f.focus).toBe(0);
    expect(f.bridge.presentation().find?.enabled).toBe(false);
  } finally {
    await f.cleanup();
  }
});

test("관측 콜백 오류는 검색 접수/완료와 pending 해제를 막지 않음", async () => {
  const f = await setup({ observerThrows: true });
  try {
    await f.open();
    fire(f.role("find-next"), "click");
    await f.finish();
    expect((f.editor.getEditorState().selection as any)?.startUnit).toBe(0);
    expect(f.bridge.presentation().find?.enabled).toBe(true);
  } finally {
    await f.cleanup();
  }
});
test("생성 중 동기 구독은 shell 준비 전 표시 콜백을 호출하지 않음", async () => {
  const f = await setup({ inline: true });
  try {
    expect(f.notifications).toBe(0);
    await f.open();
    fire(f.role("find-next"), "click");
    await f.finish();
    f.assertReady();
  } finally {
    await f.cleanup();
  }
});
