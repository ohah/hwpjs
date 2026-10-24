import test from "node:test";
import assert from "node:assert/strict";
import { attachHwp5PageAreas, hwp5PageArea } from "../../web/preview/hwp5-page-area-content.mjs";
const source = { kind: "header", owner_node: 1, list_node: 2, paragraph_count: 1, control_attributes: 0, list_attributes: 0, list_unknown: 0, width: 42520, height: 4252, text_references: 0, number_references: 0, control_extra_bytes: 4, control_extra_nonzero: false, list_extra_bytes: 16, list_extra_nonzero: false };
test("page area mapping preserves source flags and refuses unknown semantics", () => {
  assert.deepEqual(hwp5PageArea({ ...source, control_extra_nonzero: true, control_instance_id: 0xffffffff }), hwp5PageArea(source));
  for (const [flags, apply] of [[0, "both"], [1, "even"], [2, "odd"]]) for (const [alignment, name] of [[0, "top"], [32, "center"], [64, "bottom"]]) {
    const row = { ...source, control_attributes: flags, list_attributes: alignment };
    assert.deepEqual(hwp5PageArea(row), { owner_node: 1, list_node: 2, apply, width: 42520, height: 4252, vertical_alignment: name });
  }
  for (const patch of [{ control_attributes: 3 }, { control_attributes: 4 }, { list_attributes: 96 }, { list_unknown: null }, { text_references: 1 }, { width: 0 }, { list_extra_bytes: 15 }, { control_extra_nonzero: true }]) assert.throws(() => hwp5PageArea({ ...source, ...patch }));
});
test("page area attachment preflights current owner and clears stale inventory", () => {
  const content = { currentParagraphFlows: [{ section: 0, paragraph: 1, host: "header", list_node: 2, parent_node: 1 }], pageAreaSources: ["stale"] };
  attachHwp5PageAreas({ pageAreaSources: () => [source] }, content);
  assert.deepEqual(content.pageAreaSources, [{ ...source, section: 0 }]);
  assert.deepEqual(content.pageAreaSourceErrors, []);
  for (const rows of [[source, source], [{ ...source, list_node: 3 }], [source, { ...source, owner_node: 3, list_node: 4 }], []]) {
    attachHwp5PageAreas({ pageAreaSources: () => rows }, content);
    assert.equal(content.pageAreaSources.length, 0); assert.equal(content.pageAreaSourceErrors.length, 1);
  }
  attachHwp5PageAreas(null, content);
  assert.deepEqual(content.pageAreaSourceErrors, []); assert.deepEqual(content.pageAreaSources, []);
});

test('zero page-area height remains explicit in HWP5 projection',()=>{
 const input={...source,height:0},before=structuredClone(input);
 assert.equal(hwp5PageArea(input).height,0);assert.deepEqual(input,before);
});
