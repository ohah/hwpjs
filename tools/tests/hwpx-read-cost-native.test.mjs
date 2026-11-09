import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const required = (key) => {
  const value = process.env[key];
  assert(value && isAbsolute(value) && !/hwpers|title-column-roundtrip/i.test(value), key);
  return value;
};
const source = required('HWPJS_TEST_SOURCE_ROOT');
const candidate = required('HWPJS_TEST_WASM');
const baseline = required('HWPJS_TEST_BASE_WASM');
const fixture = required('HWPJS_TEST_NOORI_HWPX');
const hash = (b) => createHash('sha256').update(b).digest('hex');
const input = await readFile(fixture);
assert.equal(hash(input), '6ee9014f23650987803481e7aa51b3b2201f91f549dccfe34880469621d62aab');
const oldBytes = await readFile(baseline),
  newBytes = await readFile(candidate);
assert.equal(hash(oldBytes), '38c4dd02eafacefb89318b46c001f787716c997cf15f660e66d44a92b08aecc0');
assert.equal(hash(newBytes), process.env.HWPJS_TEST_WASM_SHA256);
const oldModule = await WebAssembly.compile(oldBytes),
  newModule = await WebAssembly.compile(newBytes);
assert.deepEqual(WebAssembly.Module.imports(newModule), [], 'No diagnostic phase imports');
const exportsFor = (m) =>
  WebAssembly.Module.exports(m)
    .map((x) => `${x.kind}:${x.name}`)
    .sort();
assert.deepEqual(exportsFor(newModule), exportsFor(oldModule));
const { createHwpxEditor } = await import(pathToFileURL(resolve(source, 'js/hwpx-editor.mjs')));

test('real WASM original table inventory survives cold, warm and repeated observation scopes', async () => {
  const previous = await createHwpxEditor(oldModule);
  let expected;
  try {
    previous.open(input);
    expected = previous.tableBorderSources(0);
    assert(expected.cells.length > 0 && expected.styles.length > 0);
  } finally {
    previous.close();
  }
  const sdk = await createHwpxEditor(newModule);
  try {
    sdk.open(input);
    assert.deepEqual(sdk.tableBorderSources(0), expected);
    for (const warm of [false, true, false, true]) {
      const result = sdk.withReadObservations(0, () => {
        assert.throws(
          () => sdk.splice(0, 1, 0, 0, 'probe'),
          /ReadObservationScopeActive/,
          'The read scope must actually be active, not a preparation fallback',
        );
        if (warm) {
          sdk.characterShapes();
          sdk.fontFaceMetadata();
        }
        const first = sdk.tableBorderSources(0);
        const second = sdk.tableBorderSources(0);
        assert.deepEqual(second, first);
        return first;
      });
      assert.deepEqual(result, expected);
    }
    assert.deepEqual(sdk.tableBorderSources(0), expected);
  } finally {
    sdk.close();
  }
});

test('complete AI document model, text, Markdown and diagnostics remain equal', async () => {
  const { openDocument } = await import(
    pathToFileURL(resolve(source, 'packages/cli/src/engine.ts'))
  );
  const { readDocumentModel } = await import(
    pathToFileURL(resolve(source, 'packages/cli/src/document-model.ts'))
  );
  const { renderDocument } = await import(
    pathToFileURL(resolve(source, 'packages/cli/src/render.ts'))
  );
  const values = [];
  for (const wasm of [oldBytes, newBytes]) {
    const doc = await openDocument({ bytes: input, wasm });
    try {
      const view = await readDocumentModel({
        format: doc.format,
        sourceSha256: doc.sourceSha256,
        sectionCount: doc.sectionCount,
        sdk: doc.sdk,
      });
      assert.deepEqual(view.warnings, [], 'No silently degraded table observations');
      values.push({
        view,
        text: renderDocument(view, { format: 'text', view: 'content' }),
        markdown: renderDocument(view, { format: 'markdown', view: 'content' }),
      });
    } finally {
      doc.close();
    }
  }
  assert.deepEqual(values[1], values[0]);
});

test('original and edited HWPX archives stay byte-identical across engine versions', async () => {
  for (const name of [
    'noori.hwpx',
    'charshape.hwpx',
    'facename.hwpx',
    'parashape.hwpx',
    'table.hwpx',
    'hyperlink.hwpx',
  ]) {
    const bytes = await readFile(
      resolve(source, 'legacy/rust/crates/hwp-core/tests/fixtures', name),
    );
    const outputs = [];
    for (const module of [oldModule, newModule]) {
      const sdk = await createHwpxEditor(module);
      try {
        sdk.open(bytes);
        const original = sdk.save();
        let paragraph = 1;
        while (paragraph < 1000 && !sdk.canEdit(0, paragraph)) paragraph++;
        assert(paragraph < 1000);
        sdk.splice(0, paragraph, 0, 0, 'ReadCost');
        sdk.setCharacterProperties({
          section: 0,
          paragraph,
          startUnit: 0,
          endUnit: 1,
          properties: { size: 2400, bold: true },
        });
        outputs.push({ original, edited: sdk.save() });
      } finally {
        sdk.close();
      }
    }
    assert.deepEqual(outputs[1], outputs[0], name);
  }
});
