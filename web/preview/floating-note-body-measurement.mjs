import { layoutFloatingTableBody } from './floating-table-body-layout.mjs';
import { pageReferenceBoxes } from './page-reference-boxes.mjs';
import { pageParagraphCoverage } from './page-paragraph-coverage.mjs';
import { tableAnchorCoverage } from './table-anchor-coverage.mjs';
import { selectNoteSourceTables } from './note-source-table-owners.mjs';
import { hwpUnitPixels } from './hwp-units.mjs';
import { equationTextAnchors, equationTextMeasure } from './equation-text-anchors.mjs';
import { projectNoteFlowPictures } from './note-picture-projection.mjs';
import { layoutTableBodyContent } from './table-body-content-layout.mjs';
import { notePageScenes } from './note-page-scenes.mjs';
import { previewPictureLayers } from './picture-layers.mjs';

/** Adapt a proven note list to the existing floating-table engine, without changing its source. */
export function measureFloatingNoteBody(
  content,
  width,
  measure,
  maxRows,
  { inlineTables = false } = {},
) {
  const fail = (error) => ({ state: 'unavailable', error });
  if (
    content?.pageSettings?.length !== 1 ||
    !Array.isArray(content.paragraphs) ||
    !Array.isArray(content.paragraphFlows) ||
    !Array.isArray(content.tables) ||
    !content.tables.length ||
    !Number.isFinite(width) ||
    width <= 0 ||
    !Number.isSafeInteger(maxRows) ||
    maxRows < 1 ||
    typeof measure !== 'function' ||
    typeof inlineTables !== 'boolean'
  )
    return fail('InvalidFloatingNoteBody');
  const selected = selectNoteSourceTables(content, { floatingNotes: true });
  if (selected.state !== 'selected') return selected;
  if (selected.bodyTables.length) return fail('InvalidFloatingNoteBodyOwner');
  const direct = content.paragraphs.filter((p) => !p.tableCell);
  if (!direct.length) return fail('MissingFloatingNoteBodyOwner');
  if (content.createdTables?.length) return fail('UnsupportedFloatingNoteCreatedTable');
  for (const paragraph of content.paragraphs)
    if (equationTextAnchors(paragraph).state !== 'resolved')
      return fail('UnsupportedFloatingNoteEquation');
  measure = equationTextMeasure(measure);
  const identities = new Set(content.paragraphs.map((p) => `${p.section}:${p.paragraph}`));
  for (const [key, field] of [
    ['drawings', 'hostParagraph'],
    ['lines', 'paragraph'],
    ['containers', 'hostParagraph'],
    ['formulas', 'paragraph'],
  ])
    if (content[key]?.some((item) => identities.has(`${item.section}:${item[field]}`)))
      return { ...fail('UnsupportedFloatingNoteBodyObject'), objectKind: key };
  const flows = [],
    noteOwners = new Set();
  for (const paragraph of content.paragraphs) {
    const matches = content.paragraphFlows.filter(
      (f) => f.section === paragraph.section && f.paragraph === paragraph.paragraph,
    );
    if (matches.length !== 1) return fail('AmbiguousFloatingNoteBodyOwner');
    const flow = matches[0];
    if (paragraph.tableCell) {
      flows.push(flow);
      continue;
    }
    const context = flow.note_context;
    if (
      !['footnote', 'endnote'].includes(flow.host) ||
      flow.top_level !== false ||
      context?.kind !== flow.host ||
      !Number.isSafeInteger(context.note_node) ||
      context.note_node < 0 ||
      !Number.isSafeInteger(context.list_node) ||
      context.list_node < 0 ||
      (flow.column_declaration !== null && flow.column_declaration?.count !== 1)
    )
      return fail('InvalidFloatingNoteBodyOwner');
    noteOwners.add(`${flow.section}:${context.kind}:${context.note_node}:${context.list_node}`);
    // Only the local planning view uses body flow, as in the existing endnote paginator.
    flows.push({ ...flow, host: 'body', top_level: true, single_column: true });
  }
  if (noteOwners.size !== 1) return fail('AmbiguousFloatingNoteBodyOwner');
  const reference = pageReferenceBoxes(content.pageSettings[0], { x: 0, y: 0 });
  if (reference.state !== 'placed') return reference;
  const widthUnits = Math.round(width / hwpUnitPixels(1)),
    heightUnits = Math.round(reference.boxes.page.height / hwpUnitPixels(1));
  if (Math.abs(hwpUnitPixels(widthUnits) - width) > 1e-8)
    return fail('InvalidFloatingNoteBodyWidth');
  const setting = {
    ...content.pageSettings[0],
    width: widthUnits,
    height: heightUnits,
    orientation: 'widely',
    gutter_type: 'left_only',
    duplicate_margins: 0,
    margin: { left: 0, right: 0, top: 0, bottom: 0, gutter: 0, header: 0, footer: 0 },
  };
  const pictures = (content.pictures ?? []).filter((p) =>
    identities.has(`${p.section}:${p.paragraph}`),
  );
  const layoutBody = inlineTables ? layoutTableBodyContent : layoutFloatingTableBody;
  const view = {
    ...content,
    paragraphFlows: flows,
    pageSettings: [setting],
    pictures,
    drawings: [],
    lines: [],
    containers: [],
    createdTables: [],
    inlineObjectAnchors: [],
    floatingDrawingAnchors: [],
  };
  const layout = layoutBody(view, measure, maxRows);
  if (layout.state !== 'paginated') return layout;
  if (layout.limited) return fail('UnsupportedFloatingNoteContinuation');
  if (layout.pages.length !== 1) {
    if (
      !inlineTables ||
      content.paragraphFlows.find(
        (f) => f.section === direct[0].section && f.paragraph === direct[0].paragraph,
      )?.host !== 'endnote'
    )
      return fail('UnsupportedFloatingNoteContinuation');
    const anchors = tableAnchorCoverage(content, layout);
    if (anchors.state !== 'covered') return anchors;
    const coverage = pageParagraphCoverage(content.paragraphs, [...layout.rows, ...anchors.rows]);
    if (coverage.state !== 'complete') return coverage;
    const scenes = notePageScenes(
      { ...layout, placedDrawings: [], placedContainers: [] },
      { front: [], behind: [] },
      previewPictureLayers(view, layout, width),
      width,
    );
    if (scenes.state !== 'measured') return scenes;
    return {
      ...scenes,
      coverageRows: anchors.rows,
      numberPrefixes: [],
      rowCount: scenes.rows.length,
      ownedPictures: pictures.map((p) => ({
        section: p.section,
        pictureNode: p.pictureNode,
        paragraph: p.paragraph,
        anchorUnit: p.anchorUnit,
      })),
    };
  }
  const page = layout.pages[0].page;
  const height = Math.max(
    ...layout.rows.map((r) => r.y + r.height - page.y),
    ...layout.boxes.map((b) => b.y + b.height - page.y),
  );
  if (!Number.isFinite(height) || height <= 0 || height > page.height)
    return fail('InvalidFloatingNoteBodyHeight');
  const bounds = { x: 0, y: 0, width, height };
  const local = (item) => ({
    ...item,
    x: item.x - page.x,
    y: item.y - page.y,
    pageOrdinal: 0,
    columnOrdinal: 0,
    referenceBoxes: { paper: bounds, page: bounds, column: bounds },
    ...(item.pageClip
      ? { pageClip: { ...item.pageClip, x: item.pageClip.x - page.x, y: item.pageClip.y - page.y } }
      : {}),
  });
  const rows = layout.rows.map(local),
    boxes = layout.boxes.map(local);
  const projectedPictures = projectNoteFlowPictures(layout.flowPictures ?? [], -page.x, -page.y, {
    pageOrdinal: 0,
    columnOrdinal: 0,
    referenceBoxes: { paper: bounds, page: bounds, column: bounds },
  });
  if (projectedPictures.state !== 'projected') return projectedPictures;
  if (
    projectedPictures.pictures.some(
      (p) =>
        p.rectangle.x < 0 ||
        p.rectangle.y < 0 ||
        p.rectangle.x + p.rectangle.width > width + 1e-8 ||
        p.rectangle.y + p.rectangle.height > height + 1e-8,
    )
  )
    return fail('NotePictureBoundsOverflow');
  for (const picture of pictures) {
    const anchors = rows.filter(
      (row) =>
        row.kind === 'text' &&
        row.section === picture.section &&
        row.paragraph === picture.paragraph &&
        row.startUnit <= picture.anchorUnit &&
        picture.anchorUnit < row.endUnit,
    );
    if (anchors.length !== 1) return fail('MissingNotePictureAnchor');
  }
  const anchors = tableAnchorCoverage(content, layout);
  if (anchors.state !== 'covered') return anchors;
  const coverage = pageParagraphCoverage(content.paragraphs, [...rows, ...anchors.rows]);
  if (coverage.state !== 'complete') return coverage;
  return {
    state: 'measured',
    rows,
    boxes,
    coverageRows: anchors.rows,
    numberPrefixes: [],
    height,
    rowCount: rows.length,
    ownedPictures: pictures.map((p) => ({
      section: p.section,
      pictureNode: p.pictureNode,
      paragraph: p.paragraph,
      anchorUnit: p.anchorUnit,
    })),
    flowPictures: projectedPictures.pictures,
  };
}
