import test from 'node:test';
import assert from 'node:assert/strict';
import { readFormInventory } from '../src/document-forms.ts';
function fixture(scoped, fail = false) {
  let active = false,
    begins = 0,
    ends = 0;
  const check = () => {
    if (scoped) assert(active, 'FormQueryOutsideScope');
  };
  const sdk = {
    formSites() {
      check();
      return [0, 1].map((i) => ({
        formNode: i,
        paragraph: i + 1,
        kind: 'check_button',
        anchorUnit: 0,
        state: 'located',
      }));
    },
    paragraphFlow() {
      check();
      return [0, 1].map((i) => ({
        paragraph: i + 1,
        source_node: i + 100,
        host: 'body',
        top_level: true,
      }));
    },
    formSourceAttributes(section, node) {
      check();
      if (fail && node === 1) throw Error('FormSourceProbe');
      return {
        sourceOnly: true,
        kind: 'check_button',
        strings: { value: 'UNCHECKED', name: 'Field' + node },
        booleans: { enabled: true, editable: true, triState: true },
        integers: {},
      };
    },
    checkBoxState() {
      check();
      return 'UNCHECKED';
    },
  };
  if (scoped)
    sdk.withReadObservations = (section, callback) => {
      assert.equal(active, false);
      begins++;
      active = true;
      try {
        return callback();
      } finally {
        active = false;
        ends++;
      }
    };
  return {
    document: { format: 'hwpx', sourceSha256: 'a'.repeat(64), sectionCount: 2, sdk },
    stats: () => ({ active, begins, ends }),
  };
}
test('optional current Native read scope covers inventory, owner flow and values without changing the result', () => {
  const fallback = fixture(false),
    scoped = fixture(true);
  const expected = readFormInventory(fallback.document);
  const actual = readFormInventory(scoped.document);
  assert.deepEqual(actual, expected);
  assert.deepEqual(scoped.stats(), { active: false, begins: 2, ends: 2 });
});
test('inventory provenance failure keeps its error and releases the optional synchronous scope', () => {
  const f = fixture(true, true);
  assert.throws(() => readFormInventory(f.document), /FormSourceProbe/);
  assert.deepEqual(f.stats(), { active: false, begins: 1, ends: 1 });
});

test('invalid optional adapters cannot skip, repeat or replace authoritative observations', () => {
  for (const [run, error] of [
    [(_section, _callback) => undefined, 'InvalidReadObservationScopeResult'],
    [
      (_section, callback) => {
        callback();
        return callback();
      },
      'DuplicateReadObservationCallback',
    ],
    [
      (_section, callback) => {
        callback();
        return {};
      },
      'InvalidReadObservationScopeResult',
    ],
  ]) {
    const f = fixture(false);
    f.document.sdk.withReadObservations = run;
    assert.throws(() => readFormInventory(f.document), new RegExp(error));
  }
});
