// Child protocol: one start row, zero or more refusal rows, one JSON summary.
export function parseSpecializedAuditOutput(output) {
  if (typeof output !== "string") throw new TypeError("InvalidSpecializedAuditOutput");
  const lines = output.trim().split("\n");
  const start = JSON.parse(lines.shift());
  if (start?.kind !== "start") throw new Error("InvalidSpecializedAuditStart");
  const refusals = [];
  const sites = new Set();
  while (lines.length) {
    let row;
    try { row = JSON.parse(lines[0]); } catch { break; }
    if (row?.kind !== "refusal") break;
    if (typeof row.error !== "string" || !row.error || typeof row.path !== "string" || !row.path ||
      !Number.isSafeInteger(row.section) || row.section < 0 ||
      !Number.isSafeInteger(row.paragraph) || row.paragraph < 1 ||
      !Number.isSafeInteger(row.localParagraph) || row.localParagraph < 1) throw new Error("InvalidSpecializedAuditRefusal");
    const site = `${row.section}:${row.paragraph}`;
    if (sites.has(site)) throw new Error("DuplicateSpecializedAuditRefusal");
    sites.add(site);
    refusals.push(row);
    lines.shift();
  }
  const summary = JSON.parse(lines.join("\n"));
  if (!summary || typeof summary !== "object" || Array.isArray(summary) || summary.kind !== undefined) throw new Error("InvalidSpecializedAuditSummary");
  const counts = summary.refused;
  if (!counts || typeof counts !== "object" || Array.isArray(counts) ||
    Object.values(counts).some(count => !Number.isSafeInteger(count) || count < 1)) throw new Error("InvalidSpecializedAuditRefusalCounts");
  const observed = new Map();
  for (const row of refusals) observed.set(row.error, (observed.get(row.error) ?? 0) + 1);
  if (observed.size !== Object.keys(counts).length || [...observed].some(([error, count]) => counts[error] !== count)) throw new Error("SpecializedAuditRefusalCountMismatch");
  return { start, refusals, summary };
}
