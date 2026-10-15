import test from "node:test";
import assert from "node:assert/strict";
import { createdTableInlinePolicy } from "../../web/preview/created-table-inline-policy.mjs";

test("HWP5 generated inline policy reads native option fields and rejects unsupported geometry", () => {
  // Independent specimen of the native default creation snapshot.
  const policy = {
    common: { flags: 0x6a2211, offset_x: 0, offset_y: 0, z_order: 0, prevent_page_break: false, margins: [0, 0, 0, 0] },
    table: { page_break: 1, repeat_header: false, cell_spacing: 0, margins: [0, 0, 0, 0] },
    cell: { layout: "observed8", unknown: 0, attributes: 0, margins: [0, 0, 0, 0] },
  };
  const table = { hwp5Policy: policy }, before = structuredClone(table);
  assert.equal(createdTableInlinePolicy(table, "hwp5"), true);
  const changes = [
    value => { value.common.flags &= ~1; },
    value => { value.common.flags |= 2; },
    value => { value.common.flags |= 1 << 29; },
    value => { value.common.flags &= ~(7 << 15); },
    value => { value.common.offset_x = 1; },
    value => { value.common.margins[1] = 10; },
    value => { value.common.prevent_page_break = true; },
    value => { value.table.page_break = 3; },
    value => { value.table.repeat_header = true; },
    value => { value.table.cell_spacing = 1; },
    value => { value.cell.attributes = 1; },
    value => { value.cell.unknown = 1; },
    value => { value.cell.margins[0] = 1; },
  ];
  for (const change of changes) {
    const current = structuredClone(policy); change(current);
    assert.equal(createdTableInlinePolicy({ hwp5Policy: current }, "hwp5"), false);
  }
  assert.equal(createdTableInlinePolicy({}, "hwp5"), false);
  assert.equal(createdTableInlinePolicy(table, "unknown"), false);
  assert.deepEqual(table, before);
});
