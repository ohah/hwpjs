import test from "node:test";
import assert from "node:assert/strict";
import { nativePasteKey } from "./native-paste-key.mjs";
function fixture() {
  const calls = [],
    sockets = [],
    scope = {
      origin: "http://127.0.0.1:49008",
      framework: "vanilla",
      modifier: "Meta",
      ownerToken: "owned-unique-page-token",
    },
    target = {
      type: "page",
      url: "http://127.0.0.1:49008/demo/vanilla",
      webSocketDebuggerUrl: "ws://127.0.0.1:9222/devtools/page/OWNED",
    };
  let peerURL = target.url,
    peerToken = scope.ownerToken;
  class Socket extends EventTarget {
    constructor(url) {
      super();
      this.url = String(url);
      this.readyState = 0;
      this.closed = 0;
      sockets.push(this);
      queueMicrotask(() => {
        this.readyState = 1;
        this.dispatchEvent(new Event("open"));
      });
    }
    send(text) {
      const request = JSON.parse(text);
      calls.push(request);
      queueMicrotask(() => {
        const e = new Event("message");
        e.data = JSON.stringify({
          id: request.id,
          result:
            request.method === "Runtime.evaluate"
              ? { result: { value: { url: peerURL, token: peerToken } } }
              : {},
        });
        this.dispatchEvent(e);
      });
    }
    close() {
      this.closed++;
      this.readyState = 3;
    }
  }
  const cmd = async (...args) => {
    assert.deepEqual(args, ["get", "cdp-url"]);
    return { url: "ws://127.0.0.1:9222/devtools/browser/OWNED" };
  };
  const deps = {
    WebSocketImpl: Socket,
    fetcher: async (url, options) => {
      assert.equal(url, "http://127.0.0.1:9222/json/list");
      assert.equal(options.redirect, "error");
      return { ok: true, json: async () => [target] };
    },
  };
  return {
    calls,
    sockets,
    scope,
    target,
    cmd,
    deps,
    mismatchToken() {
      peerToken = "other-page";
    },
    navigate() {
      peerURL = "https://example.invalid/";
    },
  };
}
test("paste input is limited to the witnessed CLI page and sends no clipboard or permissions payload", async () => {
  const f = fixture();
  await nativePasteKey(f.cmd, f.scope, f.deps);
  assert.deepEqual(
    f.calls.map((r) => r.method),
    ["Runtime.evaluate", "Input.dispatchKeyEvent", "Input.dispatchKeyEvent"],
  );
  assert.deepEqual(f.calls[1].params, {
    type: "keyDown",
    key: "v",
    code: "KeyV",
    windowsVirtualKeyCode: 86,
    modifiers: 4,
    commands: ["paste"],
  });
  assert.equal(f.calls[2].params.type, "keyUp");
  assert.equal(f.sockets[0].closed, 1);
  assert(!JSON.stringify(f.calls).includes("clipboardData"));
  assert(!JSON.stringify(f.calls).includes("Browser.setPermission"));
});
for (const mismatch of ["mismatchToken", "navigate"])
  test(`foreign page ${mismatch} receives zero input and socket closes`, async () => {
    const f = fixture();
    f[mismatch]();
    await assert.rejects(nativePasteKey(f.cmd, f.scope, f.deps));
    assert.equal(f.calls.filter((r) => r.method === "Input.dispatchKeyEvent").length, 0);
    assert.equal(f.sockets[0].closed, 1);
  });
test("external websocket and missing target are rejected before connecting", async () => {
  const f = fixture();
  f.target.webSocketDebuggerUrl = "ws://example.invalid:9222/devtools/page/FOREIGN";
  await assert.rejects(nativePasteKey(f.cmd, f.scope, f.deps));
  assert.equal(f.sockets.length, 0);
  const g = fixture();
  g.target.url = "about:blank";
  await assert.rejects(nativePasteKey(g.cmd, g.scope, g.deps));
  assert.equal(g.sockets.length, 0);
});
