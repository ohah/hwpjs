import test from 'node:test';
import assert from 'node:assert/strict';
import { createChartDataController } from '../src/chart-data-controller.ts';
import { fixture } from './chart-data-fixture.mjs';
const tick = () => new Promise((r) => setImmediate(r));
function setup() {
  const f = fixture(),
    views = [],
    messages = [];
  const tool = createChartDataController({
    port: f.port,
    createView(targets, callbacks) {
      const view = {
        targets,
        callbacks,
        capture: null,
        destroyed: false,
        busy: false,
        invalid: false,
        status: '',
        focus() {},
        destroy() {
          this.destroyed = true;
        },
        setBusy(v) {
          this.busy = v;
        },
        setStatus(v) {
          this.status = v;
        },
        showCapture(c) {
          this.capture = c;
        },
        invalidate() {
          this.invalid = true;
        },
      };
      views.push(view);
      return view;
    },
    onStatus: (t) => messages.push(t),
    onClose() {},
    onPresentationChange() {},
  });
  return { ...f, tool, views, messages };
}
test('open queries current chart; rapid apply emits one edit and closes on commit', async () => {
  const f = setup();
  f.tool.open();
  await tick();
  const view = f.views[0];
  assert.equal(view.capture.points[0].value, '1');
  view.callbacks.onApply(['2', '범주', '?']);
  view.callbacks.onApply(['3', '범주', '?']);
  await tick();
  assert.equal(f.calls.filter((c) => c[0] === 'write').length, 1);
  assert.equal(view.destroyed, true);
  assert.match(f.messages[0], /수정/);
  f.tool.dispose();
});
test('document replacement while query pending discards late result and closes dialog', async () => {
  const f = setup();
  let resolve;
  f.onRead(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  f.tool.open();
  f.replace({ token: { documentId: 'new' } });
  assert.equal(f.views[0].destroyed, true);
  resolve(f.reply);
  await tick();
  assert.equal(f.views[0].capture, null);
  assert.equal(f.calls.length, 1);
  f.tool.dispose();
});
test('revision change invalidates visible draft and rejects queued apply without edit', async () => {
  const f = setup();
  f.tool.open();
  await tick();
  const view = f.views[0];
  f.replace({ token: { operationRevision: 1 } });
  assert.equal(view.invalid, true);
  view.callbacks.onApply(['2', '범주', '?']);
  await tick();
  assert.equal(f.calls.length, 1);
  f.tool.dispose();
});
test('known refusal keeps form; uncertain failure closes without retry', async () => {
  const f = setup();
  f.tool.open();
  await tick();
  const view = f.views[0];
  f.onWrite(async () => ({ status: 'rejected-unapplied', error: 'Native refusal' }));
  view.callbacks.onApply(['2', '범주', '?']);
  await tick();
  assert.equal(view.destroyed, false);
  assert.equal(view.status, 'Native refusal');
  f.onWrite(async () => {
    throw Error('lost reply');
  });
  view.callbacks.onApply(['2', '범주', '?']);
  await tick();
  assert.equal(view.destroyed, true);
  assert.match(f.messages[0], /다시 적용하지/);
  assert.equal(f.calls.filter((c) => c[0] === 'write').length, 2);
  f.tool.dispose();
});
test('known-no-op with an error shows the error instead of a successful unchanged notice', async () => {
  const f = setup();
  f.tool.open();
  await tick();
  const view = f.views[0];
  f.onWrite(async () => ({ status: 'known-no-op', error: 'Native validation failed' }));
  view.callbacks.onApply(['2', '범주', '?']);
  await tick();
  assert.equal(view.destroyed, false);
  assert.equal(view.status, 'Native validation failed');
  assert.equal(f.messages.length, 0);
  assert.equal(f.calls.filter((c) => c[0] === 'write').length, 1);
  f.tool.dispose();
});
test('dismiss during query and dispose during edit ignore late UI callbacks', async () => {
  const f = setup();
  let resolve;
  f.onRead(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  f.tool.open();
  f.views[0].callbacks.onDismiss();
  resolve(f.reply);
  await tick();
  assert.equal(f.views[0].capture, null);
  f.onRead(null);
  f.tool.open();
  await tick();
  let finish;
  f.onWrite(
    () =>
      new Promise((r) => {
        finish = r;
      }),
  );
  f.views[1].callbacks.onApply(['2', '범주', '?']);
  f.tool.dispose();
  finish({ status: 'committed-with-snapshot' });
  await tick();
  assert.equal(f.messages.length, 0);
  assert.equal(f.tool.presentation().enabled, false);
});
