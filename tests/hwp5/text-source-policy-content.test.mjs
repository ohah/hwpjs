import test from 'node:test';
import assert from 'node:assert/strict';
import { attachHwp5TextSourcePolicy } from '../../web/preview/hwp5-text-source-policy.mjs';

test('text source policy decorates each section once without granting protected paragraph permissions', () => {
  const calls = [],
    editor = {
      supportsTextSourcePolicy: () => true,
      validateTextSourcePolicy(section) {
        calls.push(section);
        if (section === 1) throw new Error('UnsupportedSectionControl');
      },
    };
  const content = {
    paragraphs: [
      { section: 0, editable: true },
      { section: 0, editable: false },
      { section: 1, editable: true },
      { section: 1, editable: false, selectable: true },
      { section: 1, editable: true, clipped: true },
    ],
  };
  assert.equal(attachHwp5TextSourcePolicy(editor, content), content);
  assert.deepEqual(calls, [0, 1]);
  assert.deepEqual(
    content.paragraphs.map((row) => row.editable),
    [true, false, false, false, false],
  );
  assert.deepEqual(
    content.paragraphs.slice(2).map((row) => row.selectable),
    [true, true, false],
  );
  assert.equal(content.readOnly, false);
  assert.equal(content.paragraphs[0].textSourcePolicyError, null);
  assert.equal(content.paragraphs[2].textSourcePolicyError, 'UnsupportedSectionControl');
  attachHwp5TextSourcePolicy(editor, { paragraphs: [{ section: 1, editable: true }] });
  assert.deepEqual(calls, [0, 1, 1], 'no cache survives a display response');
});

test('text source policy keeps unknown ABI compatibility distinct and query failures fail closed', () => {
  const legacy = { paragraphs: [{ section: 0, editable: true }] };
  attachHwp5TextSourcePolicy({}, legacy);
  assert.equal(legacy.textSourcePolicyAvailable, false);
  assert.equal(
    legacy.paragraphs[0].editable,
    true,
    'old ABI behavior is not presented as a checked native result',
  );
  for (const failure of [new Error('OutOfMemory'), 'unknown']) {
    const content = { paragraphs: [{ section: 0, editable: true }] };
    attachHwp5TextSourcePolicy(
      {
        supportsTextSourcePolicy: () => true,
        validateTextSourcePolicy() {
          throw failure;
        },
      },
      content,
    );
    assert.equal(content.readOnly, true);
    assert.equal(content.paragraphs[0].editable, false);
    assert.equal(content.paragraphs[0].selectable, true);
    assert.equal(
      content.paragraphs[0].textSourcePolicyError,
      failure instanceof Error ? 'OutOfMemory' : 'TextSourcePolicyQueryFailed',
    );
  }
});
