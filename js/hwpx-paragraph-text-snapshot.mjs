export function decodeParagraphTextSnapshot(bytes) {
  const rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  if (!Array.isArray(rows) || rows.length > 100000) throw new Error("InvalidParagraphTextSnapshot");
  let previous = null;
  for (const row of rows) {
    if (!row || !Number.isInteger(row.paragraph) || row.paragraph < 1 || row.paragraph > 0xffffffff || (previous !== null && row.paragraph !== previous + 1) || typeof row.text !== "string" || !row.text.isWellFormed() || typeof row.nested !== "boolean") throw new Error("InvalidParagraphTextSnapshot");
    previous = row.paragraph;
  }
  return rows;
}
