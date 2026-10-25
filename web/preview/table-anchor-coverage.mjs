import { tableAnchorPage } from "./table-anchor-page.mjs";
import { tableHostStructuralCoverage } from "./table-host-structural-coverage.mjs";

/** Nonpainted intervals require both an exact source anchor and placed table cells. */
export function tableAnchorCoverage(content, layout) {
  const fail = error => ({ state: "unavailable", error });
  const tableSources = content?.tables === undefined ? [] : content.tables;
  const boxes = layout?.boxes === undefined ? [] : layout.boxes;
  if (!Array.isArray(tableSources) || !Array.isArray(content?.paragraphs) || !Array.isArray(layout?.rows)
    || !Array.isArray(boxes) || (layout.tableAnchors !== undefined && !Array.isArray(layout.tableAnchors))
    || layout.flowAnchors !== undefined && (!Array.isArray(layout.flowAnchors) || layout.flowAnchors.some(row => !row))) return fail("InvalidTableAnchorCoverage");
  if (tableSources.some(table => !table) || content.paragraphs.some(p => !p) || layout.rows.some(row => !row) || boxes.some(box => !box)) return fail("InvalidTableAnchorCoverage");
  const rows = [], identities = new Set(), sites = new Set();
  for (const anchor of layout.tableAnchors ?? []) {
    if (!anchor || ![anchor.section, anchor.tableNode, anchor.hostParagraph, anchor.anchorUnit].every(v => Number.isSafeInteger(v) && v >= 0)) return fail("InvalidTableAnchorCoverage");
    const identity = `${anchor.section}:${anchor.tableNode}`, site = `${anchor.section}:${anchor.hostParagraph}:${anchor.anchorUnit}`;
    if (identities.has(identity) || sites.has(site)) return fail("AmbiguousTableAnchorCoverage");
    identities.add(identity); sites.add(site);
    const tables = tableSources.filter(table => table.section === anchor.section && table.tableNode === anchor.tableNode);
    const owners = content.paragraphs.filter(p => p.section === anchor.section && p.paragraph === anchor.hostParagraph);
    if (tables.length !== 1 || owners.length !== 1) return fail("MissingTableAnchorCoverageOwner");
    const table = tables[0], owner = owners[0];
    if (table.hostParagraph !== anchor.hostParagraph || table.anchorUnit !== anchor.anchorUnit
      || ![true, false].includes(table.sourceGeometry?.geometry?.treat_as_character)
      || owner.clipped || typeof owner.text !== "string" || owner.text[anchor.anchorUnit] !== "\ufffc"
      || !Array.isArray(table.cells) || !table.cells.length || table.cells.some(cell => !cell || !Number.isSafeInteger(cell.listNode) || cell.listNode < 0)) return fail("InvalidTableAnchorCoverage");
    const placed = boxes.filter(box => box.section === table.section && box.tableNode === table.tableNode);
    if (table.cells.some(cell => !placed.some(box => box.listNode === cell.listNode && Number.isSafeInteger(box.pageOrdinal)
      && box.pageOrdinal >= 0 && [box.x, box.y, box.width, box.height, box.x + box.width, box.y + box.height].every(Number.isFinite)
      && box.width > 0 && box.height > 0))) return fail("MissingTableAnchorCoveragePlacement");
    const structural=tableHostStructuralCoverage(owner,table,anchor,layout,placed);
    if(structural.state!=="covered")return structural;
    rows.push(...structural.rows);
    if (layout.rows.some(row => row.kind === "text" && row.section === owner.section && row.paragraph === owner.paragraph
      && row.startUnit <= anchor.anchorUnit && anchor.anchorUnit < row.endUnit)) continue;
    let pageOrdinal;
    try { pageOrdinal = tableAnchorPage(table, anchor, layout, placed); }
    catch (error) { return fail(error.message); }
    rows.push({ kind: "text", section: owner.section, paragraph: owner.paragraph, startUnit: anchor.anchorUnit,
      endUnit: anchor.anchorUnit + 1, text: owner.text.slice(anchor.anchorUnit, anchor.anchorUnit + 1), coverageOnly: true,
      ...(pageOrdinal !== undefined ? { pageOrdinal } : {}) });
  }
  return { state: "covered", rows };
}
