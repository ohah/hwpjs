import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorWritePolicy } from '../src/editor/write-policy.ts';

// Pure policy publication fault injection; these are not Native engine cases.
test('initial/read-only policy rejects writes without restricting observation', () => {
  const policy = new EditorWritePolicy();
  assert.throws(() => policy.assertWritable(), /ReadOnlyDocument/);
  const native = {
    readOnly: false,
    paragraphs: [{ text: 'owned text', editable: true }],
    resourceAvailable: true,
  };
  const observed = policy.observe(native) as typeof native;
  assert.equal(observed.readOnly, true);
  assert.equal(observed.paragraphs[0].editable, false);
  assert.equal(observed.paragraphs[0].text, native.paragraphs[0].text);
  assert.equal(native.readOnly, false);
  assert.equal(native.paragraphs[0].editable, true);
  assert.deepEqual(policy.capabilities({ historyAvailable: true, resourceAvailable: true }), {
    readOnly: true,
    historyAvailable: false,
    resourceAvailable: true,
  });
});
test('candidate projection does not publish its admission policy', () => {
  const policy = new EditorWritePolicy(),
    content = { readOnly: false };
  assert.equal(policy.observe(content, true), content);
  assert.throws(() => policy.assertWritable(), /ReadOnlyDocument/);
  policy.publish(true, () => {});
  assert.equal(policy.observe(content), content);
  assert.equal((policy.observe(content, false) as typeof content).readOnly, true);
  policy.assertWritable();
});
test('failed writable candidate publication restores previous read-only policy', () => {
  const policy = new EditorWritePolicy(),
    failure = Error('publication-fault');
  assert.throws(
    () =>
      policy.publish(true, () => {
        policy.assertWritable();
        throw failure;
      }),
    (error) => error === failure,
  );
  assert.throws(() => policy.assertWritable(), /ReadOnlyDocument/);
});
test('failed read-only candidate publication restores previous writable policy', () => {
  const policy = new EditorWritePolicy(),
    failure = Error('publication-fault');
  policy.publish(true, () => {});
  assert.throws(
    () =>
      policy.publish(false, () => {
        assert.throws(() => policy.assertWritable(), /ReadOnlyDocument/);
        throw failure;
      }),
    (error) => error === failure,
  );
  policy.assertWritable();
});
