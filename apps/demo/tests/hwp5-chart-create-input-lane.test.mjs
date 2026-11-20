import test from 'node:test';
import assert from 'node:assert/strict';
import { createHwp5ChartCreateInputLane } from '../src/hwp5-chart-create-input-lane.ts';
const draft = () => ({
  width: 36000,
  height: 22000,
  categories: ['A', 'B', 'C'],
  series: [{ name: 'values', values: [10, 20, 30] }],
});
const pixels = { width: 480, height: 320 };
function fixture() {
  let current = true,
    wire = new Uint8Array([1, 2, 3]);
  const owner = Object.freeze({ privateSDKOwner: 'opaque' });
  const capture = { owner, current: () => current };
  const calls = [];
  let preview = async (d, c) => {
    calls.push(['preview', d, c]);
    return wire;
  };
  let render = async (w, p, live) => {
    calls.push(['render', w, p]);
    assert.equal(live(), true);
    return {
      schemaVersion: 1,
      scope: 'hwp5-chart-create-preview-payload',
      executionAuthority: false,
      source_xml_sha256: Array(32).fill(7),
      rendering: 'hwpjs-preview-approximation',
      warnings: ['SourceStylesNotApplied'],
      pixel_width: p.width,
      pixel_height: p.height,
      mime: 'image/png',
      bytes: new Uint8Array([9]),
    };
  };
  const lane = createHwp5ChartCreateInputLane({
    preview: (...args) => preview(...args),
    render: (...args) => render(...args),
  });
  return {
    lane,
    capture,
    calls,
    stale() {
      current = false;
    },
    preview(fn) {
      preview = fn;
    },
    render(fn) {
      render = fn;
    },
  };
}
test('input retains exact fresh caret/owner and snapshots the existing chart DTO before any await', async () => {
  const f = fixture(),
    input = draft();
  let release;
  f.preview((d, c) => {
    assert.equal(c, f.capture);
    assert.equal(c.owner, f.capture.owner);
    assert.equal(Object.isFrozen(d.series[0].values), true);
    return new Promise((r) => {
      release = r;
    });
  });
  const pending = f.lane.prepare(f.capture, input, pixels);
  input.series[0].values[0] = 99;
  input.categories[0] = 'changed';
  release(new Uint8Array([4]));
  const out = await pending;
  assert.equal(out.options.series[0].values[0], 10);
  assert.equal(out.options.categories[0], 'A');
  assert.equal(out.capture, f.capture);
  assert.equal(f.lane.current(out), true);
  const taken = f.lane.take(out);
  assert.equal(taken.capture.owner, f.capture.owner);
  assert.equal(out.preview.executionAuthority, false);
  assert.equal('preview' in taken, false);
  assert.throws(() => f.lane.take(out), /Stale/);
});
test('stale caret refuses before preview or canvas work', async () => {
  const f = fixture();
  f.stale();
  await assert.rejects(f.lane.prepare(f.capture, draft(), pixels), /Stale/);
  assert.deepEqual(f.calls, []);
});
test('invalid chart DTO including hidden accessors is rejected before preview', async () => {
  const f = fixture(),
    d = draft();
  Object.defineProperty(d, 'series', {
    get() {
      assert.fail('getter read');
    },
    enumerable: true,
  });
  await assert.rejects(f.lane.prepare(f.capture, d, pixels));
  assert.deepEqual(f.calls, []);
});
test('caret moves while Native preview pending: no raster follows', async () => {
  const f = fixture();
  let release;
  f.preview(
    () =>
      new Promise((r) => {
        release = r;
      }),
  );
  const pending = f.lane.prepare(f.capture, draft(), pixels);
  f.stale();
  release(new Uint8Array([1]));
  await assert.rejects(pending, /Stale/);
  assert.equal(f.calls.length, 0);
});
for (const operation of ['invalidate', 'dispose'])
  test(operation + ' while preview pending prevents raster and result', async () => {
    const f = fixture();
    let release;
    f.preview(
      () =>
        new Promise((r) => {
          release = r;
        }),
    );
    const pending = f.lane.prepare(f.capture, draft(), pixels);
    f.lane[operation]();
    release(new Uint8Array([1]));
    await assert.rejects(pending, /Stale/);
    assert.equal(f.calls.length, 0);
  });
test('invalidation during async raster discards the completed PNG', async () => {
  const f = fixture();
  let release, entered;
  const ready = new Promise((r) => {
    entered = r;
  });
  f.render(async () => {
    entered();
    return new Promise((r) => {
      release = r;
    });
  });
  const pending = f.lane.prepare(f.capture, draft(), pixels);
  await ready;
  f.lane.invalidate();
  release({ bytes: new Uint8Array([9]) });
  await assert.rejects(pending, /Stale/);
});
test('recheck immediately before handoff denies a finished PNG after caret change', async () => {
  const f = fixture(),
    out = await f.lane.prepare(f.capture, draft(), pixels);
  f.stale();
  assert.equal(f.lane.current(out), false);
  assert.throws(() => f.lane.take(out), /Stale/);
});
test('one capture cannot be replayed and concurrent duplicate submissions are refused', async () => {
  const f = fixture();
  let release;
  f.preview(
    () =>
      new Promise((r) => {
        release = r;
      }),
  );
  const first = f.lane.prepare(f.capture, draft(), pixels);
  await assert.rejects(f.lane.prepare(f.capture, draft(), pixels), /Stale/);
  release(new Uint8Array([1]));
  await first;
  await assert.rejects(f.lane.prepare(f.capture, draft(), pixels), /Stale/);
});
test('renderer failure has no fixture fallback and requires a new capture for retry', async () => {
  const f = fixture();
  f.render(async () => {
    throw Error('ChartCreatePreviewEncodeFailed');
  });
  await assert.rejects(f.lane.prepare(f.capture, draft(), pixels), /EncodeFailed/);
  await assert.rejects(f.lane.prepare(f.capture, draft(), pixels), /Stale/);
});
test('new preparation invalidates any previous unconsumed prepared output', async () => {
  const f = fixture(),
    first = await f.lane.prepare(f.capture, draft(), pixels),
    next = { owner: f.capture.owner, current: () => true };
  await f.lane.prepare(next, draft(), pixels);
  assert.equal(f.lane.current(first), false);
  assert.throws(() => f.lane.take(first), /Stale/);
});
