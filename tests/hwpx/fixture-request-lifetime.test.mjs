import test from "node:test";
import assert from "node:assert/strict";
import { createFixtureControls } from "../../web/preview/fixture-controls.mjs";

function requestHarness(fetchBytes) {
  const button = new EventTarget(), input = new EventTarget(), opened = [];
  const select = { value: "table.hwpx", ownerDocument: { createElement: () => ({}) }, append() {} };
  const control = createFixtureControls({ select, button, input, open: file => opened.push(file), fetchBytes });
  return { control, input, opened, select, click() { button.dispatchEvent(new Event("click")); } };
}

test("fixture control aborts both superseded and closing requests without starting eager fetches", async () => {
  const requests = [];
  const h = requestHarness((url, options) => new Promise((resolve, reject) => {
    requests.push({ url, ...options });
    options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
  }));
  h.click();
  assert.equal(requests.length, 0);
  const first = assert.rejects(h.opened[0].arrayBuffer(), { name: "AbortError" });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].cache, "no-store");
  h.select.value = "charshape.hwpx"; h.click();
  assert.equal(requests[0].signal.aborted, true);
  assert.equal(requests.length, 1);
  const second = assert.rejects(h.opened[1].arrayBuffer(), { name: "AbortError" });
  assert.equal(requests.length, 2);
  assert.notEqual(requests[0].signal, requests[1].signal);
  h.control.close(); h.control.close();
  assert.equal(requests[1].signal.aborted, true);
  await Promise.all([first, second]);
  h.click();
  assert.equal(h.opened.length, 2);
});

test("fixture control local upload cancels even a source whose lazy fetch has not started", async () => {
  let calls = 0;
  const h = requestHarness(async () => { calls++; return { ok: true, arrayBuffer: async () => new Uint8Array([7]).buffer }; });
  h.click();
  h.input.dispatchEvent(new Event("change"));
  await assert.rejects(h.opened[0].arrayBuffer(), { name: "AbortError" });
  assert.equal(calls, 0);
  h.click();
  assert.deepEqual(new Uint8Array(await h.opened[1].arrayBuffer()), new Uint8Array([7]));
  assert.equal(calls, 1);
  h.control.close();
});

test("fixture control rejects a late body from a transport that ignores abort", async () => {
  let finish, signal;
  const body = new Promise(resolve => { finish = resolve; });
  const h = requestHarness(async (_, options) => {
    signal = options.signal;
    return { ok: true, arrayBuffer: () => body };
  });
  h.click();
  const read = assert.rejects(h.opened[0].arrayBuffer(), { name: "AbortError" });
  await Promise.resolve();
  h.input.dispatchEvent(new Event("change"));
  assert.equal(signal.aborted, true);
  finish(new Uint8Array([1, 2]).buffer);
  await read;
  h.control.close();
});

test("fixture control ignores invalid selections and rejects late HTTP errors after cancellation", async () => {
  let finish, signal;
  const h = requestHarness((_, options) => {
    signal = options.signal;
    return new Promise(resolve => { finish = resolve; });
  });
  h.click();
  const read = assert.rejects(h.opened[0].arrayBuffer(), { name: "AbortError" });
  h.select.value = "../secret"; h.click();
  assert.equal(signal.aborted, false);
  assert.equal(h.opened.length, 1);
  h.control.close();
  finish({ ok: false, status: 404, arrayBuffer: () => { throw Error("must not consume stale body"); } });
  await read;
});

test("fixture control retains HTTP size and retry behavior for the current request", async () => {
  let response = { ok: false, status: 404 }, calls = 0;
  const h = requestHarness(async () => { calls++; return response; });
  h.click();
  await assert.rejects(h.opened[0].arrayBuffer(), /데모 서버를 최신 코드로 재시작/);
  response = { ok: false, status: 503 };
  h.click();
  await assert.rejects(h.opened[1].arrayBuffer(), /FixtureFetchFailed:503/);
  response = { ok: true, arrayBuffer: async () => ({ byteLength: 64 * 1024 * 1024 + 1 }) };
  h.click();
  await assert.rejects(h.opened[2].arrayBuffer(), /FixtureTooLarge/);
  response = { ok: true, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer };
  h.click();
  assert.deepEqual(new Uint8Array(await h.opened[3].arrayBuffer()), new Uint8Array([1, 2, 3]));
  h.control.close();
  await assert.rejects(h.opened[3].arrayBuffer(), { name: "AbortError" });
  assert.equal(calls, 4);
});
