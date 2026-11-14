import test from 'node:test';
import assert from 'node:assert/strict';
import { Document, all, fire } from './fake-dom.mjs';
import { createInlineObjectInsertDataGrid } from '../src/inline-object-insert-data-grid.ts';

function fixture() {
  const doc = new Document();
  const create = doc.createElement.bind(doc);
  // The shared ownership/event fixture lacks insertBefore. Supply that DOM
  // operation locally; never replace the real grid constructor or collect().
  doc.createElement = (tag: string) => {
    const node = create(tag);
    node.insertBefore = (
      child: ReturnType<typeof create>,
      before: ReturnType<typeof create> | null,
    ) => {
      if (before === null) {
        node.append(child);
      } else {
        assert.equal(before.parentElement, node);
        child.remove();
        child.parentElement = node;
        node.children.splice(node.children.indexOf(before), 0, child);
      }
      return child;
    };
    return node;
  };
  const host = doc.createElement('main');
  let edits = 0;
  const grid = createInlineObjectInsertDataGrid(host as unknown as HTMLElement, () => ++edits);
  function input(label: string) {
    const found = all(
      host,
      (node: ReturnType<typeof create>) => node.getAttribute('aria-label') === label,
    );
    assert.equal(found.length, 1, label);
    return found[0];
  }
  function edit(label: string, value: string) {
    const node = input(label);
    node.value = value;
    fire(node, 'input');
    return node;
  }
  return { doc, grid, input, edit, edits: () => edits };
}
const defaults = () => ({
  categories: ['항목 1', '항목 2', '항목 3'],
  series: [{ name: '계열 1', values: [10, 20, 30] }],
});

test('default grid collect returns the real creation DTO without a missing column binding', () => {
  const { grid } = fixture();
  assert.deepEqual(grid.collect(), defaults());
});

test('grid collects edited names and finite decimal/exponent values into independent results', () => {
  const { grid, edit } = fixture();
  const original = grid.collect();
  edit('계열 1 이름', ' 매출 ');
  edit('범주 1', ' 서울 ');
  edit('범주 1, 계열 1 값', '-2.5e1');
  edit('범주 2, 계열 1 값', '+.5');
  assert.deepEqual(grid.collect(), {
    categories: ['서울', '항목 2', '항목 3'],
    series: [{ name: '매출', values: [-25, 0.5, 30] }],
  });
  assert.deepEqual(original, defaults());
});

test('grid rejects a nonfinite value, focuses the field and clears its error on correction', () => {
  const { doc, grid, edit, edits } = fixture();
  const node = edit('범주 2, 계열 1 값', '1e999');
  assert.throws(() => grid.collect(), /2번째 범주의 1번째 계열 값을 유한한 숫자로/);
  assert.equal(doc.activeElement, node);
  assert.equal(node.getAttribute('aria-invalid'), 'true');
  const before = edits();
  edit('범주 2, 계열 1 값', '-12.5');
  assert.equal(edits(), before + 1);
  assert.equal(node.getAttribute('aria-invalid'), null);
  assert.deepEqual(grid.collect(), {
    categories: ['항목 1', '항목 2', '항목 3'],
    series: [{ name: '계열 1', values: [10, -12.5, 30] }],
  });
});
