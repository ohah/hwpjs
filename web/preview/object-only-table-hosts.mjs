// 실제 배치된 표와 section/column 메타데이터만 가진 문단을 식별합니다.
// 알 수 없는 placeholder나 일반 텍스트는 coverage 검사에서 제외하지 않습니다.
export function objectOnlyTableHostKeys(content, layout) {
  const keys = new Set();
  for (const paragraph of content.paragraphs ?? []) {
    if (
      !paragraph ||
      typeof paragraph.text !== 'string' ||
      !/^\ufffc+$/.test(paragraph.text) ||
      paragraph.clipped
    )
      continue;
    const covered = new Set();
    let valid = true,
      tables = 0;
    const add = (unit) => {
      if (!Number.isInteger(unit) || unit < 0 || unit >= paragraph.text.length || covered.has(unit))
        valid = false;
      else covered.add(unit);
    };
    for (const anchor of paragraph.structuralAnchors ?? []) {
      if (!anchor || !['section', 'column'].includes(anchor.kind)) {
        valid = false;
        break;
      }
      add(anchor.unit);
    }
    for (const table of content.tables ?? []) {
      if (!table) {
        valid = false;
        break;
      }
      if (table.section !== paragraph.section || table.hostParagraph !== paragraph.paragraph)
        continue;
      const anchors = (layout.tableAnchors ?? []).filter(
        (anchor) =>
          anchor.section === table.section &&
          anchor.tableNode === table.tableNode &&
          anchor.hostParagraph === paragraph.paragraph &&
          anchor.anchorUnit === table.anchorUnit,
      );
      if (
        table.sourceGeometry?.geometry?.treat_as_character !== false ||
        anchors.length !== 1 ||
        !layout.boxes?.some(
          (box) => box.section === table.section && box.tableNode === table.tableNode,
        )
      ) {
        valid = false;
        break;
      }
      add(table.anchorUnit);
      tables++;
    }
    if (valid && tables > 0 && covered.size === paragraph.text.length)
      keys.add(`${paragraph.section}:${paragraph.paragraph}`);
  }
  return keys;
}
