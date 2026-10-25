import { measureNoteBodies } from "./note-body-measurement.mjs";
import { contentNotePagePolicy } from "./content-note-page-policy.mjs";
import { noteSeparatorGeometry } from "./note-separator-geometry.mjs";
import { createFootnoteColumnReservation } from "./footnote-column-reservation.mjs";
import { projectBodyFootnotes } from "./body-footnote-projection.mjs";
import { pageReferenceBoxes } from "./page-reference-boxes.mjs";
import { pageParagraphCoverage } from "./page-paragraph-coverage.mjs";
import { tableAnchorCoverage } from "./table-anchor-coverage.mjs";
import { selectNoteSourceTables } from "./note-source-table-owners.mjs";
import { selectDrawingNoteReferenceOwners } from "./drawing-note-reference-owners.mjs";
import { appendBodyEndnotes } from "./append-body-endnotes.mjs";
import { resolveEndnoteColumnContext } from "./endnote-column-context.mjs";

/** Compose the normal object paginator with the existing exact footnote reservation. */
export function layoutObjectFootnoteContent(content, measure, maxRows, layoutBody) {
  const fail = error => ({ state: "unavailable", error });
  if (!["hwpx", "hwp5"].includes(content.format) || content.limited || content.pageSettings?.length !== 1 || content.noteShapesError
    || content.createdTables?.length || !Number.isSafeInteger(maxRows) || maxRows < 1
    || typeof layoutBody !== "function") return fail("UnsupportedObjectFootnoteContent");
  const setting = content.pageSettings[0], reference = pageReferenceBoxes(setting, { x: 20, y: 20 });
  if (reference.state !== "placed") return reference;
  const noteTables = (content.tables ?? []).filter(table => content.paragraphFlows?.some(flow =>
    flow.section === table.section && flow.paragraph === table.hostParagraph && ["footnote", "endnote"].includes(flow.host)));
  const cellReferenceOwners = new Set(content.paragraphs.filter(p => p.tableCell && Array.isArray(p.automaticNumbers)
    && p.automaticNumbers.some(number => number.kind === "note-reference")).map(p => `${p.section}:${p.tableCell.tableNode}`));
  for (const reference of Array.isArray(content.hwp5Notes) ? content.hwp5Notes : []) {
    const owner = content.paragraphs.find(p => p.section === reference?.section && p.paragraph === reference?.hostParagraph);
    if (owner?.tableCell) cellReferenceOwners.add(`${owner.section}:${owner.tableCell.tableNode}`);
  }
  const bindingTables = (content.tables ?? []).filter(table => noteTables.includes(table) || cellReferenceOwners.has(`${table.section}:${table.tableNode}`));
  const sourceTables = bindingTables.length ? selectNoteSourceTables({ ...content, tables: bindingTables }, { floatingNotes: true }) : null;
  if (sourceTables && sourceTables.state !== "selected") return sourceTables;
  const drawingOwners = selectDrawingNoteReferenceOwners({ ...content, drawings: content.drawings ?? [] });
  if (drawingOwners.state !== "selected") return drawingOwners;
  const endnoteContext = content.paragraphFlows.some(f => f.host === "endnote")
    ? resolveEndnoteColumnContext(content, setting.section_ordinal, reference.boxes.page) : undefined;
  if (endnoteContext !== undefined && endnoteContext.state !== "resolved") return { ...endnoteContext, layoutStage: "resolve-endnote-width" };
  const endPolicy = endnoteContext ? contentNotePagePolicy(content, setting.section_ordinal, "endnote") : null;
  if (endPolicy && endPolicy.state !== "selected") return endPolicy;
  const endSeparator = endPolicy ? noteSeparatorGeometry(endPolicy, endnoteContext.width) : null;
  if (endSeparator && endSeparator.state !== "selected") return endSeparator;
  const measurementContext = endnoteContext ? { ...endnoteContext,
    spacing: { first: endPolicy.aboveLine + endSeparator.height + endPolicy.belowLine, between: endPolicy.betweenNotes } } : undefined;
  const measured = measureNoteBodies(content, reference.boxes.page.width, measure, maxRows, sourceTables,
    { allowDrawingReferences: drawingOwners.owners.size > 0 }, { endnoteContext: measurementContext });
  if (measured.state !== "measured") return { ...measured, layoutStage: "measure-note-bodies", ...(endnoteContext ? { endnoteColumnContext: endnoteContext } : {}) };
  if (!measured.notes.length) return fail("UnsupportedObjectFootnoteKind");
  const footnotes = measured.notes.filter(note => note.kind === "footnote"), endnotes = measured.notes.filter(note => note.kind === "endnote");
  const ids = new Set(measured.notes.flatMap(note => note.ownedParagraphs.map(p => `${note.section}:${p}`)));
  const noteTableSet = new Set(noteTables);
  const notePictureKeys = new Set(measured.notes.flatMap(note => note.ownedPictures).map(picture => `${picture.section}:${picture.pictureNode}`));
  const noteDrawingKeys = new Set(measured.notes.flatMap(note => note.ownedDrawings).map(d => `${d.section}:${d.drawingNode}`));
  const noteContainerKeys = new Set(measured.notes.flatMap(note => note.ownedContainers).map(c => `${c.section}:${c.containerNode}`));
  const noteRectangleKeys = new Set(measured.notes.flatMap(note => note.ownedRectangles).map(d => `${d.section}:${d.drawingNode}`));
  const noteCurveKeys = new Set(measured.notes.flatMap(note => note.ownedCurves).map(c => `${c.section}:${c.curveNode}`));
  for (const table of noteTables) for (const cell of table.cells) for (const paragraph of cell.paragraphs) ids.add(`${table.section}:${paragraph}`);
  for (const [key, host, node] of [["tables", "hostParagraph", "tableNode"], ["drawings", "hostParagraph", "drawingNode"], ["pictures", "paragraph", "pictureNode"],
    ["lines", "paragraph", "anchorNode"], ["containers", "hostParagraph", "containerNode"], ["rectangles", "hostParagraph", "drawingNode"],
    ["curveTextSources", "hostParagraph", "curveNode"], ["groupCurves", "hostParagraph", "curveNode"]]) {
    const unsupported = content[key]?.find(item => ids.has(`${item.section}:${item[host]}`) && !(key === "tables" && noteTableSet.has(item))
      && !(key === "pictures" && notePictureKeys.has(`${item.section}:${item.pictureNode}`))
      && !(key === "drawings" && noteDrawingKeys.has(`${item.section}:${item.drawingNode}`))
      && !(key === "containers" && noteContainerKeys.has(`${item.section}:${item.containerNode}`))
      && !(key === "rectangles" && noteRectangleKeys.has(`${item.section}:${item.drawingNode}`))
      && !(["curveTextSources", "groupCurves"].includes(key) && noteCurveKeys.has(`${item.section}:${item.curveNode}`)));
    if (unsupported) return { ...fail("UnsupportedFootnoteOwnedObject"), layoutStage: "note-owned-object", objectKind: key,
      section: unsupported.section, paragraph: unsupported[host], [node]: unsupported[node] };
  }
  const policy = footnotes.length ? contentNotePagePolicy(content, setting.section_ordinal, "footnote") : null;
  if (policy && policy.state !== "selected") return policy;
  const separator = policy ? noteSeparatorGeometry(policy, reference.boxes.page.width) : null;
  if (separator && separator.state !== "selected") return separator;
  const reservedNotes = footnotes.map(note => {
    const alias = drawingOwners.owners.get(`${note.section}:${note.hostParagraph}`);
    return alias ? { ...note, ...alias } : note;
  });
  const reservation = footnotes.length ? createFootnoteColumnReservation(reservedNotes, policy, separator.height) : { state: "ready" };
  if (reservation.state !== "ready") return reservation;
  const source = { ...content, tables: content.tables?.filter(table => !noteTableSet.has(table)),
    pictures: content.pictures?.filter(picture => !notePictureKeys.has(`${picture.section}:${picture.pictureNode}`)),
    drawings: content.drawings?.filter(d => !noteDrawingKeys.has(`${d.section}:${d.drawingNode}`)),
    containers: content.containers?.filter(c => !noteContainerKeys.has(`${c.section}:${c.containerNode}`)),
    rectangles: content.rectangles?.filter(d => !noteRectangleKeys.has(`${d.section}:${d.drawingNode}`)),
    groupRectangles: content.groupRectangles?.filter(d => !noteContainerKeys.has(`${d.section}:${d.parentContainer}`)),
    curveTextSources: content.curveTextSources?.filter(c => !noteCurveKeys.has(`${c.section}:${c.curveNode}`)),
    groupCurves: content.groupCurves?.filter(c => !noteCurveKeys.has(`${c.section}:${c.curveNode}`)),
    paragraphs: content.paragraphs.filter(p => !ids.has(`${p.section}:${p.paragraph}`)),
    paragraphFlows: content.paragraphFlows.filter(p => !ids.has(`${p.section}:${p.paragraph}`)),
    inlineObjectAnchors: [...(content.inlineObjectAnchors ?? []), ...measured.notes.map(note => ({
      section: note.section, paragraph: note.hostParagraph, anchorUnit: note.anchorUnit, node: note.numberNode,
    }))] };
  const budget = maxRows - measured.rowCount;
  if (budget < 1) return fail("NotePageLayoutLimit");
  let body = layoutBody(source, measure, budget, { columnBottom: reservation.columnBottom });
  if (body.state !== "paginated") return body;
  if (endnotes.length) {
    body = appendBodyEndnotes(body, endnotes, endPolicy, endSeparator, setting, content.paragraphFlows, maxRows, reservation.columnBottom, endnoteContext);
    if (body.state !== "paginated") return { ...body,
      layoutStage: body.layoutStage ?? "append-endnotes",
      endnoteColumnContext: endnoteContext,
      endnoteMeasurement: { notes: endnotes.length, widths: [...new Set(endnotes.map(note => note.width))],
        rows: endnotes.reduce((count, note) => count + note.rows.length, 0),
        atomicScenes: endnotes.reduce((count, note) => count + (note.scenePages?.length ?? (note.atomicScene ? 1 : 0)), 0) } };
  }
  for (const note of footnotes) {
    const alias = drawingOwners.owners.get(`${note.section}:${note.hostParagraph}`);
    if (!alias) continue;
    const hosts = (paragraph, unit) => body.rows.filter(row => row.kind === "text" && row.section === note.section
      && row.paragraph === paragraph && row.startUnit <= unit && unit < row.endUnit);
    const original = hosts(note.hostParagraph, note.anchorUnit), reserved = hosts(alias.hostParagraph, alias.anchorUnit);
    if (original.length !== 1 || reserved.length !== 1 || original[0].pageOrdinal !== reserved[0].pageOrdinal
      || original[0].columnOrdinal !== reserved[0].columnOrdinal) return fail("UnresolvedDrawingNoteReferencePage");
  }
  const projected = footnotes.length ? projectBodyFootnotes(body, footnotes, policy, separator, maxRows)
    : { state: "projected", rows: [], boxes: [], numberPrefixes: [], separators: [], flowPictures: [] };
  if (projected.state !== "projected") return projected;
  const rows = [...body.rows, ...projected.rows];
  const anchors = tableAnchorCoverage(content, { ...body, rows });
  if (anchors.state !== "covered") return anchors;
  const coverage = pageParagraphCoverage(content.paragraphs, [...rows, ...anchors.rows, ...measured.notes.flatMap(note => note.coverageRows)]);
  if (coverage.state !== "complete") return coverage;
  return { ...body, rows: rows.toSorted((a, b) => a.pageOrdinal - b.pageOrdinal || a.y - b.y),
    boxes: [...(body.boxes ?? []), ...projected.boxes], hostNumberPrefixes: [...(body.hostNumberPrefixes ?? []), ...projected.numberPrefixes],
    flowPictures: [...(body.flowPictures ?? []), ...projected.flowPictures],
    noteSeparators: [...(body.noteSeparators ?? []), ...projected.separators], spatialRows: true, pageLayoutMode: "measured-object-footnote-body" };
}
