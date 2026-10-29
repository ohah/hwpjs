import { paginateMeasuredPlainFootnoteContinuations } from './plain-footnote-continuation.mjs';
import { measureNoteBodies } from './note-body-measurement.mjs';
import { contentNotePagePolicy } from './content-note-page-policy.mjs';
import { noteSeparatorGeometry } from './note-separator-geometry.mjs';
import { createFootnoteColumnReservation } from './footnote-column-reservation.mjs';
import { placeFootnoteArea } from './footnote-area-placement.mjs';
import { layoutContent } from './layout.mjs';
import { curveLayoutDiagnostics } from './curve-layout-diagnostics.mjs';
import { paginateBodyRows } from './page-row-flow.mjs';
import { pageReferenceBoxes } from './page-reference-boxes.mjs';
import { pageParagraphCoverage } from './page-paragraph-coverage.mjs';
import {
  measureCreatedBodyFlow,
  projectCreatedBodyFlow,
} from './created-body-flow-measurement.mjs';
import { createdTableIdentity } from '../../js/created-table-identity.mjs';
import { selectNoteSourceTables } from './note-source-table-owners.mjs';
import { sourceInlineTablePaperBounds } from './source-inline-table-paper-bounds.mjs';
import { prepareEndnoteBodyFlow, projectEndnoteBodySlots } from './endnote-body-flow.mjs';

