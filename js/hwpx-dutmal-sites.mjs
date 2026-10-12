export function decodeDutmalSites(bytes) {
  const fail = () => { throw new Error("InvalidHwpxDutmalSites"); };
  let rows;
  try { rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { return fail(); }
  if (!Array.isArray(rows) || rows.length > 100000) return fail();
  const nodes = new Set();
  const uint = value => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
  for (const row of rows) {
    if (!row || !uint(row.node) || !uint(row.paragraph) || row.paragraph === 0 || !uint(row.anchor_unit) || nodes.has(row.node)) return fail();
    nodes.add(row.node);
  }
  return rows;
}
