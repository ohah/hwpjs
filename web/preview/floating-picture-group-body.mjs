import { groupShapeChildren } from './group-shape-children.mjs';
import { groupCaptionParagraphKeys } from './inline-group-caption-projection.mjs';
import { layoutDrawingWrapBody } from './drawing-wrap-body-flow.mjs';
import { drawingPageReference } from './drawing-page-reference.mjs';
import { placeGroupedRoot } from './grouped-root-placement.mjs';
import { projectGroupedPicturePage } from './grouped-picture-page-projection.mjs';
import { projectFloatingGroupCaption } from './floating-group-caption-projection.mjs';
import { groupRootCollisionFootprint } from './group-root-collision-footprint.mjs';
import { pageParagraphCoverage } from './page-paragraph-coverage.mjs';
import { textMeasurement } from './text-measurement.mjs';
import { inlinePictureIndex } from './picture-inline.mjs';
import { pictureTextMeasure } from './picture-text-measurement.mjs';
import { tableAnchorCoverage } from './table-anchor-coverage.mjs';
import { pictureVisualBounds } from './picture-visual-bounds.mjs';
import { pictureFramePaperFit } from './picture-caption-page-fit.mjs';

// Root reservations include pictures and captions; body pagination stays shared.
export function layoutFloatingPictureGroupBody(content, measure, maxRows, layoutBody) {
  const fail = (error) => ({ state: 'unavailable', error });
  if (
    typeof measure !== 'function' ||
    typeof layoutBody !== 'function' ||
    !Number.isSafeInteger(maxRows) ||
    maxRows < 1
  )
    return fail('InvalidFloatingPictureGroupBudget');
  const roots = content.containers ?? [],
    key = (section, node) => `${section}:${node}`;
  if (
    !roots.length ||
    content.pageSettings?.length !== 1 ||
    content.limited ||
    content.window ||
    content.drawings?.length ||
    roots.some(
      (root) =>
        root.source?.group_context !== null ||
        root.source.geometry?.treat_as_character !== false ||
        ![0, 1].includes(root.source.flow?.text_wrap),
    )
  )
    return fail('UnsupportedFloatingPictureGroups');
  const captionKeys = groupCaptionParagraphKeys(roots, content.paragraphs);
  if (!captionKeys) return fail('IncompleteFloatingGroupCaptionOwnership');
  const childIds = new Set(),
    rootIds = new Set(),
    anchors = [];
  for (const root of roots) {
    const id = key(root.section, root.containerNode);
    const hosts = content.paragraphs.filter(
      (p) => p.section === root.section && p.paragraph === root.hostParagraph,
    );
    if (
      rootIds.has(id) ||
      hosts.length !== 1 ||
      hosts[0].tableCell ||
      hosts[0].drawingText ||
      hosts[0].drawingCaption ||
      hosts[0].text[root.anchorUnit] !== '\ufffc'
    )
      return fail('InvalidFloatingPictureGroupHost');
    rootIds.add(id);
    let children;
    try {
      children = groupShapeChildren(root.source, { allowCaptions: true }).filter(
        (c) => !['metadata', 'caption'].includes(c.kind),
      );
    } catch (error) {
      return fail(error.message);
    }
    if (!children.length || children.some((c) => c.kind !== 'picture'))
      return fail('UnsupportedFloatingPictureGroupChildren');
    for (const child of children) {
      const pictures = (content.pictures ?? []).filter(
        (p) =>
          p.section === root.section &&
          p.pictureNode === child.node &&
          p.owner?.anchorNode === root.containerNode,
      );
      const childId = key(root.section, child.node);
      if (pictures.length !== 1 || childIds.has(childId))
        return fail('AmbiguousFloatingPictureGroupChildren');
      childIds.add(childId);
    }
    anchors.push({
      section: root.section,
      paragraph: root.hostParagraph,
      anchorUnit: root.anchorUnit,
      node: root.containerNode,
    });
  }
  if (
    (content.pictures ?? []).some(
      (p) => p.owner?.anchorNode !== p.pictureNode && !childIds.has(key(p.section, p.pictureNode)),
    )
  )
    return fail('IncompleteFloatingPictureGroupChildren');
  const paragraphs = content.paragraphs.filter(
    (p) => !captionKeys.has(key(p.section, p.paragraph)),
  );
  const paragraphIds = new Set(paragraphs.map((p) => key(p.section, p.paragraph)));
  const view = {
    ...content,
    containers: [],
    paragraphs,
    paragraphFlows: (content.paragraphFlows ?? []).filter((p) =>
      paragraphIds.has(key(p.section, p.paragraph)),
    ),
    pictures: (content.pictures ?? []).filter((p) => !childIds.has(key(p.section, p.pictureNode))),
    floatingDrawingAnchors: [...(content.floatingDrawingAnchors ?? []), ...anchors],
  };
  if (view.pictures.some((p) => p.geometry?.treatAsCharacter !== true || p.caption != null))
    return fail('UnsupportedFloatingGroupBodyPictures');
  const pictureIndex = inlinePictureIndex(view);
  if (pictureIndex.size !== view.pictures.length || [...pictureIndex.values()].some((p) => !p))
    return fail('AmbiguousFloatingGroupBodyPictures');
  const sourceMeasure = pictureTextMeasure(pictureIndex, [], measure);
  const bodyMeasure = (text, p, unit, kind) =>
    kind === 'text' &&
    anchors.some(
      (a) => a.section === p.section && a.paragraph === p.paragraph && a.anchorUnit === unit,
    )
      ? { width: 0, height: textMeasurement(measure('', p, unit, kind)).height }
      : sourceMeasure(text, p, unit, kind);
  const drawings = roots.map((root) => ({
    section: root.section,
    drawingNode: root.containerNode,
    hostParagraph: root.hostParagraph,
    anchorUnit: root.anchorUnit,
    source: root.source,
  }));
  const markRows = (rows) =>
    rows.map((row) => {
      const owners = roots.filter(
        (root) =>
          root.section === row.section &&
          root.hostParagraph === row.paragraph &&
          row.startUnit <= root.anchorUnit &&
          root.anchorUnit < row.endUnit,
      );
      return owners.length === 1 ? { ...row, reservedGroupRoot: owners[0].containerNode } : row;
    });
  const resolve = (layout) => {
    const rows = markRows(layout.rows),
      reservations = [],
      placedContainers = [],
      captionRows = [];
    for (const root of roots) {
      const drawing = drawings.find(
        (d) => d.section === root.section && d.drawingNode === root.containerNode,
      );
      const reference = drawingPageReference(drawing, paragraphs, rows);
      if (reference.state !== 'selected') return reference;
      const placed = placeGroupedRoot(root.source, reference.boxes, reference.host, {
        section: root.section,
        paragraph: root.hostParagraph,
        unit: root.anchorUnit,
      });
      if (placed.state !== 'placed') return placed;
      const placement = {
        section: root.section,
        containerNode: root.containerNode,
        pageOrdinal: reference.host.pageOrdinal,
        columnOrdinal: reference.host.columnOrdinal,
        rectangle: placed.rectangle,
      };
      const caption = projectFloatingGroupCaption(root, placement, content.paragraphs, measure, {
        maxRows,
      });
      if (caption.state !== 'positioned') return caption;
      const members = [];
      for (const picture of content.pictures.filter(
        (p) => p.section === root.section && p.owner?.anchorNode === root.containerNode,
      )) {
        const child = projectGroupedPicturePage(picture, roots, paragraphs, rows);
        if (child.state !== 'placed' || child.paintLayer === null)
          return fail(child.error ?? 'UnsupportedFloatingGroupPicturePaint');
        const rectangle = pictureVisualBounds(picture, child.rectangle);
        if (!rectangle) return fail('UnsupportedFloatingGroupPictureBounds');
        members.push({
          section: root.section,
          node: picture.pictureNode,
          pageOrdinal: child.pageOrdinal,
          rectangle,
        });
      }
      const captions = root.source.has_caption
        ? [
            {
              section: root.section,
              containerNode: root.containerNode,
              captionNode: root.source.caption.caption_node,
              listNode: root.source.caption.list_node,
              pageOrdinal: placement.pageOrdinal,
              rectangle: caption.bounds,
            },
          ]
        : [];
      const footprint = groupRootCollisionFootprint(root, roots, placement, members, captions);
      if (footprint.state !== 'collected') return footprint;
      const pages = layout.pages.filter((page) => page.ordinal === placement.pageOrdinal);
      if (
        pages.length !== 1 ||
        pictureFramePaperFit(footprint.footprint.rectangle, pages[0].paper).state !== 'fits'
      )
        return fail('FloatingGroupPageOverflow');
      reservations.push({
        section: root.section,
        drawingNode: root.containerNode,
        pageOrdinal: placement.pageOrdinal,
        rectangle: footprint.footprint.rectangle,
        flow: {
          textWrap: root.source.flow.text_wrap,
          textFlow: root.source.flow.text_flow,
          outsideMargins: [0, 0, 0, 0],
        },
      });
      placedContainers.push({ ...placement, outerRectangle: footprint.footprint.rectangle });
      captionRows.push(...caption.rows);
    }
    return { state: 'reserved', reservations, placedContainers, captionRows };
  };
  const body = layoutDrawingWrapBody(
    drawings,
    paragraphs,
    (options) => layoutBody(view, bodyMeasure, maxRows, options),
    { measure: bodyMeasure, resolveReservations: resolve },
  );
  if (body.state !== 'paginated' || body.limited) return body;
  const placed = resolve(body);
  if (placed.state !== 'reserved') return placed;
  const rows = [...markRows(body.rows), ...placed.captionRows];
  if (rows.length > maxRows) return fail('FloatingPictureGroupRowLimit');
  const anchorsCoverage = tableAnchorCoverage(content, { ...body, rows });
  if (anchorsCoverage.state !== 'covered') return anchorsCoverage;
  const coverage = pageParagraphCoverage(content.paragraphs, [...rows, ...anchorsCoverage.rows]);
  if (coverage.state !== 'complete') return coverage;
  return {
    ...body,
    rows,
    placedContainers: placed.placedContainers,
    pageLayoutMode: 'floating-picture-groups',
  };
}
