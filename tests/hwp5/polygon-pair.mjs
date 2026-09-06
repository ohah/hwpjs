import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { sectionXml } from "./fixture-xml.mjs";
import { documentRecords } from "./documents.mjs";
import { polygonRun } from "./shape-polygon.mjs";
export function polygonPair(call, cfb) {
  const root = new URL('../../reference/rhwp/samples/', import.meta.url), files = [], skipped = [];
  for (const [hwpName, xmlName, count] of [['table-vpos-01', 'table-vpos-01', 2], ['shape-001', 'hwpx/shape-001', 2], ['hwp3-sample11-hwp5', 'hwp3-sample11-hwpx', 21]]) {
    const hwp = new URL(`${hwpName}.hwp`, root), hwpx = new URL(`${xmlName}.hwpx`, root);
    if (!existsSync(hwp) || !existsSync(hwpx)) { skipped.push(hwpName); continue; }
    cfb.parse(readFileSync(hwp), {strict: true}); const h = Buffer.from(cfb.findExact('/FileHeader').content);
    const b = call(3, Buffer.concat([h, Buffer.from(cfb.findExact('/BodyText/Section0').content)]));
    const records = documentRecords(b).filter(r => r.tag === 82), xml = sectionXml(readFileSync(hwpx));
    const elements = [...xml.matchAll(/<hp:polygon\b[\s\S]*?<\/hp:polygon>/g)].map(m => m[0]);
    assert.equal(records.length, count); assert.equal(elements.length, count); let points = 0;
    for (let i = 0; i < count; i++) {
      const actual = polygonRun(call, b.subarray(records[i].start, records[i].end));
      const coordinates = [...elements[i].matchAll(/<hc:pt\b([^>]*)\/>/g)].map(m => ['x', 'y'].map(key => Number(m[1].match(new RegExp(`\\b${key}="(-?\\d+)"`))[1])));
      assert.equal(actual.readUInt32LE(), coordinates.length);
      coordinates.forEach(([x, y], index) => assert.deepEqual([actual.readInt32LE(4 + index * 8), actual.readInt32LE(8 + index * 8)], [x, y]));
      points += coordinates.length;
    }
    files.push({name: hwpName, polygons: count, points});
  }
  return {files, skipped};
}
