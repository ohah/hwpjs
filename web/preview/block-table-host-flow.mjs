import { layoutContent } from "./layout.mjs";
import { paragraphSpacePixels } from "./paragraph-geometry.mjs";
import { structuralAnchorUnits } from "./structural-anchor-units.mjs";

// 블록 표 사이의 호스트 텍스트도 원래 UTF-16 좌표로 조판합니다.
export function measureBlockTableHost(paragraph, entries, width, measure, maxRows) {
  const unavailable = error => ({ state: "unavailable", error });
  if (!Array.isArray(entries) || !entries.length || entries.some(entry => !entry?.table || entry.table.section !== paragraph?.section || entry.table.hostParagraph !== paragraph?.paragraph || !Number.isSafeInteger(entry.tableIndex) || entry.tableIndex < 0)
    || new Set(entries.map(entry => entry.tableIndex)).size !== entries.length) return unavailable("InvalidBlockTableAnchorPosition");
  if (typeof paragraph?.text !== "string" || !Number.isSafeInteger(maxRows) || maxRows < 1) return unavailable("TablePagePlanLimit");
  const anchors = entries.map(({ table, tableIndex }) => ({ unit: table.anchorUnit, tableIndex }));
  let structural;
  try { structural = structuralAnchorUnits(paragraph); } catch (error) { return unavailable(error.message); }
  if (anchors.some(anchor => !Number.isSafeInteger(anchor.unit) || anchor.unit < 0 || paragraph.text[anchor.unit] !== "\ufffc")
    || new Set(anchors.map(anchor => anchor.unit)).size !== anchors.length
    || anchors.some(anchor => structural.has(anchor.unit))
    || paragraph.text.split("\ufffc").length - 1 !== anchors.length + structural.size) return unavailable("InvalidBlockTableAnchorPosition");
  anchors.sort((a, b) => a.unit - b.unit);
  const sequence = [];
  let rows = 0, cursor = 0;
  const gap = value => {
    const height = paragraphSpacePixels(value);
    if (height > 0) { sequence.push({ kind: "gap", text: "", section: paragraph.section, paragraph: paragraph.paragraph, height }); rows++; }
  };
  const text = end => {
    if (end === cursor) return true;
    let onlyStructural = true;
    for (let unit = cursor; unit < end; unit++) if (!structural.has(unit)) { onlyStructural = false; break; }
    if (onlyStructural) return true;
    if (rows >= maxRows) return false;
    const slice = { ...paragraph, text: paragraph.text.slice(cursor, end), textStartUnit: cursor,
      paragraphShape: { ...paragraph.paragraphShape, before: 0, after: 0 } };
    const measured = layoutContent({ paragraphs: [slice], limited: false }, width,
      (value, _paragraph, unit, kind) => measure(value, paragraph, unit, kind), maxRows - rows, { documentBody: true });
    if (measured.limited) return false;
    rows += measured.rows.length; sequence.push(...measured.rows);
    return true;
  };
  gap(paragraph.paragraphShape?.before);
  for (const anchor of anchors) {
    if (!text(anchor.unit)) return unavailable("TablePagePlanLimit");
    sequence.push({ tableIndex: anchor.tableIndex }); cursor = anchor.unit + 1;
  }
  if (!text(paragraph.text.length)) return unavailable("TablePagePlanLimit");
  gap(paragraph.paragraphShape?.after);
  if (rows > maxRows) return unavailable("TablePagePlanLimit");
  return { state: "measured", sequence, rowCount: rows };
}
