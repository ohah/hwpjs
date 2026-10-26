// 표시 배열의 소유권만 검사하며 원문 모델을 수정하거나 기본값으로 보정하지 않습니다.
export function validateNestedTableOwnership(content) {
  const fail = () => {
    throw new Error('InvalidNestedTableFlow');
  };
  const paragraphs = new Map(),
    tables = new Map(),
    members = new Set();
  for (const p of content.paragraphs) {
    const key = `${p.section}:${p.paragraph}`;
    if (paragraphs.has(key)) fail();
    paragraphs.set(key, p);
  }
  for (const table of content.tables) {
    const key = `${table.section}:${table.tableNode}`;
    if (tables.has(key)) fail();
    tables.set(key, table);
    const lists = new Set();
    for (const cell of table.cells) {
      if (lists.has(cell.listNode)) fail();
      lists.add(cell.listNode);
      for (const ordinal of cell.paragraphs) {
        const member = `${table.section}:${ordinal}`;
        if (members.has(member)) fail();
        members.add(member);
        const p = paragraphs.get(member);
        if (
          !p ||
          p.tableCell?.tableNode !== table.tableNode ||
          p.tableCell?.listNode !== cell.listNode
        )
          fail();
      }
    }
  }
  for (const [key, p] of paragraphs) if (p.tableCell && !members.has(key)) fail();
  for (const table of tables.values()) {
    if (table.parentTableNode == null) {
      if (table.parentListNode != null) fail();
      continue;
    }
    const parent = tables.get(`${table.section}:${table.parentTableNode}`);
    const host = paragraphs.get(`${table.section}:${table.hostParagraph}`);
    if (
      !parent ||
      parent === table ||
      !host ||
      host.tableCell?.tableNode !== parent.tableNode ||
      host.tableCell?.listNode !== table.parentListNode ||
      !parent.cells.some(
        (cell) =>
          cell.listNode === table.parentListNode && cell.paragraphs.includes(table.hostParagraph),
      )
    )
      fail();
  }
  const resolved = new Set();
  for (const table of tables.values()) {
    const path = new Set();
    let current = table;
    while (current && !resolved.has(current)) {
      if (path.has(current)) fail();
      path.add(current);
      current =
        current.parentTableNode == null
          ? null
          : tables.get(`${current.section}:${current.parentTableNode}`);
    }
    for (const member of path) resolved.add(member);
  }
  return { paragraphs, tables };
}