// 본문·각주·미주의 조립만 소유합니다. 원본 정책과 측정·예약은 공통 모듈을 사용합니다.
export function layoutNoteBodyPages(content, measure, maxRows = 20000) {
  const unavailable = (error) => ({ state: 'unavailable', error });
  if (
    !Number.isSafeInteger(maxRows) ||
    maxRows < 1 ||
    content.pageSettings?.length !== 1 ||
    content.limited ||
    content.noteShapesError ||
    content.drawings?.length ||
    content.pictures?.length ||
    content.lines?.length
  )
    return unavailable('UnsupportedNotePageContent');
  const sourceTables = selectNoteSourceTables(content, { floatingNotes: true });
  if (sourceTables.state !== 'selected') return sourceTables;
  const setting = content.pageSettings[0],
    reference = pageReferenceBoxes(setting, { x: 20, y: 20 });
  if (reference.state !== 'placed') return reference;
  const flows = content.paragraphFlows ?? [];
  if (
    flows.some(
      (flow) =>
        flow.section !== setting.section_ordinal ||
        (!sourceTables.cellParagraphs.has(flow.paragraph) &&
          !['body', 'footnote', 'endnote'].includes(flow.host)) ||
        flow.column_declaration?.count > 1,
    )
  )
    return unavailable('UnsupportedNotePageFlow');
  const bodyIds = new Set(
    flows.filter((flow) => flow.host === 'body').map((flow) => flow.paragraph),
  );
  if (content.createdTables !== undefined && !Array.isArray(content.createdTables))
    return unavailable('InvalidCreatedTableNoteOwner');
  const identities = new Set();
  for (const table of content.createdTables ?? []) {
    try {
      createdTableIdentity(table?.identity);
    } catch {
      return unavailable('InvalidCreatedTableNoteOwner');
    }
    if (identities.has(table.identity)) return unavailable('AmbiguousCreatedTableNoteOwner');
    identities.add(table.identity);
  }
  const bodyTables = (content.createdTables ?? []).filter(
    (table) => table.section === setting.section_ordinal && bodyIds.has(table.hostParagraph),
  );
  const hasBodyTables = bodyTables.length > 0 || sourceTables.bodyTables.length > 0;
  if (
    bodyTables.length &&
    (content.window || ['rectangles', 'checkBoxes', 'charts'].some((key) => content[key]?.length))
  )
    return unavailable('UnsupportedCreatedTablePageObjects');
  if (
    bodyTables.length &&
    (content.hwp5PageNumberSource?.page_controls?.length ||
      content.hwp5PageNumberSource?.section_starts?.length)
  )
    return unavailable('UnsupportedCreatedTablePageControls');
  const bodyIdentities = new Set(bodyTables.map((table) => table.identity));
  const measured = measureNoteBodies(
    {
      ...content,
      createdTables: (content.createdTables ?? []).filter(
        (table) => !bodyIdentities.has(table.identity),
      ),
    },
    reference.boxes.page.width,
    measure,
    maxRows,
    sourceTables,
  );
  if (measured.state !== 'measured') return measured;
  const footnotes = measured.notes.filter((note) => note.kind === 'footnote'),
    endnotes = measured.notes.filter((note) => note.kind === 'endnote');
  const policies = new Map(),
    separators = new Map();
  for (const kind of new Set(measured.notes.map((note) => note.kind))) {
    const policy = contentNotePagePolicy(content, setting.section_ordinal, kind);
    if (policy.state !== 'selected') return policy;
    const separator = noteSeparatorGeometry(policy, reference.boxes.page.width);
    if (separator.state !== 'selected') return separator;
    policies.set(kind, policy);
    separators.set(kind, separator);
  }
  for (const note of measured.notes.filter((note) => note.boxes.length || note.atomicScene)) {
    const policy = policies.get(note.kind),
      separator = separators.get(note.kind);
    const overhead =
      note.kind === 'footnote' ? policy.aboveLine + separator.height + policy.belowLine : 0;
    if (note.height + overhead > reference.boxes.page.height)
      return unavailable('CreatedNotePageHeightOverflow');
  }
  const body = content.paragraphs.filter(
    (paragraph) =>
      bodyIds.has(paragraph.paragraph) || sourceTables.bodyCellParagraphs.has(paragraph.paragraph),
  );
  const bodyBudget = maxRows - measured.rowCount;
  if (bodyBudget < 1) return unavailable('NotePageLayoutLimit');
  const bodyFlow = hasBodyTables
    ? measureCreatedBodyFlow(
        {
          ...content,
          paragraphs: body,
          createdTables: bodyTables,
          tables: sourceTables.bodyTables,
          boundNoteReferences: content.format === 'hwp5' ? measured.notes : [],
        },
        reference.boxes.page.width,
        measure,
        bodyBudget,
        null,
        { allowSourceTableOverflow: true },
      )
    : layoutContent(
        { paragraphs: body, limited: false },
        reference.boxes.page.width,
        measure,
        bodyBudget,
        { documentBody: true },
      );
  if (bodyFlow.state === 'unavailable') return bodyFlow;
  if (bodyFlow.limited) return unavailable('NotePageLayoutLimit');
  const rows = [...bodyFlow.rows],
    pageFlows = flows.filter((flow) => flow.host === 'body');
  if (endnotes.length) {
    const policy = policies.get('endnote'),
      separator = separators.get('endnote');
    const endnoteFlow = prepareEndnoteBodyFlow(endnotes, policy, separator, flows);
    if (endnoteFlow.state !== 'prepared') return endnoteFlow;
    rows.push(...endnoteFlow.rows);
    pageFlows.push(...endnoteFlow.flows);
  }
  if (rows.length + footnotes.reduce((sum, note) => sum + note.rows.length, 0) > maxRows)
    return unavailable('NotePageLayoutLimit');
  const footPolicy = policies.get('footnote');
  const footSeparator = separators.get('footnote');
  const needsContinuation = footnotes.some(
    (note) =>
      note.height + footPolicy.aboveLine + footSeparator.height + footPolicy.belowLine >
      reference.boxes.page.height,
  );
  const continuation =
    needsContinuation && content.format === 'hwp5' && !hasBodyTables
      ? paginateMeasuredPlainFootnoteContinuations(
          rows,
          setting,
          pageFlows,
          footnotes,
          footPolicy,
          footSeparator.height,
          { maxRows },
        )
      : null;
  if (continuation && continuation.state !== 'ready') return continuation;
  let reservation =
    continuation ??
    (footnotes.length
      ? createFootnoteColumnReservation(
          footnotes,
          policies.get('footnote'),
          separators.get('footnote').height,
        )
      : null);
  if (reservation && reservation.state !== 'ready') return reservation;
  if (reservation && content.createdTables?.length)
    for (const row of rows.filter((row) => row.kind === 'text' || row.createdHost !== undefined)) {
      const bottom = reservation.columnBottom(row, {
        column: reference.boxes.page,
        pageOrdinal: 0,
        columnOrdinal: 0,
        placedRows: [],
      });
      if (!Number.isFinite(bottom)) return unavailable('InvalidCreatedNotePageReservation');
      if (row.height > bottom - reference.boxes.page.y)
        return unavailable('CreatedNotePageHeightOverflow');
    }
  let page =
    continuation?.page ??
    paginateBodyRows(rows, setting, pageFlows, {
      maxRows,
      columnBottom: reservation?.columnBottom,
    });
  // 개별 각주는 페이지보다 짧아도 같은 참조 행의 합계가 본문 예약을 막을 수 있습니다.
  // 정상/다른 실패 경로는 유지하고 정확한 예약 overflow만 기존 plain planner에 연결합니다.
  if (
    !continuation &&
    footnotes.length > 1 &&
    content.format === 'hwp5' &&
    !hasBodyTables &&
    page.state === 'unavailable' &&
    page.error === 'PageColumnReservationOverflow'
  ) {
    const aggregate = paginateMeasuredPlainFootnoteContinuations(
      rows,
      setting,
      pageFlows,
      footnotes,
      footPolicy,
      footSeparator.height,
      { maxRows },
    );
    if (aggregate.state !== 'ready') return aggregate;
    reservation = aggregate;
    page = aggregate.page;
  }
  if (page.state !== 'paginated' || page.limited) return page;
  const projectedBody = hasBodyTables ? projectCreatedBodyFlow(bodyFlow, page.rows, maxRows) : null;
  if (projectedBody && projectedBody.state !== 'projected') return projectedBody;
  const endnoteProjection = projectEndnoteBodySlots(
    { ...page, rows: projectedBody?.rows ?? page.rows },
    endnotes,
  );
  if (endnoteProjection.state !== 'projected') return endnoteProjection;
  const resultRows = endnoteProjection.rows,
    noteSeparators = endnoteProjection.separators,
    boxes = [...(projectedBody?.boxes ?? []), ...endnoteProjection.boxes],
    hostNumberPrefixes = [
      ...(projectedBody?.hostNumberPrefixes ?? []),
      ...endnoteProjection.numberPrefixes,
    ],
    flowPictures = [
      ...(projectedBody?.flowPictures ?? page.flowPictures ?? []),
      ...endnoteProjection.flowPictures,
    ];
  if (reservation)
    for (const physical of page.pages) {
      const selected = reservation.notesFor(page.rows, physical.ordinal, 0);
      if (!selected.length) continue;
      const occupied = page.rows
        .filter((row) => row.pageOrdinal === physical.ordinal)
        .reduce((bottom, row) => Math.max(bottom, row.y + row.height), physical.page.y);
      const placed = placeFootnoteArea(
        selected,
        policies.get('footnote'),
        physical.page,
        occupied,
        separators.get('footnote').height,
        maxRows - resultRows.length,
      );
      if (placed.state !== 'placed') return placed;
      resultRows.push(
        ...placed.rows.map((row) => ({
          ...row,
          pageOrdinal: physical.ordinal,
          columnOrdinal: 0,
          referenceBoxes: { paper: physical.paper, page: physical.page, column: physical.page },
        })),
      );
      boxes.push(
        ...placed.boxes.map((box) => ({
          ...box,
          pageOrdinal: physical.ordinal,
          columnOrdinal: 0,
          referenceBoxes: { paper: physical.paper, page: physical.page, column: physical.page },
        })),
      );
      flowPictures.push(
        ...placed.flowPictures.map((picture) => ({
          ...picture,
          pageOrdinal: physical.ordinal,
          columnOrdinal: 0,
          referenceBoxes: { paper: physical.paper, page: physical.page, column: physical.page },
        })),
      );
      hostNumberPrefixes.push(
        ...placed.numberPrefixes.map((prefix) => ({
          ...prefix,
          pageOrdinal: physical.ordinal,
          columnOrdinal: 0,
          pageClip: physical.page,
          referenceBoxes: { paper: physical.paper, page: physical.page, column: physical.page },
        })),
      );
      const separator = separators.get('footnote');
      if (separator.height > 0)
        noteSeparators.push({
          x: physical.page.x,
          y: placed.separatorY,
          width: separator.width,
          height: separator.height,
          color: separator.color,
          pageOrdinal: physical.ordinal,
          ...(separator.bands ? { bands: separator.bands } : {}),
        });
    }
  if (resultRows.length + hostNumberPrefixes.length > maxRows)
    return unavailable('NotePageLayoutLimit');
  const texts = new Map(content.paragraphs.map((p) => [`${p.section}:${p.paragraph}`, p.text]));
  const coverage = pageParagraphCoverage(content.paragraphs, [
    ...resultRows.filter(
      (row) =>
        !row.createdCell &&
        (row.kind !== 'text' ||
          row.startUnit < row.endUnit ||
          texts.get(`${row.section}:${row.paragraph}`) === ''),
    ),
    ...measured.notes.flatMap((note) => note.coverageRows),
  ]);
  if (coverage.state !== 'complete') return coverage;
  if (hasBodyTables) {
    const bounds = sourceInlineTablePaperBounds(bodyFlow.sourceTables, { boxes }, content);
    if (bounds.state !== 'contained') return bounds;
  }
  return {
    ...page,
    rows: resultRows.toSorted((a, b) => a.pageOrdinal - b.pageOrdinal || a.y - b.y || a.x - b.x),
    noteSeparators,
    boxes,
    hostNumberPrefixes,
    flowPictures,
    placedDrawings: [...(page.placedDrawings ?? []), ...endnoteProjection.placedDrawings],
    placedCurves: [...(page.placedCurves ?? []), ...endnoteProjection.placedCurves],
    ...curveLayoutDiagnostics(page, endnoteProjection.warnings),
    placedContainers: [...(page.placedContainers ?? []), ...endnoteProjection.placedContainers],
    noteAreas: [...(page.noteAreas ?? []), ...endnoteProjection.noteAreas],
    ...(content.createdTables?.length
      ? {
          createdTablesPaginated: true,
          createdCellParagraphs: [
            ...(projectedBody?.createdCellParagraphs ?? []),
            ...measured.notes.flatMap((note) => note.createdCellParagraphs),
          ],
        }
      : {}),
    spatialRows: true,
    pageLayoutMode: content.createdTables?.length
      ? 'measured-note-created-inline'
      : sourceTables.hasTables
        ? 'measured-note-source-inline'
        : 'measured-note-body',
  };
}
