import test from 'node:test';
import assert from 'node:assert/strict';
import { insertHwp5Table } from '../../web/preview/hwp5-table-creation-command.mjs';
const reference = {
  epoch: '4',
  scope: 'test:1',
  kind: 'generated',
  section: 0,
  id: '9',
  row: 0,
  column: 0,
};
const options = {
  rows: 1,
  columns: 1,
  width: 1000,
  rowHeight: 1000,
  resources: { paragraph: 0, character: 0, style: 0, border_fill: 0 },
};
function fixture(ref = reference) {
  const events = [];
  const editor = {
    supportsCurrentSourceReferences: () => true,
    paragraphFlow: () =>
      Array.from({ length: 8 }, (_, paragraph) => ({ paragraph, host: 'body', top_level: true })),
    currentSourceReferences(section, window) {
      events.push(['query', section, window]);
      return { version: 1, total: 8, first: 3, references: [ref] };
    },
    insertTable(request) {
      events.push(['insert', request]);
      return 'table-1';
    },
  };
  const message = { section: 0, paragraph: 3, unit: 7, options, reference: { ...reference } };
  return { editor, message, events };
}
test('generated binding uses source slot, never converts generated ID into paragraph ordinal', () => {
  const f = fixture();
  assert.equal(insertHwp5Table(f.editor, f.message), 'table-1');
  assert.deepEqual(f.events[0], ['query', 0, { first: 3, count: 1 }]);
  assert.equal(f.events[1][1].paragraph, 3);
  assert.equal(f.events[1][1].unit, 7);
  assert.equal(f.events.length, 2);
});
for (const key of Object.keys(reference))
  test(`mismatched ${key} denies before insertion`, () => {
    const f = fixture();
    f.message.reference[key] =
      key === 'section' || key === 'row' || key === 'column' ? 1 : 'different';
    assert.throws(() => insertHwp5Table(f.editor, f.message), /InvalidCurrentTableReference/);
    assert.equal(f.events.filter((e) => e[0] === 'insert').length, 0);
  });
for (const variant of ['absent', 'null', 'extra', 'symbol', 'accessor', 'inherited', 'cell'])
  test(`malformed reference ${variant} cannot mutate`, () => {
    const f = fixture();
    let reads = 0;
    if (variant === 'absent') f.message.reference = undefined;
    if (variant === 'null') f.message.reference = null;
    if (variant === 'extra') f.message.reference.extra = 1;
    if (variant === 'symbol') f.message.reference[Symbol()] = 1;
    if (variant === 'accessor')
      Object.defineProperty(f.message.reference, 'epoch', {
        get() {
          reads++;
          return '4';
        },
      });
    if (variant === 'inherited') f.message.reference = Object.create(reference);
    if (variant === 'cell') f.message.reference.kind = 'cell';
    assert.throws(() => insertHwp5Table(f.editor, f.message), /InvalidCurrentTableReference/);
    assert.equal(reads, 0);
    assert.equal(f.events.length, 0);
  });
test('missing source ABI fails closed without ordinal insertion', () => {
  const f = fixture();
  f.editor.supportsCurrentSourceReferences = () => false;
  assert.throws(
    () => insertHwp5Table(f.editor, f.message),
    /Hwp5CurrentSourceReferenceAbiUnavailable/,
  );
  assert.equal(f.events.length, 0);
});
for (const patch of [
  { version: 2 },
  { first: 4 },
  { total: 3 },
  { references: [] },
  { references: [reference, reference] },
])
  test(`invalid source window ${JSON.stringify(patch)} denies mutation`, () => {
    const f = fixture();
    const query = f.editor.currentSourceReferences;
    f.editor.currentSourceReferences = (...args) => ({ ...query(...args), ...patch });
    assert.throws(() => insertHwp5Table(f.editor, f.message), /InvalidCurrentTableReference/);
    assert.equal(f.events.filter((e) => e[0] === 'insert').length, 0);
  });
test('legacy direct ordinal request remains a separate compatibility path', () => {
  const f = fixture();
  delete f.message.reference;
  insertHwp5Table(f.editor, f.message);
  assert.deepEqual(
    f.events.map((e) => e[0]),
    ['insert'],
  );
});

for (const host of [
  'table_cell',
  'table_caption',
  'header',
  'footer',
  'drawing',
  'footnote',
  'endnote',
  'other',
])
  test(`matching source identity in ${host} is not a body insertion target`, () => {
    const f = fixture();
    f.editor.paragraphFlow = () =>
      Array.from({ length: 8 }, (_, paragraph) => ({
        paragraph,
        host: paragraph === 3 ? host : 'body',
        top_level: paragraph !== 3,
      }));
    assert.throws(() => insertHwp5Table(f.editor, f.message), /UnsupportedTableInsertOwner/);
    assert.equal(f.events.filter((e) => e[0] === 'insert').length, 0);
  });
