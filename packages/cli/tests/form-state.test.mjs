import { prepareFormOperations } from '../src/mutations/form-state.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDocumentOperations } from '../src/document-operations.ts';
import { buildObjectReference, parseObjectReference } from '../src/object-reference.ts';
import { readFormInventory, renderFormInventory } from '../src/document-forms.ts';
const reference = buildObjectReference({
    sourceSha256: 'a'.repeat(64),
    format: 'hwp5',
    section: 0,
    kind: 'form',
    node: 10,
  }),
  base = { coordinates: 'current-transaction', reference };
test('strict shared form schema captures source-bound reference, exact state enums and owned text', () => {
  const operations = [
      { ...base, kind: 'form-checkbox-state', expectedState: 'UNCHECKED', state: 'CHECKED' },
      {
        ...base,
        kind: 'form-radio-select',
        expectedState: 'UNCHECKED',
        expectedGroupName: 'Group A',
      },
      { ...base, kind: 'form-text', expectedText: 'old', text: 'new😀' },
    ],
    captured = validateDocumentOperations(operations);
  assert.deepEqual(JSON.parse(JSON.stringify(captured)), operations);
  assert.notEqual(captured, operations);
  operations[2].text = 'changed';
  assert.equal(captured[2].text, 'new😀');
  assert.equal(parseObjectReference(reference).kind, 'form');
  for (const bad of [
    { ...captured[0], formNode: 10 },
    { ...captured[0], state: 'unknown' },
    { ...captured[0], expectedState: 'true' },
    { ...captured[2], text: '\ud800' },
    { ...captured[2], text: 'x'.repeat(65536) },
    { ...captured[0], coordinates: 'display' },
    { ...captured[0], reference: reference.replace('/form/', '/table/') },
  ])
    assert.throws(() => validateDocumentOperations([bad]));
});
for (const n of [32, 64, 128])
  test(`controlled form inventory ${n}: one flow index without per-control flow rescan`, () => {
    let flows = 0,
      reads = 0;
    const rows = Array.from({ length: n }, (_, i) => ({
        paragraph: i + 1,
        source_node: i + 100,
        host: 'body',
        top_level: true,
      })),
      sdk = {
        paragraphFlow() {
          flows++;
          return new Proxy(rows, {
            get(t, k, r) {
              if (typeof k === 'string' && /^[0-9]+$/.test(k)) reads++;
              return Reflect.get(t, k, r);
            },
          });
        },
        formSites: () =>
          rows.map((r, i) => ({
            formNode: i + 1,
            paragraph: r.paragraph,
            kind: 'check_button',
            anchorUnit: 0,
            state: 'located',
          })),
        formSourceAttributes: () => ({
          sourceOnly: true,
          kind: 'check_button',
          strings: { value: 'UNCHECKED', name: 'same' },
          booleans: { enabled: true, editable: true, triState: true },
          integers: {},
        }),
        checkBoxState: () => 'UNCHECKED',
      };
    const inventory = readFormInventory({
      format: 'hwpx',
      sourceSha256: 'a'.repeat(64),
      sectionCount: 1,
      sdk,
    });
    assert.equal(inventory.forms.length, n);
    assert.equal(flows, 1);
    assert.equal(reads, n);
    assert(
      inventory.forms.every(
        (row) => row.ownership === 'located' && row.current.state.scope === 'current',
      ),
    );
  });
test('form display uses the shared structure escaper and preserves unknown raw observations', () => {
  const inventory = {
    status: 'available',
    forms: [
      {
        reference,
        kind: 'check_box',
        fingerprint: 'private',
        source: { section: 0, node: 10, paragraph: 1, anchorUnit: 0 },
        current: {
          state: {
            state: 'unknown',
            value: null,
            raw: 'MYSTERY\u202e',
            scope: 'current',
            reason: 'Unknown',
          },
          text: { state: 'unavailable', value: null, reason: 'NoQuery', scope: 'current' },
        },
      },
    ],
  };
  const rendered = renderFormInventory(inventory);
  assert(!rendered.includes('\u202e'));
  assert(rendered.includes('MYSTERY'));
  assert(!rendered.includes('private'));
  assert.equal(inventory.forms[0].current.state.raw, 'MYSTERY\u202e');
});

test('empty Native form inventory performs no paragraph flow query', () => {
  const sdk = {
    formSites: () => [],
    formSourceAttributes() {
      throw Error('UnusedAttributeQuery');
    },
    checkBoxState() {
      throw Error('UnusedStateQuery');
    },
    paragraphFlow() {
      throw Error('UnnecessaryFlowScan');
    },
  };
  assert.deepEqual(
    readFormInventory({ format: 'hwpx', sourceSha256: 'a'.repeat(64), sectionCount: 1, sdk }),
    { status: 'available', forms: [] },
  );
});

test('absent Native inventory ABI retains its refusal reason without invoking a writer', () => {
  let writes = 0;
  const sdk = {
    supportsCheckBoxStateEdit: () => true,
    supportsSourceTableCellSplit: () => true,
    supportsFormSources: () => false,
    supportsFormProperties: () => false,
    sourceTableCellSplitBinding: () => ({ session: 'lease', revision: 0, serial: '0' }),
    setCheckBoxState() {
      writes++;
    },
  };
  const d = { format: 'hwp5', sourceSha256: 'a'.repeat(64), sectionCount: 1, sdk };
  assert.throws(
    () =>
      prepareFormOperations(d, [
        { ...base, kind: 'form-checkbox-state', expectedState: 'UNCHECKED', state: 'CHECKED' },
      ]),
    /Hwp5FormInventoryAbiUnavailable/,
  );
  assert.equal(writes, 0);
});
