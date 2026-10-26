import test from 'node:test';
import assert from 'node:assert/strict';
import { adjacentCell } from '../../web/preview/table-navigation.mjs';
import { attachCreatedTableFlow } from '../../web/preview/created-table-flow.mjs';
test('generated Tab navigation retains table identity and refuses missing geometry and table edges', () => {
  const table = {
    section: 0,
    identity: '9007199254740993',
    hostParagraph: 0,
    anchorUnit: 0,
    rows: 2,
    columns: 2,
    resources: { character: 1 },
    cells: [0, 1, 2, 3].map((index) => ({
      row: Math.floor(index / 2),
      column: index % 2,
      width: 7200,
      height: 1000,
      text: '',
    })),
  };
  const content = { paragraphs: [], createdTables: [table] };
  const base = {
    height: 28,
    boxes: [],
    rows: [{ section: 0, paragraph: 0, kind: 'text', y: 0, height: 28, width: 200 }],
  };
  const layout = attachCreatedTableFlow(content, base, () => ({ width: 8, height: 16 }));
  const target = (row, column) => ({
    section: 0,
    createdCell: { identity: table.identity, row, column },
  });
  assert.deepEqual(
    adjacentCell(content, layout, target(0, 1)).createdCell,
    target(1, 0).createdCell,
  );
  assert.deepEqual(
    adjacentCell(content, layout, target(1, 0), true).createdCell,
    target(0, 1).createdCell,
  );
  assert.equal(adjacentCell(content, layout, target(0, 0), true), null);
  assert.equal(adjacentCell(content, layout, target(1, 1)), null);
  assert.equal(adjacentCell(content, { rows: [] }, target(0, 0)), null);
  assert.equal(
    adjacentCell(content, layout, {
      ...target(0, 0),
      createdCell: { ...target(0, 0).createdCell, identity: '2' },
    }),
    null,
  );
});
