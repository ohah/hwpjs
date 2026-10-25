import { layoutContent } from "./layout.mjs";

// These cards are editor UI, not printed pages or inferred memo anchor positions.
export function attachHwp5MemoPane(layout, selection, measure, { bodyWidth, maxRows = 20000, width = 260 } = {}) {
  const fail = error => ({ state: "unavailable", error });
  if (selection?.state !== "selected") return fail(selection?.error ?? "MissingHwp5MemoPaneSelection");
  if (!selection.groups.length) return layout;
  if (!Array.isArray(layout.rows) || !Number.isFinite(layout.height) || layout.height < 0
    || !Number.isFinite(width) || width <= 24 || !Number.isSafeInteger(maxRows) || maxRows < layout.rows.length) return fail("InvalidHwp5MemoPaneBounds");
  try {
    const papers = layout.pages?.map(page => page.paper) ?? [];
    if (papers.some(paper => !paper || ![paper.x, paper.y, paper.width, paper.height].every(Number.isFinite) || paper.width <= 0 || paper.height <= 0)) return fail("InvalidHwp5MemoPanePages");
    const right = papers.length ? Math.max(...papers.map(paper => paper.x + paper.width)) : bodyWidth;
    if (!Number.isFinite(right) || right <= 0) return fail("InvalidHwp5MemoPaneBounds");
    const x = right + 24, rows = [], boxes = [];
    let bottom = 20;
    for (const group of selection.groups) {
      const firstPage = layout.pages?.find(page => page.section === group.section || page.section === undefined
        && selection.content.sectionSources?.length === 1 && selection.content.sectionSources[0].section === group.section);
      if (papers.length && !firstPage) return fail("MissingHwp5MemoPanePage");
      const y = Math.max(bottom, firstPage?.paper.y ?? 20);
      const remaining = maxRows - layout.rows.length - rows.length - 1;
      if (remaining < 1) return fail("Hwp5MemoPaneRowLimit");
      const measured = layoutContent({ format: "hwp5", limited: false, paragraphs: group.paragraphs }, width - 24, measure, remaining, { documentBody: true });
      if (measured.limited || !Number.isFinite(measured.height)) return fail("Hwp5MemoPaneRowLimit");
      const height = measured.height + 44;
      if (![x, y, width, height, x + width, y + height].every(Number.isFinite)) return fail("InvalidHwp5MemoPaneBounds");
      const memoPane = { section: group.section, memoNode: group.memoNode, listNode: group.listNode };
      boxes.push({ ...memoPane, x, y, width, height });
      rows.push({ kind: "label", text: `메모 ${group.memoIndex} · 구역 ${group.section + 1}`, x: x + 12, y: y + 8,
        width: width - 24, height: 20, textHeight: 16, editable: false, selectable: false, memoPane });
      for (const row of measured.rows) rows.push({ ...row, x: x + 12 + (row.x ?? 0), y: y + 32 + row.y, memoPane });
      bottom = y + height + 16;
    }
    return { ...layout, rows: [...layout.rows, ...rows].toSorted((a, b) => a.y - b.y), spatialRows: true,
      height: Math.max(layout.height, bottom), memoPaneBoxes: boxes, memoPaneRight: x + width, memoPaneMode: "editor-annotations" };
  } catch (error) { return fail(error.message); }
}
