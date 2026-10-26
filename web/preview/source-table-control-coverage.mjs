import { tableHostStructuralCoverage } from "./table-host-structural-coverage.mjs";

// Source engines may complete before final geometry publication. Keep their
// cell ownership contract, sharing only exact structural-unit proof here.
export function sourceTableControlCoverage(content, layout, rows) {
  const unavailable = () => ({
    state: "unavailable",
    error: "IncompleteSourceTableControlCoverage",
  });
  if (
    !Array.isArray(content?.tables) ||
    !Array.isArray(content.paragraphs) ||
    !Array.isArray(layout?.tableAnchors) ||
    !Array.isArray(layout.boxes) ||
    !Array.isArray(rows)
  )
    return unavailable();
  if (rows.some((row) => !row)) return unavailable();
  const controls = [],
    positions = new Set();
  for (const anchor of layout.tableAnchors) {
    if (!anchor) return unavailable();
    const table = content.tables.find(
      (table) => table?.section === anchor.section && table.tableNode === anchor.tableNode,
    );
    const paragraph = content.paragraphs.find(
      (p) => p?.section === anchor.section && p.paragraph === anchor.hostParagraph,
    );
    const key = `${anchor.section}:${anchor.hostParagraph}:${anchor.anchorUnit}`;
    if (
      !table ||
      table.hostParagraph !== anchor.hostParagraph ||
      table.anchorUnit !== anchor.anchorUnit ||
      !Number.isSafeInteger(anchor.anchorUnit) ||
      typeof paragraph?.text !== "string" ||
      paragraph.text[anchor.anchorUnit] !== "\ufffc" ||
      positions.has(key) ||
      !Array.isArray(table.cells) ||
      !table.cells.length ||
      table.cells.some(
        (cell) =>
          !cell ||
          !layout.boxes.some(
            (box) =>
              box?.section === table.section &&
              box.tableNode === table.tableNode &&
              box.listNode === cell.listNode,
          ),
      )
    )
      return unavailable();
    positions.add(key);
    const structural = tableHostStructuralCoverage(
      paragraph,
      table,
      anchor,
      { ...layout, rows },
      layout.boxes.filter(
        (box) => box?.section === table.section && box.tableNode === table.tableNode,
      ),
    );
    if (structural.state !== "covered") return { ...unavailable(), sourceError: structural.error };
    controls.push(...structural.rows);
    if (
      rows.some(
        (row) =>
          row?.kind === "text" &&
          row.section === anchor.section &&
          row.paragraph === anchor.hostParagraph &&
          row.startUnit <= anchor.anchorUnit &&
          row.endUnit > anchor.anchorUnit,
      )
    )
      continue;
    controls.push({
      kind: "text",
      section: anchor.section,
      paragraph: anchor.hostParagraph,
      startUnit: anchor.anchorUnit,
      endUnit: anchor.anchorUnit + 1,
      text: "\ufffc",
    });
  }
  return { state: "verified", rows: controls };
}
