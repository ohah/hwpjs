// 측정 문단 행과 최종 페이지 행의 현재 UTF-16 범위를 연결합니다.
export function projectInlineObjectPages(flow, pageRows) {
  const unavailable = () => ({ state: 'unavailable', error: 'InvalidInlineObjectPageProjection' });
  if (
    flow?.state !== 'measured' ||
    !Array.isArray(flow.rows) ||
    !Array.isArray(flow.anchors) ||
    !Array.isArray(pageRows)
  )
    return unavailable();
  const nodes = new Set(),
    units = new Set(),
    objects = [];
  for (const anchor of flow.anchors) {
    if (
      !anchor ||
      !Number.isSafeInteger(anchor.objectNode) ||
      anchor.objectNode < 0 ||
      nodes.has(anchor.objectNode) ||
      !Number.isSafeInteger(anchor.rowIndex) ||
      anchor.rowIndex < 0 ||
      !Number.isSafeInteger(anchor.unit) ||
      anchor.unit < 0 ||
      ![anchor.x, anchor.y, anchor.width, anchor.height].every(Number.isFinite) ||
      anchor.width <= 0 ||
      anchor.height <= 0
    )
      return unavailable();
    const source = flow.rows[anchor.rowIndex];
    if (
      !source ||
      source.kind !== 'text' ||
      !Number.isSafeInteger(source.section) ||
      source.section < 0 ||
      !Number.isSafeInteger(source.paragraph) ||
      source.paragraph < 0 ||
      !Number.isSafeInteger(source.startUnit) ||
      !Number.isSafeInteger(source.endUnit) ||
      !(source.startUnit <= anchor.unit && anchor.unit < source.endUnit) ||
      source.text?.[anchor.unit - source.startUnit] !== '\ufffc'
    )
      return unavailable();
    const key = `${source.section}:${source.paragraph}:${anchor.unit}`;
    if (units.has(key)) return unavailable();
    nodes.add(anchor.objectNode);
    units.add(key);
    const matches = pageRows.filter(
      (row) =>
        row?.kind === 'text' &&
        row.section === source.section &&
        row.paragraph === source.paragraph &&
        row.startUnit === source.startUnit &&
        row.endUnit === source.endUnit,
    );
    if (matches.length !== 1) return unavailable();
    const row = matches[0];
    if (
      !Number.isSafeInteger(row.pageOrdinal) ||
      row.pageOrdinal < 0 ||
      ![row.x, row.y].every(Number.isFinite)
    )
      return unavailable();
    const rectangle = { x: row.x + anchor.x, y: row.y, width: anchor.width, height: anchor.height };
    if (
      ![
        rectangle.x,
        rectangle.y,
        rectangle.x + rectangle.width,
        rectangle.y + rectangle.height,
      ].every(Number.isFinite)
    )
      return unavailable();
    objects.push({
      objectNode: anchor.objectNode,
      unit: anchor.unit,
      section: source.section,
      paragraph: source.paragraph,
      pageOrdinal: row.pageOrdinal,
      columnOrdinal: row.columnOrdinal,
      referenceBoxes: row.referenceBoxes,
      rectangle,
    });
  }
  return { state: 'placed', objects };
}
