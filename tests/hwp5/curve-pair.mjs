import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { sectionXml } from "./fixture-xml.mjs";
import { documentRecords } from "./documents.mjs";
import { curveRun } from "./shape-curve.mjs";
export function curvePair(call, cfb) {
  const root = new URL('../../reference/rhwp/samples/', import.meta.url), files = [], skipped = [];
  for (const [name, section, count] of [['2025 행정업무운영 편람(최종)', 4, 2], ['3-09월_교육_통합_2022', 0, 1], ['3-09월_교육_통합_2024-구분선아래20구분선위20', 0, 1]]) {
    const hwp = new URL(`${name}.hwp`, root), hwpx = new URL(`${name}.hwpx`, root);
    if (!existsSync(hwp) || !existsSync(hwpx)) { skipped.push(name); continue; }
    cfb.parse(readFileSync(hwp), {strict: true}); const h = Buffer.from(cfb.findExact('/FileHeader').content);
    const b = call(3, Buffer.concat([h, Buffer.from(cfb.findExact(`/BodyText/Section${section}`).content)]));
    const records = documentRecords(b).filter(r => r.tag === 83), xml = sectionXml(readFileSync(hwpx), section);
    const elements = [...xml.matchAll(/<hp:curve\b[\s\S]*?<\/hp:curve>/g)].map(m => m[0]);
    assert.equal(records.length, count); assert.equal(elements.length, count); let segments = 0;
    for (let i = 0; i < count; i++) {
      const actual = curveRun(call, b.subarray(records[i].start, records[i].end)), points = actual.readUInt32LE();
      const pieces = [...elements[i].matchAll(/<hp:seg\b([^>]*)\/>/g)].map(m => m[1]);
      assert.equal(pieces.length, points - 1); assert.equal(actual.readUInt32LE(4 + points * 8), pieces.length);
      pieces.forEach((attributes, j) => {
        const xy = ['x1', 'y1', 'x2', 'y2'].map(key => Number(attributes.match(new RegExp(`\\b${key}="(-?\\d+)"`))[1]));
        assert.deepEqual(Array.from({length: 4}, (_, k) => actual.readInt32LE(4 + j * 8 + k * 4)), xy);
        const kind = attributes.match(/\btype="(LINE|CURVE)"/)[1];
        assert.equal(actual[8 + points * 8 + j], kind === 'LINE' ? 0 : 1);
      }); segments += pieces.length;
    }
    files.push({name, section, curves: count, segments});
  }
  for (const section of [-1, 1.5, NaN, 65536]) assert.throws(() => sectionXml(Buffer.alloc(0), section));
  return {files, skipped};
}
