import { pageReferenceBoxes } from './page-reference-boxes.mjs';
import { pageRowFitHeight } from './page-row-extents.mjs';
import { columnReferenceBoxes } from './column-reference-boxes.mjs';
import { layoutContent } from './layout.mjs';
import { measureInlineObjectParagraph } from './inline-object-paragraph-measurement.mjs';
import { projectInlineObjectPages } from './inline-object-page-projection.mjs';
import { paginateSplitInlineTables } from './split-inline-table-pagination.mjs';
import { prepareSplitInlineTableHost } from './split-inline-table-host.mjs';
import { fitAtomicInlineTable } from './atomic-inline-table-fit.mjs';
import { projectSplitInlineTables } from './split-inline-table-projection.mjs';
import { hwpUnitPixels } from './hwp-units.mjs';
import { drawingColumnContext } from './drawing-column-context.mjs';
import { projectDrawingTextPage } from './drawing-text-page-projection.mjs';
import { drawingFillPlan } from './drawing-fill-plan.mjs';
import { pageParagraphCoverage } from './page-paragraph-coverage.mjs';
import { structuralAnchorUnits } from './structural-anchor-units.mjs';
import { measureSourceInlineTables } from './source-table-inline-measurement.mjs';
import { layoutInlineTablePageContent } from './inline-table-page-content.mjs';
import { inlineGroupObject } from './inline-group-object.mjs';
import { projectInlineObjectSourceRows } from './inline-object-source-row-projection.mjs';
import { inlineGroupPictureObjects } from './inline-group-picture-objects.mjs';
import { textMeasurement } from './text-measurement.mjs';
import { floatingPolygonAnchorUnits } from './floating-polygon-anchor-units.mjs';
import {
  groupCaptionParagraphKeys,
  projectInlineGroupCaption,
} from './inline-group-caption-projection.mjs';
import { projectInlineGroupCurves } from './inline-group-curve-content.mjs';
import { curveLayoutDiagnostics } from './curve-layout-diagnostics.mjs';
import { drawingHasNoShadow } from './drawing-shadow-policy.mjs';
import { sourceInlineCaptionOwnership } from './source-inline-caption-ownership.mjs';
import { projectInlineGroupLayeredPictures } from './inline-group-layered-pictures.mjs';
import { validateSourceInlineCellPictureProjection } from './source-inline-cell-picture-ownership.mjs';
import { sourceInlineTableCollisionFootprints } from './source-inline-table-collision-footprints.mjs';
import { floatingDrawingAnchorUnits } from './floating-drawing-anchor-units.mjs';

