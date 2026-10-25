import { validateEquationSources } from "./hwpx-equation-sources.mjs";

export function decodeEquationSites(bytes) {
  const fail = () => { throw new Error("InvalidHwpxEquationSites"); };
  let rows;
  try {
    rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!Array.isArray(rows)) return fail();
    validateEquationSources(rows.map(row => row?.source));
  } catch { return fail(); }
  const uint = value => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
  const paragraph = value => uint(value) && value > 0;
  for (const row of rows) {
    if (row.source.issue !== null) {
      if (row.paragraph !== null || row.anchor_unit !== null || row.error_name !== null) return fail();
    } else if (row.error_name === null) {
      if (!paragraph(row.paragraph) || !uint(row.anchor_unit)) return fail();
    } else {
      if (typeof row.error_name !== "string" || !/^[A-Za-z][A-Za-z0-9_]{0,127}$/.test(row.error_name) || row.anchor_unit !== null || row.paragraph !== null && !paragraph(row.paragraph)) return fail();
    }
  }
  return rows;
}
