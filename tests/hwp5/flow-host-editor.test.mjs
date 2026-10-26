import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createExperimentalHwp5Editor } from "../../js/hwp5-editor.mjs";
import { inspect, records } from "./style-preservation/text-record-oracle.mjs";
const wasm = readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm");
test("actual HWP5 nested paragraph hosts agree with independent record parents and list groups", async () => {
  for (const name of ["table", "table-caption", "headerfooter", "footnote-endnote"]) {
    const input = readFileSync(`legacy/rust/crates/hwp-core/tests/fixtures/${name}.hwp`),
      sections = inspect(input).sections;
    const editor = await createExperimentalHwp5Editor(wasm, input);
    try {
      for (const [section, value] of sections.entries()) {
        const all = records(value.bytes),
          stack = [],
          parents = [],
          tableMarkers = new Map();
        for (const [index, record] of all.entries()) {
          stack.length = record.level;
          parents[index] = stack.at(-1) ?? null;
          stack.push(index);
          if (record.tag === 77) tableMarkers.set(parents[index], index);
        }
        const lists = new Map(),
          expected = [];
        for (const [index, record] of all.entries()) {
          const parent = parents[index];
          if (record.tag === 72) lists.set(parent, index);
          if (record.tag !== 66) continue;
          let host = "body",
            list_node = null;
          if (parent !== null) {
            list_node = lists.get(parent);
            assert(Number.isInteger(list_node));
            const owner = all[parent];
            assert.equal(owner.tag, 71);
            const id = owner.payload.readUInt32LE(0);
            if (id === 0x74626c20)
              host = list_node < tableMarkers.get(parent) ? "table_caption" : "table_cell";
            else
              host =
                new Map([
                  [0x68656164, "header"],
                  [0x666f6f74, "footer"],
                  [0x666e2020, "footnote"],
                  [0x656e2020, "endnote"],
                ]).get(id) ?? "other";
          }
          expected.push({ source_node: index, parent_node: parent, host, list_node });
        }
        const actual = editor
          .paragraphFlow(section)
          .map(({ source_node, parent_node, host, list_node }) => ({
            source_node,
            parent_node,
            host,
            list_node,
          }));
        assert.deepEqual(actual, expected, name);
      }
      assert.deepEqual(Buffer.from(editor.save().bytes), input);
    } finally {
      editor.close();
    }
  }
});
