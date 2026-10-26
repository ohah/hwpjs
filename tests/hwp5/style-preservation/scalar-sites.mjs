import assert from 'node:assert/strict';
import { records, paragraphRecords } from './text-record-oracle.mjs';

/** Original binary offsets only; no native display or editor positions. */
export function variedScalarSites(parsed) {
  const rows = [];
  for (const [section, row] of parsed.sections.entries()) {
    const count = records(row.bytes).filter((record) => record.tag === 66).length;
    for (let paragraph = 0; paragraph < count; paragraph++) {
      const owner = paragraphRecords(row.bytes, paragraph);
      const text = owner.direct.find(
        (record) => record.tag === 67 && record.level === owner.head.level + 1,
      )?.payload;
      if (!text) continue;
      assert.equal(text.length % 2, 0);
      const scalars = [];
      for (let unit = 0; unit < text.length / 2;) {
        const code = text.readUInt16LE(unit * 2);
        if (code >= 32) {
          assert(!(code >= 0xdc00 && code <= 0xdfff));
          const width = code >= 0xd800 && code <= 0xdbff ? 2 : 1;
          if (width === 2)
            assert(
              unit + 1 < text.length / 2 &&
                text.readUInt16LE((unit + 1) * 2) >= 0xdc00 &&
                text.readUInt16LE((unit + 1) * 2) <= 0xdfff,
            );
          scalars.push({ section, paragraph, startUnit: unit, endUnit: unit + width });
          unit += width;
        } else unit += code >= 1 && code <= 23 && code !== 10 && code !== 13 ? 8 : 1;
      }
      if (scalars.length) rows.push(scalars);
    }
  }
  if (!rows.length) return [];
  const sites = new Map();
  for (const [ordinal, fraction] of [
    [0, 0],
    [Math.floor((rows.length - 1) / 2), 0.5],
    [rows.length - 1, 1],
  ]) {
    const row = rows[ordinal],
      site = row[Math.floor((row.length - 1) * fraction)];
    sites.set(JSON.stringify(site), site);
  }
  return [...sites.values()];
}
