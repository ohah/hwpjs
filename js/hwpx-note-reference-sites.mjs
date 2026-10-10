export function decodeNoteReferenceSites(bytes) {
  const rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  const uint = value => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
  if (!Array.isArray(rows) || rows.length > 100000) throw new Error("InvalidNoteReferenceSites");
  const notes = new Set(), anchors = new Set(), numbers = new Set();
  for (const row of rows) {
    if (!row || Array.isArray(row) || !["note_node", "number_node", "anchor_node", "paragraph", "anchor_unit"].every(key => uint(row[key])) || row.paragraph === 0 || notes.has(row.note_node) || anchors.has(row.anchor_node) || numbers.has(row.number_node)) throw new Error("InvalidNoteReferenceSites");
    notes.add(row.note_node); anchors.add(row.anchor_node); numbers.add(row.number_node);
  }
  return rows;
}
