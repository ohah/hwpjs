// These are layout references, never replacement document owners. A sole
// take-place picture in an unrestricted inline-table cell reserves the outer
// host line while its native paragraph/anchor remain inside that cell.
export function unrestrictedCellPictureReferences(content) {
  const fail = () => ({ state: "unavailable", error: "AmbiguousUnrestrictedCellPictureOwner" });
  if (!Array.isArray(content?.paragraphs) || !Array.isArray(content.tables)
    || content.pictures !== undefined && !Array.isArray(content.pictures)) return fail();
  const candidates = (content.pictures ?? []).filter(p => p?.geometry?.treatAsCharacter === false
    && p.position?.flags?.[1] === false && p.flow?.textWrap === 1);
  const references = new Map();
  if (!candidates.length) return { state: "selected", references };
  const paragraphs = new Map(), tables = new Map(), cellOwners = new Map();
  for (const p of content.paragraphs) {
    if (!p) return fail();
    const key = `${p.section}:${p.paragraph}`;
    paragraphs.set(key, paragraphs.has(key) ? null : p);
  }
  for (const t of content.tables) {
    if (!t) return fail();
    const key = `${t.section}:${t.tableNode}`;
    tables.set(key, tables.has(key) ? null : t);
  }
  for (const picture of candidates) {
    const owner = paragraphs.get(`${picture.section}:${picture.paragraph}`);
    if (!owner) return fail();
    if (!owner.tableCell) continue;
    const table = tables.get(`${picture.section}:${owner.tableCell.tableNode}`);
    if (!table) return fail();
    const host = paragraphs.get(`${picture.section}:${table.hostParagraph}`);
    if (!host) return fail();
    if (table.parentTableNode != null || table.sourceGeometry?.geometry?.treat_as_character !== true
      || picture.state !== "located" || picture.anchorUnit !== 0 || table.anchorUnit !== 0
      || owner.text !== "\ufffc" || host.text !== "\ufffc" || picture.caption || picture.captionPartial
      || picture.owner != null && picture.owner.anchorNode !== picture.pictureNode
      || picture.geometry.widthRelative !== 4 || picture.geometry.heightRelative !== 2
      || !Array.isArray(picture.position.flags) || picture.position.flags.length !== 4
      || !Array.from(picture.position.flags).every(v => v === false)
      || !Array.isArray(picture.position.relations) || picture.position.relations.length !== 4
      || ![2, 2, 0, 0].every((v, i) => picture.position.relations[i] === v)) continue;
    if (host.tableCell || !Array.isArray(table.cells)) return fail();
    if (!cellOwners.has(table)) {
      const index = new Map();
      for (const cell of table.cells) {
        if (!cell) return fail();
        index.set(cell.listNode, index.has(cell.listNode) ? null : cell);
      }
      cellOwners.set(table, index);
    }
    const cell = cellOwners.get(table).get(owner.tableCell.listNode);
    if (!cell || !Array.isArray(cell.paragraphs) || cell.paragraphs.filter(id => id === picture.paragraph).length !== 1) return fail();
    const key = `${picture.section}:${picture.pictureNode}`;
    if (references.has(key)) return fail();
    references.set(key, { ...picture, paragraph: table.hostParagraph, anchorUnit: table.anchorUnit });
  }
  return { state: "selected", references };
}
