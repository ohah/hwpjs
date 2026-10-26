import { bindSourceNoteBodies } from './note-body-bindings.mjs';
import { layoutContent } from './layout.mjs';
import { pageParagraphCoverage } from './page-paragraph-coverage.mjs';
import { measureCreatedNoteBody } from './created-note-body-measurement.mjs';
import { createdTableIdentity } from '../../js/created-table-identity.mjs';
import { measureSourceNoteBody } from './source-note-body-measurement.mjs';
import { measureGroupedNoteBody } from './grouped-note-body-measurement.mjs';
import { measurePictureNoteBody } from './picture-note-body-measurement.mjs';

// 호출자가 지정한 폭으로 측정하며 페이지 위치와 주석 사이 간격은 결정하지 않습니다.
export function measureNoteBodies(
  content,
  width,
  measure,
  maxRows = 20000,
  sourceTables = null,
  bindingOptions = {},
  measurementOptions = {},
) {
  const unavailable = (error) => ({ state: 'unavailable', error });
  if (
    !measurementOptions ||
    typeof measurementOptions !== 'object' ||
    Array.isArray(measurementOptions)
  )
    return unavailable('InvalidEndnoteMeasurementContext');
  const { endnoteContext } = measurementOptions;
  if (
    !Number.isFinite(width) ||
    width <= 0 ||
    typeof measure !== 'function' ||
    !Number.isSafeInteger(maxRows) ||
    maxRows < 1
  )
    return unavailable('InvalidNoteBodyMeasurement');
  if (
    endnoteContext !== undefined &&
    (endnoteContext?.state !== 'resolved' ||
      !Number.isSafeInteger(endnoteContext.section) ||
      endnoteContext.section < 0 ||
      !Number.isFinite(endnoteContext.width) ||
      endnoteContext.width <= 0)
  )
    return unavailable('InvalidEndnoteMeasurementContext');
  if (
    endnoteContext?.spacing !== undefined &&
    ![endnoteContext.spacing?.first, endnoteContext.spacing?.between].every(
      (n) => Number.isFinite(n) && n >= 0,
    )
  )
    return unavailable('InvalidEndnoteMeasurementContext');
  const bound = bindSourceNoteBodies(content, sourceTables, 10000, bindingOptions);
  if (bound.state !== 'bound') return bound;
  const noteHosts = new Set(
    bound.notes.flatMap((note) =>
      note.paragraphs.map((paragraph) => `${note.section}:${paragraph}`),
    ),
  );
  if (content.createdTables !== undefined && !Array.isArray(content.createdTables))
    return unavailable('InvalidCreatedTableNoteOwner');
  const createdOwners = new Set();
  for (const table of content.createdTables ?? []) {
    try {
      createdTableIdentity(table?.identity);
    } catch {
      return unavailable('InvalidCreatedTableNoteOwner');
    }
    if (!noteHosts.has(`${table.section}:${table.hostParagraph}`))
      return unavailable('UnsupportedCreatedTableNoteOwner');
    const key = `${table.section}:${table.identity}`;
    if (createdOwners.has(key)) return unavailable('AmbiguousCreatedTableNoteOwner');
    createdOwners.add(key);
  }
  const paragraphs = new Map(content.paragraphs.map((p) => [`${p.section}:${p.paragraph}`, p]));
  const flows = new Map(content.paragraphFlows.map((f) => [`${f.section}:${f.paragraph}`, f]));
  const notes = [];
  let rowCount = 0;
  let endnoteIndex = 0;
  for (const note of bound.notes) {
    if (
      endnoteContext !== undefined &&
      note.kind === 'endnote' &&
      note.section !== endnoteContext.section
    )
      return unavailable('ForeignEndnoteMeasurementContext');
    const noteWidth =
      note.kind === 'endnote' && endnoteContext !== undefined ? endnoteContext.width : width;
    const context =
      note.kind === 'endnote' && endnoteContext !== undefined
        ? {
            ...endnoteContext,
            firstPageTopInset:
              endnoteIndex++ === 0
                ? (endnoteContext.spacing?.first ?? 0)
                : (endnoteContext.spacing?.between ?? 0),
          }
        : endnoteContext;
    const selected = note.paragraphs.map((id) => paragraphs.get(`${note.section}:${id}`));
    if (
      selected.some((p) => flows.get(`${p.section}:${p.paragraph}`).column_declaration?.count > 1)
    )
      return unavailable('UnsupportedNoteBodyColumns');
    if (rowCount >= maxRows) return unavailable('NoteBodyMeasurementLimit');
    const ids = new Set(selected.map((p) => `${p.section}:${p.paragraph}`));
    const originalTables =
      sourceTables?.noteTablesByNote.get(`${note.section}:${note.noteNode}`) ?? [];
    if (originalTables.some((table) => !ids.has(`${table.section}:${table.hostParagraph}`)))
      return unavailable('InvalidSourceNoteTableOwner');
    const cellIds = new Set(
      originalTables.flatMap((table) => table.cells.flatMap((cell) => cell.paragraphs)),
    );
    const owned = originalTables.length
      ? [
          ...selected,
          ...[...cellIds].map((id) => paragraphs.get(`${note.section}:${id}`)),
        ].toSorted((a, b) => a.paragraph - b.paragraph)
      : selected;
    const tables =
      content.createdTables?.filter((table) =>
        ids.has(`${table.section}:${table.hostParagraph}`),
      ) ?? [];
    if (
      tables.length &&
      selected.some((p) => {
        const flow = flows.get(`${p.section}:${p.paragraph}`);
        return flow.page_break === true || flow.column_break === true;
      })
    )
      return unavailable('UnsupportedCreatedNoteParagraphBreak');
    const grouped = measureGroupedNoteBody(
      content,
      note,
      owned,
      originalTables,
      tables,
      noteWidth,
      measure,
      maxRows - rowCount,
      context,
    );
    const pictured =
      grouped === null
        ? measurePictureNoteBody(
            content,
            note,
            owned,
            originalTables,
            tables,
            noteWidth,
            measure,
            maxRows - rowCount,
            context,
          )
        : null;
    const flow =
      grouped ??
      pictured ??
      (originalTables.length
        ? measureSourceNoteBody(
            { ...content, paragraphs: owned, tables: originalTables, createdTables: tables },
            noteWidth,
            measure,
            maxRows - rowCount,
            { note, endnoteContext: context },
          )
        : tables.length
          ? measureCreatedNoteBody(
              selected,
              tables,
              content.format,
              noteWidth,
              measure,
              maxRows - rowCount,
            )
          : layoutContent(
              { paragraphs: selected, limited: false },
              noteWidth,
              measure,
              maxRows - rowCount,
              { documentBody: true },
            ));
    if (flow.state === 'unavailable') return flow;
    if (flow.limited) return unavailable('NoteBodyMeasurementLimit');
    const coverageOwned = [...owned, ...(flow.extraParagraphs ?? [])];
    const coverage = pageParagraphCoverage(coverageOwned, [
      ...flow.rows.filter(
        (row) =>
          !row.createdCell &&
          (row.kind !== 'text' ||
            row.startUnit < row.endUnit ||
            paragraphs.get(`${row.section}:${row.paragraph}`)?.text === ''),
      ),
      ...(flow.coverageRows ?? []),
    ]);
    if (coverage.state !== 'complete') return coverage;
    if (!Number.isFinite(flow.height) || flow.height <= 0)
      return unavailable('InvalidNoteBodyMeasurement');
    rowCount += flow.rowCount ?? flow.rows.length;
    const noteRow = (row) => ({
      ...row,
      noteNode: note.noteNode,
      ...(row.createdCell || row.tableNode !== undefined
        ? { noteListNode: note.listNode }
        : { listNode: note.listNode }),
      noteKind: note.kind,
    });
    notes.push({
      ...note,
      width: noteWidth,
      height: flow.height,
      rows: flow.rows.map(noteRow),
      ...(flow.scenePages
        ? {
            scenePages: flow.scenePages.map((scene) => ({
              ...scene,
              rows: scene.rows.map(noteRow),
            })),
          }
        : {}),
      boxes: flow.boxes ?? [],
      coverageRows: flow.coverageRows ?? [],
      numberPrefixes: flow.numberPrefixes ?? [],
      createdCellParagraphs: flow.createdCellParagraphs ?? [],
      ownedPictures: flow.ownedPictures ?? [],
      flowPictures: flow.flowPictures ?? [],
      ownedParagraphs: coverageOwned.map((p) => p.paragraph),
      atomicScene: flow.atomicScene === true,
      placedDrawings: flow.placedDrawings ?? [],
      placedContainers: flow.placedContainers ?? [],
      placedCurves: flow.placedCurves ?? [],
      ownedCurves: flow.ownedCurves ?? [],
      warnings: flow.warnings ?? [],
      ownedDrawings: flow.ownedDrawings ?? [],
      ownedContainers: flow.ownedContainers ?? [],
      ownedRectangles: flow.ownedRectangles ?? [],
    });
  }
  return { state: 'measured', notes, rowCount };
}
