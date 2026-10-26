import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createFixtureControls } from '../../web/preview/fixture-controls.mjs';

function requestHarness(fetchBytes, timing = {}) {
  const button = new EventTarget(),
    input = new EventTarget(),
    opened = [];
  const select = { value: 'table.hwpx', ownerDocument: { createElement: () => ({}) }, append() {} };
  const control = createFixtureControls({
    select,
    button,
    input,
    open: (file) => opened.push(file),
    fetchBytes,
    ...timing,
  });
  return {
    control,
    input,
    opened,
    select,
    click() {
      button.dispatchEvent(new Event('click'));
    },
  };
}

test('fixture control clears the local selection only when opening a valid server fixture', () => {
  const h = requestHarness(() => {
    throw Error('must remain lazy');
  });
  h.input.value = 'C:\\fakepath\\local.hwp';
  h.select.value = '../secret';
  h.click();
  assert.equal(h.input.value, 'C:\\fakepath\\local.hwp');
  assert.equal(h.opened.length, 0);
  h.select.value = 'table.hwpx';
  h.click();
  assert.equal(h.input.value, '');
  assert.equal(h.opened.length, 1);
  assert.equal(h.opened[0].name, 'table.hwpx');
  h.control.close();
});

for (const phase of ['headers', 'body'])
  test(`fixture timeout bounds stalled ${phase} even when transport ignores abort and permits a fresh retry`, async () => {
    const timers = new Map();
    let next = 0,
      signal,
      late,
      calls = 0;
    const h = requestHarness(
      (_, options) => {
        signal = options.signal;
        if (++calls > 1)
          return Promise.resolve({ ok: true, arrayBuffer: async () => new Uint8Array([9]).buffer });
        const stalled = new Promise((resolve) => {
          late = resolve;
        });
        return phase === 'headers'
          ? stalled
          : Promise.resolve({ ok: true, arrayBuffer: () => stalled });
      },
      {
        setTimer(fn, ms) {
          assert.equal(ms, 30000);
          timers.set(++next, fn);
          return next;
        },
        clearTimer(id) {
          timers.delete(id);
        },
      },
    );
    try {
      h.click();
      const failed = assert.rejects(h.opened[0].arrayBuffer(), /다운로드 시간이 초과/);
      await Promise.resolve();
      assert.equal(timers.size, 1);
      [...timers.values()][0]();
      await failed;
      assert.equal(signal.aborted, true);
      assert.equal(timers.size, 0);
      late(phase === 'headers' ? { ok: false, status: 503 } : new ArrayBuffer(1));
      h.click();
      assert.deepEqual(new Uint8Array(await h.opened[1].arrayBuffer()), new Uint8Array([9]));
      assert.equal(timers.size, 0);
      assert.equal(calls, 2);
    } finally {
      h.control.close();
    }
  });

test('fixture success clears its deadline so a completed request cannot expire later', async () => {
  const timers = new Map();
  const h = requestHarness(
    async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(2) }),
    {
      setTimer(fn) {
        timers.set(1, fn);
        return 1;
      },
      clearTimer(id) {
        timers.delete(id);
      },
    },
  );
  try {
    h.click();
    await h.opened[0].arrayBuffer();
    assert.equal(timers.size, 0);
  } finally {
    h.control.close();
  }
});

