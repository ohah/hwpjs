import { drawingColumnContext } from './drawing-column-context.mjs';
import { projectDrawingTextPage } from './drawing-text-page-projection.mjs';
import { drawingFillPlan } from './drawing-fill-plan.mjs';
import { drawingPagePolicyError } from './drawing-page-policy.mjs';
import { drawingPagePlacementOptions } from './drawing-placement.mjs';
import { restrictDrawingLayout } from './drawing-restricted-layout.mjs';
import { pageParagraphCoverage } from './page-paragraph-coverage.mjs';
import { selectMasterPages } from './master-page-selection.mjs';
import { hwpUnitPixels } from './hwp-units.mjs';
import { inlinePictureIndex, picturePositionKey } from './picture-inline.mjs';
const sameBox = (a, b) =>
  a && b && ['x', 'y', 'width', 'height'].every((field) => a[field] === b[field]);

/** Complete one explicit area instance without borrowing the body COLUMN box. */
export function projectPageAreaDrawings(content, area, tables, page, measure, maxRows = 20000) {
  const fail = (error) => ({ state: 'unavailable', error });
  if (
    tables?.state !== 'tables-projected' ||
    !Number.isSafeInteger(maxRows) ||
    maxRows < 1 ||
    !Number.isSafeInteger(page?.ordinal) ||
    page.ordinal < 0 ||
    !Number.isInteger(page.number) ||
    page.number < 1 ||
    page.number > 0xffffffff ||
    ![
      tables.rows,
      tables.anchorRows,
      tables.boxes,
      tables.flowPictures,
      tables.tableAnchors,
      tables.overflow,
      area?.drawings,
    ].every(Array.isArray)
  )
    return fail('InvalidPageAreaDrawingProjection');
  try {
    if (!selectMasterPages(area.area, [page]).length) {
      if (
        [
          tables.rows,
          tables.anchorRows,
          tables.boxes,
          tables.flowPictures,
          tables.tableAnchors,
          tables.overflow,
        ].some((rows) => rows.length)
      )
        return fail('ConflictingPageAreaSelection');
      return { ...tables, state: 'objects-projected', rows: [], placedDrawings: [] };
    }
    const hosts = [...tables.anchorRows, ...tables.rows],
      prepared = [];
    if (
      hosts.some(
        (row) =>
          row.section !== area.section ||
          row.pageOrdinal !== page.ordinal ||
          row.pageArea !== area.host ||
          !sameBox(row.referenceBoxes?.paper, page.paper) ||
          !sameBox(row.referenceBoxes?.page, page.page),
      ) ||
      tables.boxes.some(
        (box) =>
          box.section !== area.section ||
          box.pageOrdinal !== page.ordinal ||
          box.pageArea !== area.host,
      )
    )
      return fail('ConflictingPageAreaInstance');
    for (const drawing of area.drawings) {
      const fill = drawingFillPlan(content, drawing);
      if (fill.state === 'unavailable') return fill;
      const policy = drawingPagePolicyError(
        drawing.source,
        drawing.source,
        false,
        fill.state,
        true,
      );
      if (policy) return fail(policy);
      if (drawing.source.group_context !== null || drawing.source.caption !== null)
        return fail('UnsupportedPageAreaDrawingOwner');
      const columns = drawingColumnContext(drawing, area.paragraphs, area.paragraphFlows);
      if (columns.state !== 'selected') return columns;
      const result = projectDrawingTextPage(
        drawing,
        [],
        area.paragraphs,
        columns.declaration,
        hosts,
        measure,
        { ...drawingPagePlacementOptions, maxRows: maxRows - hosts.length, overflow: 'reject' },
      );
      if (result.state !== 'placed')
        return {
          ...result,
          layoutStage: 'page-area-drawing-text',
          section: drawing.section,
          paragraph: drawing.hostParagraph,
          drawingNode: drawing.drawingNode,
          pageOrdinal: page.ordinal,
        };
      const host = hosts.find(
        (row) =>
          row.kind === 'text' &&
          row.section === drawing.section &&
          row.paragraph === drawing.hostParagraph &&
          row.startUnit <= drawing.anchorUnit &&
          drawing.anchorUnit < row.endUnit,
      );
      const margins = drawing.source.flow?.outside_margins;
      if (
        !host?.referenceBoxes?.column ||
        !Array.isArray(margins) ||
        margins.length !== 4 ||
        !margins.every((v) => Number.isInteger(v) && v >= 0 && v <= 0xffffffff)
      )
        return fail('MissingPageAreaDrawingReference');
      const [left, right, top, bottom] = margins.map(hwpUnitPixels),
        r = result.rectangle;
      prepared.push({
        drawing,
        fill,
        result,
        host,
        footprint: {
          section: drawing.section,
          node: drawing.drawingNode,
          kind: 'drawing',
          pageOrdinal: page.ordinal,
          rectangle: {
            x: r.x - left,
            y: r.y - top,
            width: r.width + left + right,
            height: r.height + top + bottom,
          },
        },
      });
    }
    const rows = [...hosts],
      placedDrawings = [];
    for (const item of prepared) {
      const siblings = prepared.filter(
        (other) =>
          other.host.tableNode === item.host.tableNode &&
          other.host.listNode === item.host.listNode,
      );
      const inventory = {
        state: 'collected',
        footprints: siblings.map((other) => other.footprint),
      };
      const result =
        item.drawing.source.position.flags[1] === true
          ? restrictDrawingLayout(
              item.drawing,
              item.result,
              inventory,
              item.host.referenceBoxes.column,
            )
          : item.result;
      if (result.state !== 'placed')
        return {
          ...result,
          layoutStage: 'page-area-drawing-restriction',
          section: item.drawing.section,
          paragraph: item.drawing.hostParagraph,
          drawingNode: item.drawing.drawingNode,
          pageOrdinal: page.ordinal,
        };
      if (result.collisionFootprint) item.footprint.rectangle = result.collisionFootprint;
      rows.push(
        ...result.rows.map((row) => ({ ...row, pageArea: area.host, pageNumber: page.number })),
      );
      placedDrawings.push({
        section: item.drawing.section,
        drawingNode: item.drawing.drawingNode,
        hostParagraph: item.drawing.hostParagraph,
        anchorUnit: item.drawing.anchorUnit,
        rectangle: result.rectangle,
        pageOrdinal: page.ordinal,
        pageArea: area.host,
        fill: item.fill,
      });
      if (rows.length > maxRows) return fail('PageAreaDrawingProjectionLimit');
    }
    const coverage = pageParagraphCoverage(area.paragraphs, rows);
    if (coverage.state !== 'complete') return coverage;
    const pictures = inlinePictureIndex(area);
    for (const picture of area.pictures ?? []) {
      const hosts = rows.filter(
        (row) =>
          row.kind === 'text' &&
          row.section === picture.section &&
          row.paragraph === picture.paragraph &&
          row.startUnit <= picture.anchorUnit &&
          picture.anchorUnit < row.endUnit,
      );
      const placed =
        picture.geometry?.treatAsCharacter === true
          ? pictures.get(picturePositionKey(picture.section, picture.paragraph, picture.anchorUnit))
          : tables.flowPictures.filter(
              (item) =>
                item.section === picture.section && item.pictureNode === picture.pictureNode,
            ).length === 1;
      if (!placed || hosts.length !== 1)
        return {
          ...fail('IncompletePageAreaPictures'),
          section: picture.section,
          pictureNode: picture.pictureNode,
          paragraph: picture.paragraph,
          pageOrdinal: page.ordinal,
        };
    }
    return { ...tables, state: 'objects-projected', rows, placedDrawings };
  } catch (error) {
    return fail(error.message);
  }
}
