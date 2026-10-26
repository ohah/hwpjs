import { layoutTableBodyContent } from './table-body-content-layout.mjs';
import { layoutDrawingBodyContent } from './drawing-body-content-layout.mjs';
import { drawingPictureScope } from './drawing-picture-scope.mjs';
import { pictureTextMeasure } from './picture-text-measurement.mjs';
import { drawingColumnContext } from './drawing-column-context.mjs';
import { measureInlineDrawingContent } from './inline-drawing-measurement.mjs';
import { inlineDrawingGeometry } from './inline-drawing-geometry.mjs';
import { drawingFillPlan } from './drawing-fill-plan.mjs';
import { signedInt32 } from './signed-int32.mjs';
import { drawingHasNoShadow } from './drawing-shadow-policy.mjs';
import { tableAnchorCoverage } from './table-anchor-coverage.mjs';
import { pageParagraphCoverage } from './page-paragraph-coverage.mjs';
import { measureInlineDrawingCellFlow } from './inline-drawing-cell-flow.mjs';
import { projectOwnedInlineDrawings } from './inline-drawing-owned-projection.mjs';
import { measureDrawingOwnedTables } from './drawing-owned-table-measurement.mjs';
import { textMeasurement } from './text-measurement.mjs';

// Keep block table/caption and floating drawing policies in their existing
// owners; only inline drawings are measured into the delegated body text.
export function layoutMixedTableDrawingBody(content, measure, maxRows = 20000) {
  const fail = (error, details = {}) => ({ state: 'unavailable', error, ...details });
  if (
    !Number.isSafeInteger(maxRows) ||
    maxRows < 1 ||
    typeof measure !== 'function' ||
    !Array.isArray(content?.drawings) ||
    !Array.isArray(content.paragraphs) ||
    (content.pictures != null && !Array.isArray(content.pictures))
  )
    return fail('InvalidMixedTableDrawingBody');
  const scope = drawingPictureScope(
    content,
    content.paragraphs.filter((p) => !p.drawingText && !p.drawingCaption),
  );
  if (scope.state !== 'scoped') return scope;
  const localMeasure = pictureTextMeasure(scope.inlineIndex, [], measure);
  const inline = [],
    floats = [],
    nodes = new Set(),
    anchors = new Map();
  const localTables = new Set(),
    localParagraphs = new Set();
  let measuredRows = 0;
  for (const drawing of content.drawings) {
    const key = `${drawing.section}:${drawing.drawingNode}`;
    if (nodes.has(key)) return fail('AmbiguousMixedInlineObjects');
    nodes.add(key);
    if (drawing.source?.geometry?.treat_as_character === false) {
      floats.push(drawing);
      continue;
    }
    if (
      inlineDrawingGeometry(drawing.source).state !== 'selected' ||
      drawing.source.group_context !== null ||
      !drawingHasNoShadow(drawing.source.paint) ||
      signedInt32(drawing.source.flow?.z_order) === null ||
      drawingFillPlan(content, drawing).state === 'unavailable'
    )
      return fail('UnsupportedMixedInlineDrawing', {
        section: drawing.section,
        drawingNode: drawing.drawingNode,
      });
    const owners = content.paragraphs.filter(
      (p) => p.section === drawing.section && p.paragraph === drawing.hostParagraph,
    );
    const owner = owners[0],
      anchorKey = `${drawing.section}:${drawing.hostParagraph}:${drawing.anchorUnit}`;
    if (owners.length !== 1)
      return fail('AmbiguousMixedInlineOwnership', {
        section: drawing.section,
        drawingNode: drawing.drawingNode,
      });
    if (owner.drawingText)
      return fail('UnsupportedMixedInlineDrawingHost', {
        section: drawing.section,
        drawingNode: drawing.drawingNode,
        paragraph: drawing.hostParagraph,
        policyReason: owner.tableCell ? 'table-cell' : 'drawing-text',
        ...(owner.tableCell
          ? { tableNode: owner.tableCell.tableNode, listNode: owner.tableCell.listNode }
          : {}),
      });
    if (
      !Number.isSafeInteger(drawing.anchorUnit) ||
      drawing.anchorUnit < 0 ||
      owner.text?.[drawing.anchorUnit] !== '\ufffc' ||
      anchors.has(anchorKey)
    )
      return fail('AmbiguousMixedInlineOwnership', {
        section: drawing.section,
        drawingNode: drawing.drawingNode,
      });
    const context = drawingColumnContext(drawing, content.paragraphs, content.paragraphFlows);
    if (context.state !== 'selected') return context;
    if (measuredRows >= maxRows) return fail('MixedInlineLayoutLimit');
    const local = measureDrawingOwnedTables(content, drawing, localMeasure, maxRows - measuredRows);
    if (local.state !== 'prepared') return local;
    for (const entry of local.tables)
      localTables.add(`${entry.table.section}:${entry.table.tableNode}`);
    for (const id of local.paragraphIds) localParagraphs.add(id);
    const measured = measureInlineDrawingContent(
      drawing,
      content.paragraphs,
      context.declaration,
      localMeasure,
      { maxRows: maxRows - measuredRows, inlineTables: local.tables },
    );
    if (measured.state !== 'measured') return measured;
    measuredRows += measured.rowCount;
    const paragraphs = content.paragraphs.filter(
      (p) =>
        p === owner ||
        (p.section === drawing.section &&
          (p.drawingText?.drawingNode === drawing.drawingNode ||
            p.drawingCaption?.drawingNode === drawing.drawingNode)) ||
        local.paragraphIds.has(`${p.section}:${p.paragraph}`),
    );
    const members = new Set(
      paragraphs.filter((p) => p.drawingText || p.drawingCaption).map((p) => p.paragraph),
    );
    const entry = {
      drawing,
      context,
      measured,
      owner,
      paragraphs,
      pictures: (content.pictures ?? []).filter(
        (p) => p.section === drawing.section && members.has(p.paragraph),
      ),
    };
    inline.push(entry);
    anchors.set(anchorKey, entry);
  }
  const inlineNodes = new Set(inline.map((e) => `${e.drawing.section}:${e.drawing.drawingNode}`));
  const paragraphs = content.paragraphs.filter(
    (p) =>
      !inlineNodes.has(`${p.section}:${p.drawingText?.drawingNode}`) &&
      !inlineNodes.has(`${p.section}:${p.drawingCaption?.drawingNode}`) &&
      !localParagraphs.has(`${p.section}:${p.paragraph}`),
  );
  const paragraphIds = new Set(paragraphs.map((p) => `${p.section}:${p.paragraph}`));
  for (const picture of content.pictures ?? []) {
    const owners = content.paragraphs.filter(
      (p) => p.section === picture.section && p.paragraph === picture.paragraph,
    );
    if (owners.length !== 1) return fail('AmbiguousDrawingPictureOwner');
    if (
      !paragraphIds.has(`${picture.section}:${picture.paragraph}`) &&
      !scope.localIds.has(`${picture.section}:${picture.pictureNode}`)
    )
      return fail('UnsupportedMixedInlinePictures', {
        section: picture.section,
        paragraph: picture.paragraph,
        pictureNode: picture.pictureNode,
      });
  }
  const delegated = {
    ...content,
    drawings: floats,
    paragraphs,
    tables: content.tables.filter((t) => !localTables.has(`${t.section}:${t.tableNode}`)),
    pictures: (content.pictures ?? []).filter((p) =>
      paragraphIds.has(`${p.section}:${p.paragraph}`),
    ),
    paragraphFlows: content.paragraphFlows?.filter((p) =>
      paragraphIds.has(`${p.section}:${p.paragraph}`),
    ),
    inlineObjectAnchors: inline
      .filter((e) => !e.owner.tableCell)
      .map(({ drawing }) => ({
        section: drawing.section,
        paragraph: drawing.hostParagraph,
        anchorUnit: drawing.anchorUnit,
        node: drawing.drawingNode,
      })),
  };
  const bodyMeasure = (text, paragraph, unit, kind) => {
    const entry =
      kind === 'text' && anchors.get(`${paragraph.section}:${paragraph.paragraph}:${unit}`);
    return entry
      ? {
          width: entry.measured.width,
          height: entry.measured.height,
          spacingBasisHeight: textMeasurement(localMeasure('', paragraph, unit, kind)).height,
        }
      : localMeasure(text, paragraph, unit, kind);
  };
  if (measuredRows >= maxRows) return fail('MixedInlineLayoutLimit');
  const budget = maxRows;
  const layoutTables = (value, measured, limit, options = {}) =>
    layoutTableBodyContent(value, measured, limit, {
      ...options,
      measureCellFlow: (input) => measureInlineDrawingCellFlow(input, inline, content),
      completeLayout: (layout) => projectOwnedInlineDrawings(inline, layout, limit),
    });
  const body = floats.length
    ? layoutDrawingBodyContent(delegated, bodyMeasure, budget, layoutTables)
    : layoutTables(delegated, bodyMeasure, budget);
  if (body.state !== 'paginated')
    return body.error === 'NoFittingTableTextRegion'
      ? {
          ...body,
          inlineObjectMetrics: inline
            .filter(
              (entry) =>
                entry.drawing.section === body.section &&
                entry.drawing.hostParagraph === body.paragraph,
            )
            .map((entry) => ({
              drawingNode: entry.drawing.drawingNode,
              anchorUnit: entry.drawing.anchorUnit,
              width: entry.measured.width,
              height: entry.measured.height,
              sourceWidth: entry.drawing.source.geometry.width,
              sourceHeight: entry.drawing.source.geometry.height,
            })),
        }
      : body;
  const { rows, boxes, placedDrawings, tableAnchors } = body;
  if (rows.length + (body.repeatedTableHeaderRows?.length ?? 0) > maxRows)
    return fail('MixedInlineLayoutLimit');
  const controls = tableAnchorCoverage(content, { ...body, rows, boxes, tableAnchors });
  if (controls.state !== 'covered') return controls;
  const coverage = pageParagraphCoverage(content.paragraphs, [...rows, ...controls.rows]);
  if (coverage.state !== 'complete') {
    const groups = new Map();
    for (const row of [...rows, ...controls.rows]) {
      const key = `${row.section}:${row.paragraph}`,
        group = groups.get(key) ?? [];
      group.push(row);
      groups.set(key, group);
    }
    const owner = content.paragraphs.find(
      (p) =>
        pageParagraphCoverage([p], groups.get(`${p.section}:${p.paragraph}`) ?? []).state !==
        'complete',
    );
    return {
      ...coverage,
      layoutStage: 'mixed-table-drawing-coverage',
      section: owner?.section,
      paragraph: owner?.paragraph,
    };
  }
  return {
    ...body,
    boxes,
    tableAnchors,
    rows: rows.toSorted((a, b) => a.pageOrdinal - b.pageOrdinal || a.y - b.y || a.x - b.x),
    placedDrawings,
  };
}
