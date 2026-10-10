// 본문 선언이 아니라 해당 셀 목록의 현재 문단 흐름만 선택합니다.
export function tableCellColumnContext(table, cell, paragraphs, flows) {
  const unavailable = error => ({ state: "unavailable", error });
  if (!table || !cell || !Array.isArray(cell.paragraphs) || !Array.isArray(paragraphs) || !Array.isArray(flows)) return unavailable("InvalidTableCellColumnContext");
  let declaration, signature;
  for (const id of cell.paragraphs) {
    const owners = paragraphs.filter(p => p.section === table.section && p.paragraph === id);
    if (owners.length !== 1 || owners[0].tableCell?.tableNode !== table.tableNode || owners[0].tableCell?.listNode !== cell.listNode) return unavailable("AmbiguousTableCellColumnContext");
    const candidates = flows.filter(f => f.section === table.section && f.paragraph === id);
    if (candidates.length !== 1 || candidates[0].top_level !== false || candidates[0].column_declaration === undefined) return unavailable("AmbiguousTableCellColumnContext");
    const current = JSON.stringify(candidates[0].column_declaration);
    if (signature !== undefined && signature !== current) return unavailable("UnsupportedTableCellColumnChange");
    signature = current; declaration = candidates[0].column_declaration;
  }
  if (declaration === undefined) return unavailable("MissingTableCellColumnContext");
  return { state: "selected", declaration: declaration === null
    ? { count: 1, same_size: true, gap: 0, direction: "left", kind: "newspaper", ambiguous: false }
    : structuredClone(declaration) };
}
