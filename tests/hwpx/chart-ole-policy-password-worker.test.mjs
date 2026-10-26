import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { workerCanvasHarness } from '../canvas/worker-harness.mjs';

for (const allow of [false, true])
  test(`encrypted Worker preserves explicit chart policy ${allow} through retry and unlock`, async (t) => {
    const h = await workerCanvasHarness(t);
    const bytes = readFileSync('legacy/rust/crates/hwp-core/tests/fixtures/password-12345.hwpx');
    const original = Buffer.from(bytes);
    const loaded = await h.send({
      kind: 'load',
      format: 'hwpx',
      bytes,
      allowObservedChartOleDeviations: allow,
    });
    assert.equal(loaded.error, 'EncryptedDocument');
    assert.equal(loaded.passwordRequired, true);
    const wrong = { kind: 'unlock', password: 'wrong' };
    assert.equal((await h.send(wrong)).error, 'WrongPasswordOrCorruptPayload');
    assert.equal(wrong.password, undefined);
    const unlock = { kind: 'unlock', password: '12345' };
    const opened = await h.send(unlock);
    assert.equal(opened.error, undefined);
    assert.equal(unlock.password, undefined);
    assert.equal(opened.content.chartOleObservedRepairsAllowed, allow);
    assert.equal((await h.send({ kind: 'enable' })).error, undefined);
    const baseline = await h.send({ kind: 'save', allowUnprotectedOutput: true });
    assert.equal(baseline.error, undefined);
    const target = opened.content.paragraphs.find((row) => row.plainEditable);
    assert.ok(target);
    const edited = await h.send({
      kind: 'splice',
      section: target.section,
      paragraph: target.paragraph,
      startUnit: 0,
      endUnit: 0,
      text: '정책😀',
    });
    assert.equal(edited.error, undefined);
    assert.equal(edited.content.chartOleObservedRepairsAllowed, allow);
    assert.equal(
      (await h.send({ kind: 'save' })).error,
      'PasswordProtectionRemovalNotAcknowledged',
    );
    const saved = await h.send({ kind: 'save', allowUnprotectedOutput: true });
    assert.equal(saved.error, undefined);
    const undone = await h.send({ kind: 'undo' });
    assert.equal(undone.error, undefined);
    assert.equal(undone.content.chartOleObservedRepairsAllowed, allow);
    assert.deepEqual(
      (await h.send({ kind: 'save', allowUnprotectedOutput: true })).bytes,
      baseline.bytes,
    );
    const redone = await h.send({ kind: 'redo' });
    assert.equal(redone.error, undefined);
    assert.equal(redone.content.chartOleObservedRepairsAllowed, allow);
    assert.deepEqual(
      (await h.send({ kind: 'save', allowUnprotectedOutput: true })).bytes,
      saved.bytes,
    );
    const ordinary = await h.send({
      kind: 'load',
      format: 'hwpx',
      bytes: readFileSync('legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx'),
    });
    assert.equal(ordinary.error, undefined);
    assert.equal(ordinary.content.chartOleObservedRepairsAllowed, false);
    assert.equal(ordinary.content.passwordProtectionRemoved, undefined);
    assert.deepEqual(bytes, original);
  });
