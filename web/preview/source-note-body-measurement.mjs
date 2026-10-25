import { measureCreatedBodyFlow, projectCreatedBodyFlow } from "./created-body-flow-measurement.mjs";
import { measureFloatingNoteBody } from "./floating-note-body-measurement.mjs";
import { sourceNoteScenes } from "./source-note-scenes.mjs";
import { pageReferenceBoxes } from "./page-reference-boxes.mjs";
import { measureSourceInlineTables } from "./source-table-inline-measurement.mjs";
import { sourceNoteOverflowTables, sourceNoteOverflowBounds } from "./source-note-table-overflow.mjs";

/** Source/created inline tables share the body engine, in local note coordinates. */
export function measureSourceNoteBody(content, width, measure, maxRows, { note, endnoteContext } = {}) {
  if (!Number.isFinite(width) || width <= 0 || typeof measure !== "function" || !Number.isSafeInteger(maxRows) || maxRows < 1)
    return { state: "unavailable", error: "InvalidSourceNoteBodyMeasurement" };
  const floatingTables = content.tables?.some(table => table.sourceGeometry?.geometry?.treat_as_character === false);
  if (floatingTables)
    return measureFloatingNoteBody(content, width, measure, maxRows);
  const directIds = new Set(content.paragraphs.filter(p => !p.tableCell).map(p => `${p.section}:${p.paragraph}`));
  if (content.pictures?.some(p => p.geometry?.treatAsCharacter === false && directIds.has(`${p.section}:${p.paragraph}`)))
    return measureFloatingNoteBody(content, width, measure, maxRows, { inlineTables: true });
  const source = measureSourceInlineTables(content, measure, maxRows);
  if (source.state !== "measured") return source;
  let measured = measureCreatedBodyFlow(content, width, measure, maxRows, source), overflowTables = new Set();
  if (measured.error === "InlineTableLineWidthOverflow" && measured.overflowStage === "inline-object") {
    const policy = sourceNoteOverflowTables(content, source, width);
    if (policy.state === "selected" && policy.tables.size) {
      overflowTables = policy.tables;
      measured = measureCreatedBodyFlow(content, width, measure, maxRows, source, { allowSourceTableOverflow: true });
    }
  }
  if (measured.state !== "measured") return measured;
  let height = 0;
  const placed = [];
  for (const row of measured.rows) {
    if (!Number.isFinite(row.height) || row.height <= 0 || !Number.isFinite(height + row.height))
      return { state: "unavailable", error: "InvalidSourceNoteBodyMeasurement" };
    placed.push({ ...row, x: row.createdHost === undefined ? row.x ?? 0 : 0, y: height, pageOrdinal: 0, columnOrdinal: 0 });
    height += row.height;
  }
  const bounds = { x: 0, y: 0, width, height };
  for (const row of placed) row.referenceBoxes = { paper: bounds, page: bounds, column: bounds };
  let projected = projectCreatedBodyFlow(measured, placed, maxRows);
  if (projected.state !== "projected") return projected;
  if (note?.kind === "endnote") {
    const reference = pageReferenceBoxes(content.pageSettings?.[0], { x: 20, y: 20 });
    if (reference.state !== "placed") return reference;
    const inset = endnoteContext?.firstPageTopInset ?? 0;
    if (!Number.isFinite(inset) || inset < 0) return { state: "unavailable", error: "InvalidSourceNoteContinuationInset" };
    if (height + inset > reference.boxes.page.height) {
      projected = sourceNoteScenes(content, measured, width, maxRows, note, endnoteContext, overflowTables);
      if (projected.state !== "measured") return projected;
      height = projected.height;
    }
  }
  if (!projected.scenePages) {
    const contained = sourceNoteOverflowBounds(projected, overflowTables, () => bounds);
    if (contained.state !== "contained") return contained;
  }
  const identities = new Set(content.paragraphs.map(p => `${p.section}:${p.paragraph}`));
  const pictures = (content.pictures ?? []).filter(p => identities.has(`${p.section}:${p.paragraph}`));
  for (const picture of pictures) {
    const anchors = projected.rows.filter(row => row.kind === "text" && row.section === picture.section && row.paragraph === picture.paragraph
      && row.startUnit <= picture.anchorUnit && picture.anchorUnit < row.endUnit);
    if (anchors.length !== 1) return { state: "unavailable", error: "MissingNotePictureAnchor" };
  }
  return { ...projected, height, state: "measured",
    ownedPictures: pictures.map(p => ({ section: p.section, pictureNode: p.pictureNode, paragraph: p.paragraph, anchorUnit: p.anchorUnit })),
    numberPrefixes: projected.hostNumberPrefixes ?? projected.numberPrefixes, rowCount: projected.rowCount ?? projected.rows.length + projected.hostNumberPrefixes.length };
}
