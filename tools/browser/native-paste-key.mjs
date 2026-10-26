import assert from "node:assert/strict";
// Browser edit command equivalent of a primary+V default action. No clipboard data
// or permissions are injected. Match both the exact URL and this CLI page's nonce.
export async function nativePasteKey(
  cmd,
  { origin, framework = "vanilla", modifier, ownerToken },
  { fetcher = globalThis.fetch, WebSocketImpl = globalThis.WebSocket } = {},
) {
  const base = new URL(origin);
  assert(
    ["http:", "https:"].includes(base.protocol) &&
      base.pathname === "/" &&
      !base.search &&
      !base.hash &&
      !base.username &&
      !base.password,
  );
  origin = base.origin;
  assert(["vanilla", "react", "svelte"].includes(framework));
  assert(["Meta", "Control"].includes(modifier));
  const info = await cmd("get", "cdp-url"),
    match = JSON.stringify(info).match(/ws:\/\/[^"\\\s]+/);
  assert(match, "OwnedCliCdpURLMissing");
  const endpoint = new URL(match[0]);
  assert(
    ["127.0.0.1", "localhost"].includes(endpoint.hostname) &&
      !endpoint.username &&
      !endpoint.password &&
      !endpoint.search &&
      !endpoint.hash &&
      Number(endpoint.port) > 0,
  );
  const response = await fetcher(`http://${endpoint.host}/json/list`, {
    redirect: "error",
    signal: AbortSignal.timeout(2500),
  });
  assert(response.ok);
  const list = await response.json();
  assert(Array.isArray(list));
  const allPages = list.filter((t) => t.type === "page"),
    pages = allPages.filter((t) => t.url === `${origin}/demo/${framework}`);
  assert.equal(pages.length, 1);
  assert.equal(typeof ownerToken, "string");
  assert(ownerToken.length >= 12);
  const url = new URL(pages[0].webSocketDebuggerUrl);
  assert.equal(url.protocol, "ws:");
  assert.equal(url.host, endpoint.host);
  assert(!url.username && !url.password && !url.search && !url.hash);
  assert(/^\/devtools\/page\/[A-Za-z0-9_-]+$/.test(url.pathname));
  const socket = new WebSocketImpl(url);
  let id = 0;
  const pending = new Map();
  const message = (event) => {
    let reply;
    try {
      reply = JSON.parse(event.data);
    } catch {
      for (const item of pending.values()) {
        clearTimeout(item.timer);
        item.reject(Error("InvalidNativeInputResponse"));
      }
      pending.clear();
      return;
    }
    const request = pending.get(reply.id);
    if (!request) return;
    pending.delete(reply.id);
    clearTimeout(request.timer);
    if (reply.error) request.reject(Error(JSON.stringify(reply.error)));
    else request.resolve(reply.result);
  };
  socket.addEventListener("message", message);
  const request = (method, params) =>
    new Promise((resolve, reject) => {
      const next = ++id,
        timer = setTimeout(() => {
          pending.delete(next);
          reject(Error("OwnedNativeInputTimeout"));
        }, 2500);
      pending.set(next, { resolve, reject, timer });
      socket.send(JSON.stringify({ id: next, method, params }));
    });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error("OwnedNativeInputConnectTimeout")), 2500);
      socket.addEventListener(
        "open",
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
      socket.addEventListener(
        "error",
        () => {
          clearTimeout(timer);
          reject(Error("OwnedNativeInputConnectError"));
        },
        { once: true },
      );
    });
    const witness = await request("Runtime.evaluate", {
      expression: "({url:location.href,token:window.__demoEditAudit?.ownerToken})",
      returnByValue: true,
      awaitPromise: false,
      timeout: 1000,
    });
    assert.equal(witness.result.value.url, `${origin}/demo/${framework}`);
    assert.equal(witness.result.value.token, ownerToken);
    await request("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "v",
      code: "KeyV",
      windowsVirtualKeyCode: 86,
      modifiers: modifier === "Meta" ? 4 : 2,
      commands: ["paste"],
    });
    await request("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "v",
      code: "KeyV",
      windowsVirtualKeyCode: 86,
      modifiers: modifier === "Meta" ? 4 : 2,
    });
  } finally {
    socket.removeEventListener("message", message);
    socket.close();
    for (const item of pending.values()) {
      clearTimeout(item.timer);
      item.reject(Error("OwnedNativeInputClosed"));
    }
    pending.clear();
  }
}