// Body reservation owns the root rectangle; existing group projections own
// child geometry/text. No source geometry or native editing value is rewritten.
export function layoutInlineGroupBody(
  content,
  measure,
  maxRows = 20000,
  {
    measureBodyParagraph,
    completeBody,
    preparedSourceTables,
    paginateSourceBody,
    additionalZeroWidthUnits,
    rowY,
    minimumRowPage,
  } = {},
) {
  const fail = (error) => ({ state: 'unavailable', error });
  if (
    (rowY !== undefined && typeof rowY !== 'function') ||
    (minimumRowPage !== undefined && typeof minimumRowPage !== 'function') ||
    (paginateSourceBody && (rowY !== undefined || minimumRowPage !== undefined))
  )
    return fail('InvalidInlineGroupCallbacks');
  if (
    (measureBodyParagraph !== undefined && typeof measureBodyParagraph !== 'function') ||
    (completeBody !== undefined && typeof completeBody !== 'function')
  )
    return fail('InvalidInlineGroupCallbacks');
  if (
    (paginateSourceBody !== undefined && typeof paginateSourceBody !== 'function') ||
    (additionalZeroWidthUnits !== undefined && typeof additionalZeroWidthUnits !== 'function')
  )
    return fail('InvalidInlineGroupCallbacks');
  if (
    !Number.isSafeInteger(maxRows) ||
    maxRows < 1 ||
    content.pageSettings?.length !== 1 ||
    content.limited ||
    content.createdTables?.length
  )
    return fail('UnsupportedInlineGroupContent');
  const roots = (content.containers ?? []).filter((row) => row.source?.group_context === null);
  if (!roots.length) return fail('MissingInlineGroupRoots');
  const setting = content.pageSettings[0],
    reference = pageReferenceBoxes(setting, { x: 20, y: 20 });
  if (reference.state !== 'placed') return reference;
  const byNode = new Map(),
    byParagraph = new Map(),
    objectsByNode = new Map();
  for (const root of roots) {
    const object = inlineGroupObject(root, setting.section_ordinal, {
      paragraphs: content.paragraphs,
      measure,
      maxRows,
    });
    if (object.state !== 'measured' || byNode.has(root.containerNode))
      return fail('UnsupportedInlineGroupSource');
    byNode.set(root.containerNode, root);
    objectsByNode.set(root.containerNode, object);
    const entries = byParagraph.get(root.hostParagraph) ?? [];
    entries.push({
      objectNode: root.containerNode,
      unit: root.anchorUnit,
      width: object.width,
      height: object.height,
    });
    byParagraph.set(root.hostParagraph, entries);
  }
  if (
    preparedSourceTables !== undefined &&
    (preparedSourceTables?.state !== 'measured' ||
      !(preparedSourceTables.tables instanceof Map) ||
      !(preparedSourceTables.hosts instanceof Map) ||
      preparedSourceTables.tables.size !== (content.tables?.length ?? 0))
  )
    return fail('InvalidInlineGroupSourceTables');
  const sourceTables = preparedSourceTables ?? measureSourceInlineTables(content, measure, maxRows);
  if (sourceTables.state !== 'measured') return sourceTables;
  for (const entry of sourceTables.tables.values()) {
    if (byNode.has(entry.table.tableNode)) return fail('AmbiguousInlineGroupObjects');
    const key = `${entry.table.section}:${entry.table.hostParagraph}`;
    const objects = sourceTables.hosts
      .get(key)
      .filter((row) => row.tableNode === entry.table.tableNode);
    const entries = byParagraph.get(entry.table.hostParagraph) ?? [];
    entries.push(
      ...objects.map(({ tableNode, ...object }) => ({ ...object, objectNode: tableNode })),
    );
    byParagraph.set(entry.table.hostParagraph, entries);
  }
  const pictures = inlineGroupPictureObjects(content, setting.section_ordinal, { sourceTables });
  if (pictures.state !== 'measured') return pictures;
  for (const [node, { picture, object }] of pictures.byNode) {
    if (byNode.has(node) || sourceTables.tables.has(node))
      return fail('AmbiguousInlineGroupObjects');
    const entries = byParagraph.get(picture.paragraph) ?? [];
    entries.push(object);
    byParagraph.set(picture.paragraph, entries);
  }
  const unsupportedDrawing = (content.drawings ?? []).find(
    (row) =>
      !byNode.has(row.source?.group_context?.root_anchor) ||
      row.section !== setting.section_ordinal ||
      row.source?.caption != null ||
      !drawingHasNoShadow(row.source?.paint),
  );
  if (unsupportedDrawing)
    return {
      ...fail('UnsupportedInlineGroupChildren'),
      section: unsupportedDrawing.section,
      drawingNode: unsupportedDrawing.drawingNode,
      paragraph: unsupportedDrawing.hostParagraph,
      policyReason: !byNode.has(unsupportedDrawing.source?.group_context?.root_anchor)
        ? 'UnselectedDrawingRoot'
        : unsupportedDrawing.section !== setting.section_ordinal
          ? 'DrawingSectionMismatch'
          : unsupportedDrawing.source?.caption != null
            ? 'DrawingCaption'
            : 'DrawingShadow',
    };
  const unsupportedPicture = (content.pictures ?? []).find(
    (row) =>
      (!byNode.has(row.owner?.anchorNode) &&
        !pictures.byNode.has(row.pictureNode) &&
        !pictures.layeredByNode.has(row.pictureNode) &&
        !pictures.cellByNode.has(row.pictureNode)) ||
      row.section !== setting.section_ordinal ||
      row.paintError,
  );
  if (unsupportedPicture)
    return {
      ...fail('UnsupportedInlineGroupChildren'),
      section: unsupportedPicture.section,
      paragraph: unsupportedPicture.paragraph,
      pictureNode: unsupportedPicture.pictureNode,
      policyReason: 'UnselectedOrInvalidPicture',
    };
  const tableCaptions = sourceInlineCaptionOwnership(sourceTables, content.paragraphs);
  if (tableCaptions.state !== 'selected') return tableCaptions;
  const body = content.paragraphs.filter(
    (row) => !row.drawingText && !row.drawingCaption && !row.tableCell && !row.tableCaption,
  );
  if (
    content.paragraphs.some((row) => row.clipped) ||
    groupCaptionParagraphKeys(roots, content.paragraphs) === null
  )
    return fail('UnsupportedInlineGroupOwnership');
  const flows = (content.paragraphFlows ?? []).filter((row) =>
    body.some((p) => p.section === row.section && p.paragraph === row.paragraph),
  );
  if (
    flows.length !== body.length ||
    flows.some((row) => row.host !== 'body' || row.top_level !== true)
  )
    return fail('UnsupportedInlineGroupFlow');
  const rows = [],
    measurements = [],
    seen = new Set(),
    splitTables = new Map();
  for (const paragraph of body) {
    const matches = flows.filter(
      (row) => row.section === paragraph.section && row.paragraph === paragraph.paragraph,
    );
    if (
      matches.length !== 1 ||
      paragraph.section !== setting.section_ordinal ||
      rows.length >= maxRows
    )
      return fail('InvalidInlineGroupFlow');
    const columns = columnReferenceBoxes(reference.boxes.page, matches[0].column_declaration);
    if (columns.state !== 'placed') return columns;
    const entries = byParagraph.get(paragraph.paragraph);
    let zeroWidthUnits;
    try {
      zeroWidthUnits = [...structuralAnchorUnits(paragraph)];
      for (const unit of floatingDrawingAnchorUnits(content, paragraph, entries ?? [])) {
        if (zeroWidthUnits.includes(unit)) return fail('AmbiguousInlineGroupZeroWidthAnchor');
        zeroWidthUnits.push(unit);
      }
      for (const unit of pictures.zeroWidthAnchors.get(
        `${paragraph.section}:${paragraph.paragraph}`,
      ) ?? []) {
        if (zeroWidthUnits.includes(unit)) return fail('AmbiguousInlineGroupZeroWidthAnchor');
        zeroWidthUnits.push(unit);
      }
      for (const unit of additionalZeroWidthUnits?.(paragraph) ?? []) {
        if (zeroWidthUnits.includes(unit)) return fail('AmbiguousInlineGroupZeroWidthAnchor');
        zeroWidthUnits.push(unit);
      }
      for (const unit of floatingPolygonAnchorUnits(content, paragraph)) {
        if (zeroWidthUnits.includes(unit)) return fail('UnsupportedInlineGroupPolygonAnchor');
        zeroWidthUnits.push(unit);
      }
    } catch {
      return fail('InvalidInlineGroupHostAnchors');
    }
    let measured =
      measureBodyParagraph?.(paragraph, columns.boxes[0].width) ??
      (entries
        ? measureInlineObjectParagraph(paragraph, entries, columns.boxes[0].width, measure, {
            maxRows: maxRows - rows.length,
            allowLineOverflow: true,
            zeroWidthUnits,
          })
        : layoutContent(
            { paragraphs: [paragraph], limited: false },
            columns.boxes[0].width,
            (text, p, unit, kind) =>
              kind === 'text' && zeroWidthUnits.includes(unit)
                ? { width: 0, height: textMeasurement(measure('', p, unit, kind)).height }
                : measure(text, p, unit, kind),
            maxRows - rows.length,
            { documentBody: true },
          ));
    if (measured.state === 'unavailable' || (entries && measured.state !== 'measured'))
      return { ...measured, section: paragraph.section, paragraph: paragraph.paragraph };
    if (measured.limited) return fail('InlineGroupLayoutLimit');
    if (entries?.length === 1 && sourceTables.tables.has(entries[0].objectNode))
      measured = fitAtomicInlineTable(
        paragraph,
        measured,
        sourceTables.tables.get(entries[0].objectNode),
        reference,
        columns.boxes,
      );
    if (
      entries?.length === 1 &&
      sourceTables.tables.has(entries[0].objectNode) &&
      measured.rows.some((row) => pageRowFitHeight(row) > reference.boxes.page.height)
    ) {
      if (completeBody || paginateSourceBody || measureBodyParagraph)
        return fail('UnsupportedInlineGroupSplitCallbacks');
      const entry = sourceTables.tables.get(entries[0].objectNode);
      const split = prepareSplitInlineTableHost(paragraph, measured, entry, {
        capacity: reference.boxes.page.height,
        zeroWidthUnits,
      });
      if (split.state !== 'prepared')
        return {
          ...split,
          rowHeight: measured.rows.find(
            (row) => pageRowFitHeight(row) > reference.boxes.page.height,
          )?.height,
          pageHeight: reference.boxes.page.height,
        };
      if (rows.length + split.rows.length > maxRows) return fail('InlineGroupLayoutLimit');
      rows.push(...split.rows);
      splitTables.set(entry.table.tableNode, { entry, split });
      seen.add(paragraph.paragraph);
      continue;
    }
    rows.push(
      ...measured.rows.map((row) =>
        entries
          ? {
              ...row,
              inlineTables: entries
                .filter((entry) => sourceTables.tables.has(entry.objectNode))
                .map((entry) => ({ tableNode: entry.objectNode, unit: entry.unit })),
            }
          : row,
      ),
    );
    if (entries) {
      seen.add(paragraph.paragraph);
      measurements.push(measured);
    }
  }
  if (seen.size !== byParagraph.size)
    return {
      ...fail('MissingInlineGroupHost'),
      section: setting.section_ordinal,
      missingHosts: [...byParagraph.keys()]
        .filter((id) => !seen.has(id))
        .map((paragraph) => ({
          paragraph,
          objectNodes: byParagraph.get(paragraph).map((o) => o.objectNode),
          tableCell: content.paragraphs.find(
            (p) => p.section === setting.section_ordinal && p.paragraph === paragraph,
          )?.tableCell,
        })),
    };
  let page = paginateSourceBody
    ? paginateSourceBody({
        rows,
        setting,
        flows,
        paragraphs: body,
        objects: [...byNode.values()].map((root) => ({
          ...objectsByNode.get(root.containerNode),
          section: root.section,
          paragraph: root.hostParagraph,
        })),
      })
    : paginateSplitInlineTables(rows, setting, flows, splitTables, {
        columnZones: true,
        maxRows,
        rowY,
        minimumRowPage,
      });
  if (page.state !== 'paginated' || page.limited) return page;
  if (completeBody) {
    page = completeBody(page);
    if (page?.state !== 'paginated') return page ?? fail('InvalidInlineGroupCompletion');
  }
  const placedContainers = [],
    tableRows = [],
    captionRows = [],
    boxes = [...(page.boxes ?? [])],
    tableCaptionBounds = [...(page.tableCaptionBounds ?? [])],
    flowPictures = [...(page.flowPictures ?? [])];
  const splitProjection = projectSplitInlineTables(splitTables, page, {
    maxRows: maxRows - page.rows.length,
  });
  if (splitProjection.state !== 'placed') return splitProjection;
  const bodyRows = splitProjection.bodyRows.map((row) => ({ ...row }));
  tableRows.push(...splitProjection.rows);
  boxes.push(...splitProjection.boxes);
  flowPictures.push(...splitProjection.flowPictures);
  tableCaptionBounds.push(...splitProjection.tableCaptionBounds);
  const projections =
    completeBody || paginateSourceBody
      ? [
          projectInlineObjectSourceRows(
            [...byNode.values()].map((root) => ({
              ...objectsByNode.get(root.containerNode),
              section: root.section,
              paragraph: root.hostParagraph,
            })),
            bodyRows,
          ),
        ]
      : measurements.map((measured) => projectInlineObjectPages(measured, bodyRows));
  for (const projected of projections) {
    if (projected.state !== 'placed') return projected;
    for (const placement of projected.objects) {
      const root = byNode.get(placement.objectNode),
        paper = placement.referenceBoxes?.paper,
        box = placement.rectangle;
      if (
        !paper ||
        ![
          paper.x,
          paper.y,
          paper.width,
          paper.height,
          paper.x + paper.width,
          paper.y + paper.height,
        ].every(Number.isFinite) ||
        paper.width <= 0 ||
        paper.height <= 0 ||
        box.x < paper.x ||
        box.y < paper.y ||
        box.x + box.width > paper.x + paper.width + 1e-8 ||
        box.y + box.height > paper.y + paper.height + 1e-8
      )
        return fail('InlineGroupPaperOverflow');
      if (!root) {
        if (pictures.byNode.has(placement.objectNode)) continue;
        const entry = sourceTables.tables.get(placement.objectNode);
        if (!entry) return fail('AmbiguousInlineGroupObjects');
        const projected = layoutInlineTablePageContent(
          entry.table,
          entry.measured,
          placement,
          entry.margins,
          {
            maxRows: maxRows - bodyRows.length - tableRows.length - captionRows.length,
            captionReservation: entry.captionReservation,
          },
        );
        if (projected.state !== 'placed') return projected;
        tableRows.push(...projected.rows);
        boxes.push(...projected.boxes);
        flowPictures.push(...(projected.flowPictures ?? []));
        tableCaptionBounds.push(...(projected.tableCaptionBounds ?? []));
        continue;
      }
      const hosts = bodyRows.filter(
        (row) =>
          row.kind === 'text' &&
          row.section === placement.section &&
          row.paragraph === placement.paragraph &&
          row.startUnit <= placement.unit &&
          placement.unit < row.endUnit &&
          row.pageOrdinal === placement.pageOrdinal,
      );
      if (hosts.length !== 1) return fail('AmbiguousInlineGroupHost');
      const object = objectsByNode.get(root.containerNode),
        { left, top } = object;
      const current = {
        ...placement,
        rectangle: {
          x: box.x + left,
          y: box.y + top,
          width: hwpUnitPixels(root.source.geometry.width),
          height: hwpUnitPixels(root.source.geometry.height),
        },
      };
      hosts[0].inlineGroupPlacements = [...(hosts[0].inlineGroupPlacements ?? []), current];
      placedContainers.push({
        ...current,
        containerNode: root.containerNode,
        outerRectangle: { ...box },
      });
      const caption = projectInlineGroupCaption(root, object, placement, {
        maxRows: maxRows - bodyRows.length - tableRows.length - captionRows.length,
      });
      if (caption.state !== 'placed') return caption;
      captionRows.push(...caption.rows);
    }
  }
  const resultRows = [...bodyRows, ...tableRows, ...captionRows],
    placedDrawings = [];
  if (resultRows.length > maxRows) return fail('InlineGroupLayoutLimit');
  for (const drawing of content.drawings ?? []) {
    const columns = drawingColumnContext(drawing, content.paragraphs, content.paragraphFlows);
    if (columns.state !== 'selected') return columns;
    const fill = drawingFillPlan(content, drawing);
    if (fill.state === 'unavailable') return fill;
    if (resultRows.length >= maxRows) return fail('InlineGroupLayoutLimit');
    const text = projectDrawingTextPage(
      drawing,
      content.containers,
      content.paragraphs,
      columns.declaration,
      bodyRows,
      measure,
      { maxRows: maxRows - resultRows.length, overflow: 'extend-last-column' },
    );
    if (text.state !== 'placed') return text;
    const hosts = bodyRows.filter(
      (row) =>
        row.kind === 'text' &&
        row.section === drawing.section &&
        row.paragraph === drawing.hostParagraph &&
        row.startUnit <= drawing.anchorUnit &&
        drawing.anchorUnit < row.endUnit &&
        row.pageOrdinal === text.pageOrdinal,
    );
    if (
      hosts.length !== 1 ||
      text.rows.some(
        (row) =>
          row.y < hosts[0].y - 1e-8 || row.y + row.height > hosts[0].y + hosts[0].height + 1e-8,
      )
    )
      return {
        ...fail('InlineGroupTextReservationOverflow'),
        section: drawing.section,
        drawingNode: drawing.drawingNode,
        hostParagraph: drawing.hostParagraph,
        ...(hosts.length === 1
          ? { reservationY: hosts[0].y, reservationHeight: hosts[0].height }
          : {}),
        rectangle: text.rectangle,
        textBounds: text.textBounds,
        textRowGeometry: text.rows.slice(0, 8).map((row) => ({
          y: row.y,
          height: row.height,
          textHeight: row.textHeight,
          startUnit: row.startUnit,
          endUnit: row.endUnit,
        })),
      };
    resultRows.push(
      ...text.rows.map((row) =>
        text.overflowed === true ? { ...row, drawingTextOverflow: 'extend-last-column' } : row,
      ),
    );
    placedDrawings.push({
      section: drawing.section,
      drawingNode: drawing.drawingNode,
      hostParagraph: drawing.hostParagraph,
      anchorUnit: drawing.anchorUnit,
      pageOrdinal: text.pageOrdinal,
      rectangle: text.rectangle,
      fill,
    });
  }
  const curves = projectInlineGroupCurves(content, bodyRows, measure, maxRows - resultRows.length);
  if (curves.state !== 'placed') return curves;
  resultRows.push(...curves.rows);
  const sourceTexts = new Map(
    content.paragraphs.map((p) => [`${p.section}:${p.paragraph}`, p.text]),
  );
  const coverageRows = page.createdTablesPaginated
    ? resultRows.filter(
        (row) =>
          !row.createdCell &&
          (row.kind !== 'text' ||
            row.startUnit < row.endUnit ||
            sourceTexts.get(`${row.section}:${row.paragraph}`) === ''),
      )
    : resultRows;
  const coverage = pageParagraphCoverage(content.paragraphs, coverageRows);
  if (coverage.state !== 'complete') return coverage;
  const layered = projectInlineGroupLayeredPictures(
    pictures.layeredByNode,
    content.paragraphs,
    bodyRows,
  );
  if (layered.state !== 'projected') return layered;
  const cellPictures = validateSourceInlineCellPictureProjection(
    pictures.cellByNode,
    flowPictures,
    resultRows,
  );
  if (cellPictures.state !== 'complete') return cellPictures;
  const repeated = {
    repeatedTableHeaderRows: [
      ...(page.repeatedTableHeaderRows ?? []),
      ...splitProjection.repeatedTableHeaderRows,
    ],
    repeatedTableHeaderBoxes: [
      ...(page.repeatedTableHeaderBoxes ?? []),
      ...splitProjection.repeatedTableHeaderBoxes,
    ],
  };
  if (resultRows.length + repeated.repeatedTableHeaderRows.length > maxRows)
    return fail('InlineGroupLayoutLimit');
  const collisions = sourceInlineTableCollisionFootprints(
    sourceTables,
    { ...page, ...repeated, boxes, tableCaptionBounds },
    content,
  );
  return {
    ...page,
    ...collisions,
    ...repeated,
    pages: page.pages.map((p) => ({ ...p, section: setting.section_ordinal })),
    rows: resultRows,
    boxes,
    placedContainers,
    placedDrawings,
    tableCaptionBounds,
    flowPictures: [...flowPictures, ...layered.pictures],
    placedCurves: curves.placedCurves,
    ...curveLayoutDiagnostics(page, curves.warnings),
    spatialRows: true,
    pageLayoutMode: page.createdTablesPaginated
      ? 'measured-inline-group-created-body'
      : 'measured-inline-group-body',
  };
}
