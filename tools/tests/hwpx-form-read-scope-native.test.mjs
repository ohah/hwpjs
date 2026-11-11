import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createHwpxEditor } from '../../js/hwpx-editor.mjs';
import { createNewDocumentBytes } from '../../js/new-document.mjs';
const path = process.env.HWPJS_TEST_WASM,
  pin = process.env.HWPJS_TEST_WASM_SHA256;
assert(
  typeof path === 'string' &&
    isAbsolute(path) &&
    !path.split('/').includes('..') &&
    !/hwpers|title-column-roundtrip/i.test(path),
  'ExplicitAllowedNativePathRequired',
);
assert.match(pin ?? '', /^[a-f0-9]{64}$/);
const wasm = readFileSync(path);
assert.equal(createHash('sha256').update(wasm).digest('hex'), pin);
const module = await WebAssembly.compile(wasm),
  helper = fileURLToPath(new URL('./hwpx-form-read-scope-fixture.py', import.meta.url));
function python(mode, bytes) {
  const p = spawnSync(process.env.HWPJS_TEST_PYTHON ?? 'python3', ['-I', '-B', helper, mode], {
    input: bytes,
    maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(p.status, 0, p.stderr?.toString());
  return p.stdout;
}
const fixture = new Uint8Array(python('fixture', await createNewDocumentBytes(module, 'hwpx')));
async function session(callback) {
  const e = await createHwpxEditor(module);
  try {
    e.open(fixture);
    e.enableHistoryV2();
    return await callback(e, e.formSites(0));
  } finally {
    e.close();
  }
}
test('Native form scoped reads preserve source duplicate names UTF16 and raw save bytes', () =>
  session((e, rows) => {
    assert.equal(rows.length, 5);
    const values = e.withReadObservations(0, () =>
      rows.map((r) =>
        r.kind === 'check_button'
          ? e.checkBoxState(0, r.formNode)
          : r.kind === 'radio_button'
            ? e.radioButtonState(0, r.formNode)
            : e.formText(0, r.formNode),
      ),
    );
    assert.deepEqual(values, ['first😀é', 'second😀', 'UNCHECKED', 'CHECKED', 'protected😀']);
    assert.deepEqual(e.save(), fixture);
    assert.throws(
      () =>
        e.withReadObservations(0, () => {
          e.formText(0, rows[0].formNode);
          throw Error('callback-failure');
        }),
      /callback-failure/,
    );
    assert.equal(e.formText(0, rows[0].formNode), 'first😀é');
  }));
test('Native scoped getters never authorize a write or consume managed redo', () =>
  session((e, rows) => {
    const target = rows[0].formNode;
    assert.throws(
      () =>
        e.withReadObservations(0, () =>
          e.setFormText({ section: 0, formNode: target, text: 'BAD' }),
        ),
      /ReadObservationScopeActive/,
    );
    assert.deepEqual(e.save(), fixture);
    e.setFormText({ section: 0, formNode: target, text: 'updated😀' });
    const after = e.save();
    assert.equal(e.undo(), true);
    assert.deepEqual(e.save(), fixture);
    const revision = e.historyRevision(),
      redo = e.historyStats().redoCount;
    e.withReadObservations(0, () => e.formText(0, target));
    e.setFormText({ section: 0, formNode: target, text: 'first😀é' });
    assert.equal(e.historyRevision(), revision);
    assert.equal(e.historyStats().redoCount, redo);
    assert.equal(e.redo(), true);
    assert.deepEqual(e.save(), after);
  }));
test('Native protected source stays readable but a rejected write changes no bytes', () =>
  session((e, rows) => {
    const target = rows[4].formNode;
    assert.equal(
      e.withReadObservations(0, () => e.formText(0, target)),
      'protected😀',
    );
    assert.throws(
      () => e.setFormText({ section: 0, formNode: target, text: 'BAD' }),
      /FormValueProtected/,
    );
    assert.deepEqual(e.save(), fixture);
  }));
test('Native form value edit survives reopen and independent XML preserves body and other fields', () =>
  session(async (e, rows) => {
    const before = JSON.parse(python('inspect', fixture));
    e.setFormText({ section: 0, formNode: rows[0].formNode, text: 'updated😀' });
    const after = e.save(),
      observed = JSON.parse(python('inspect', after));
    assert.deepEqual(observed.bodyText, before.bodyText);
    assert.deepEqual(observed.forms[0].attributes, before.forms[0].attributes);
    assert.equal(observed.forms[0].text, 'updated😀');
    assert.deepEqual(observed.forms.slice(1), before.forms.slice(1));
    const reopened = await createHwpxEditor(module);
    try {
      reopened.open(after);
      assert.equal(
        reopened.withReadObservations(0, () =>
          reopened.formText(0, reopened.formSites(0)[0].formNode),
        ),
        'updated😀',
      );
    } finally {
      reopened.close();
    }
  }));
