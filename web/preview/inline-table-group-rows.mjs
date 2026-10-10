// 공유 문단의 행은 한 번 생성하고 행별 표 앵커만 별도로 연결합니다.
export function inlineTableGroupRows(entries, indices) {
  const unavailable = error => ({ state: "unavailable", error });
  if (!Array.isArray(entries) || !Array.isArray(indices) || !indices.length || new Set(indices).size !== indices.length || indices.some(index => !Number.isSafeInteger(index) || index < 0 || index >= entries.length)) return unavailable("InvalidInlineTableGroup");
  const first = entries[indices[0]], flow = first?.inlineFlow;
  if (flow?.state !== "measured" || !Array.isArray(flow.rows) || !Array.isArray(flow.anchors) || flow.anchors.length !== indices.length) return unavailable("InvalidInlineTableGroup");
  const anchors = new Map(), nodes = new Set();
  for (const index of indices) {
    const entry = entries[index], table = entry?.table;
    if (!table || entry.inlineFlow !== flow || entry.splitMode !== "whole" || table.section !== first.table.section || table.hostParagraph !== first.table.hostParagraph || nodes.has(table.tableNode)) return unavailable("InvalidInlineTableGroup");
    nodes.add(table.tableNode);
    const matches = flow.anchors.filter(anchor => anchor?.tableNode === table.tableNode);
    if (matches.length !== 1) return unavailable("InvalidInlineTableGroup");
    const anchor = matches[0];
    if (!Number.isSafeInteger(anchor.rowIndex) || anchor.rowIndex < 0 || anchor.rowIndex >= flow.rows.length || !Number.isSafeInteger(anchor.unit) || anchor.unit < 0 || ![anchor.x, anchor.y, anchor.width, anchor.height].every(Number.isFinite) || anchor.width <= 0 || anchor.height <= 0) return unavailable("InvalidInlineTableGroup");
    const list = anchors.get(anchor.rowIndex) ?? [];
    list.push({ tableIndex: index, anchor });
    anchors.set(anchor.rowIndex, list);
  }
  const rows = [];
  for (const [index, row] of flow.rows.entries()) {
    if (!row || row.section !== first.table.section || row.paragraph !== first.table.hostParagraph) return unavailable("InvalidInlineTableGroup");
    rows.push({ ...row, inlineTableAnchors: anchors.get(index) ?? [] });
  }
  return { state: "grouped", rows };
}