for (const phase of ['headers', 'body'])
  test(`real fetch timeout aborts stalled ${phase} and retries over a fresh connection`, async (t) => {
    let requests = 0;
    const server = createServer((_, response) => {
      if (++requests > 1) {
        response.end(Buffer.from([7, 8]));
        return;
      }
      if (phase === 'body') {
        response.writeHead(200, { 'content-length': '100' });
        response.write(Buffer.from([1]));
      }
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(async () => {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    });
    const origin = `http://127.0.0.1:${server.address().port}/`;
    const h = requestHarness((_, options) => fetch(origin, options), { timeoutMs: 500 });
    try {
      h.click();
      await assert.rejects(h.opened[0].arrayBuffer(), /다운로드 시간이 초과/);
      assert.equal(requests, 1);
      h.click();
      assert.deepEqual(new Uint8Array(await h.opened[1].arrayBuffer()), new Uint8Array([7, 8]));
      assert.equal(requests, 2);
    } finally {
      h.control.close();
    }
  });

test('fixture cancellation does not clear a newly chosen local file', async () => {
  const h = requestHarness(() => {
    throw Error('must remain lazy');
  });
  h.click();
  h.input.value = 'C:\\fakepath\\new.hwp';
  h.input.dispatchEvent(new Event('change'));
  assert.equal(h.input.value, 'C:\\fakepath\\new.hwp');
  await assert.rejects(h.opened[0].arrayBuffer(), { name: 'AbortError' });
  h.control.close();
  assert.equal(h.input.value, 'C:\\fakepath\\new.hwp');
});

test('fixture control aborts both superseded and closing requests without starting eager fetches', async () => {
  const requests = [];
  const h = requestHarness(
    (url, options) =>
      new Promise((resolve, reject) => {
        requests.push({ url, ...options });
        options.signal.addEventListener('abort', () => reject(options.signal.reason), {
          once: true,
        });
      }),
  );
  h.click();
  assert.equal(requests.length, 0);
  const first = assert.rejects(h.opened[0].arrayBuffer(), { name: 'AbortError' });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].cache, 'no-store');
  h.select.value = 'charshape.hwpx';
  h.click();
  assert.equal(requests[0].signal.aborted, true);
  assert.equal(requests.length, 1);
  const second = assert.rejects(h.opened[1].arrayBuffer(), { name: 'AbortError' });
  assert.equal(requests.length, 2);
  assert.notEqual(requests[0].signal, requests[1].signal);
  h.control.close();
  h.control.close();
  assert.equal(requests[1].signal.aborted, true);
  await Promise.all([first, second]);
  h.click();
  assert.equal(h.opened.length, 2);
});

test('fixture control local upload cancels even a source whose lazy fetch has not started', async () => {
  let calls = 0;
  const h = requestHarness(async () => {
    calls++;
    return { ok: true, arrayBuffer: async () => new Uint8Array([7]).buffer };
  });
  h.click();
  h.input.dispatchEvent(new Event('change'));
  await assert.rejects(h.opened[0].arrayBuffer(), { name: 'AbortError' });
  assert.equal(calls, 0);
  h.click();
  assert.deepEqual(new Uint8Array(await h.opened[1].arrayBuffer()), new Uint8Array([7]));
  assert.equal(calls, 1);
  h.control.close();
});

test('fixture control rejects a late body from a transport that ignores abort', async () => {
  let finish, signal;
  const body = new Promise((resolve) => {
    finish = resolve;
  });
  const h = requestHarness(async (_, options) => {
    signal = options.signal;
    return { ok: true, arrayBuffer: () => body };
  });
  h.click();
  const read = assert.rejects(h.opened[0].arrayBuffer(), { name: 'AbortError' });
  await Promise.resolve();
  h.input.dispatchEvent(new Event('change'));
  assert.equal(signal.aborted, true);
  finish(new Uint8Array([1, 2]).buffer);
  await read;
  h.control.close();
});

test('fixture control ignores invalid selections and rejects late HTTP errors after cancellation', async () => {
  let finish, signal;
  const h = requestHarness((_, options) => {
    signal = options.signal;
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  h.click();
  const read = assert.rejects(h.opened[0].arrayBuffer(), { name: 'AbortError' });
  h.select.value = '../secret';
  h.click();
  assert.equal(signal.aborted, false);
  assert.equal(h.opened.length, 1);
  h.control.close();
  finish({
    ok: false,
    status: 404,
    arrayBuffer: () => {
      throw Error('must not consume stale body');
    },
  });
  await read;
});

test('fixture control retains HTTP size and retry behavior for the current request', async () => {
  let response = { ok: false, status: 404 },
    calls = 0;
  const h = requestHarness(async () => {
    calls++;
    return response;
  });
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
  await assert.rejects(h.opened[3].arrayBuffer(), { name: 'AbortError' });
  assert.equal(calls, 4);
});
