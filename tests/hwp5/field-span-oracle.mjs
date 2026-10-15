// Independent record/list and UTF-16 marker scan; no product model or coordinates.
import assert from "node:assert/strict";
import { records } from "./style-preservation/text-record-oracle.mjs";

const kinds = new Set([0x25686c6b, 0x25636c6b, 0x25626d6b, 0x25787266, 0x25666d75]);
export function independentFieldSpans(bytes) {
  const all = records(bytes), ancestors = [], parents = [], latestList = new Map(), paragraphs = [];
  for (const [index, row] of all.entries()) {
    while (ancestors.length && all[ancestors.at(-1)].level >= row.level) ancestors.pop();
    const parent = ancestors.at(-1) ?? null;
    parents[index] = parent;
    if (row.tag === 72) latestList.set(parent, index);
    if (row.tag === 66) {
      const list = parent === null ? null : latestList.get(parent);
      assert(parent === null || list !== undefined, "missing independent logical list");
      paragraphs.push({ node: index, scope: parent === null ? "root" : `${parent}:${list}` });
    }
    ancestors.push(index);
  }
  const states = new Map(), spans = [];
  for (const [paragraph, item] of paragraphs.entries()) {
    if (!states.has(item.scope)) states.set(item.scope, []);
    const opened = states.get(item.scope);
    const direct = all.flatMap((row, index) => parents[index] === item.node ? [{ ...row, index }] : []);
    const textRows = direct.filter(row => row.tag === 67);
    assert(textRows.length <= 1, "duplicate independent paragraph text");
    const headers = direct.filter(row => row.tag === 71 && row.payload.length >= 4 && kinds.has(row.payload.readUInt32LE(0)));
    const text = textRows[0]?.payload ?? Buffer.alloc(0);
    assert.equal(text.length % 2, 0);
    let ordinal = 0;
    for (let unit = 0; unit < text.length / 2;) {
      const code = text.readUInt16LE(unit * 2), width = code >= 1 && code <= 23 && code !== 10 && code !== 13 ? 8 : 1;
      assert(unit + width <= text.length / 2, "truncated independent control");
      if (code === 3) {
        const field_id = text.readUInt32LE(unit * 2 + 2), header = headers[ordinal];
        assert(header && header.payload.readUInt32LE(0) === field_id, "independent field header mismatch");
        opened.push({ source_node: header.index, field_id, ordinal: ordinal++, begin: { paragraph, unit: unit + width } });
      } else if (code === 4) {
        const start = opened.pop(), end = text.readUInt32LE(unit * 2 + 2);
        assert(start, "unbound independent field end");
        const lower = start.field_id & 0xffffff;
        const special = new Map([[0x25636c6b, 9], [0x25626d6b, 2], [0x25666d75, 8]]).get(start.field_id);
        assert(end === start.field_id || end === lower || special !== undefined && end === ((lower | special << 24) >>> 0), "independent field end mismatch");
        spans.push({ ...start, end: { paragraph, unit } });
      }
      unit += width;
    }
    assert.equal(ordinal, headers.length, "unbound independent field header");
  }
  for (const opened of states.values()) assert.equal(opened.length, 0, "unclosed independent field");
  return spans;
}
