import { drawingColumnContext } from "./drawing-column-context.mjs";
import { drawingRootSource, projectDrawingTextPage } from "./drawing-text-page-projection.mjs";
import { textMeasurement } from "./text-measurement.mjs";
import { drawingPagePolicyError } from "./drawing-page-policy.mjs";
import { drawingPagePlacementOptions } from "./drawing-placement.mjs";
import { signedInt32 } from "./signed-int32.mjs";
import { affineBox } from "./affine-point-geometry.mjs";
import { rowLeft } from "./row-geometry.mjs";
import { drawingFillPlan } from "./drawing-fill-plan.mjs";
import { projectGroupedPicturePage } from "./grouped-picture-page-projection.mjs";
import { pageParagraphCoverage } from "./page-paragraph-coverage.mjs";
import { objectOnlyTableHostKeys } from "./object-only-table-hosts.mjs";
import { projectRootPicturePage } from "./root-picture-page-projection.mjs";
import { drawingCollisionInventory } from "./drawing-collision-inventory.mjs";
import { restrictDrawingLayout } from "./drawing-restricted-layout.mjs";
import { drawingCellCollisionScope } from "./drawing-cell-collision-scope.mjs";
import { tableAnchorCoverage } from "./table-anchor-coverage.mjs";
import { drawingCellHeightRequest } from "./drawing-cell-height-request.mjs";
import { layoutWithCellHeightRetries } from "./cell-height-layout-retry.mjs";
import { layoutDrawingWrapBody } from "./drawing-wrap-body-flow.mjs";
import { drawingPictureScope } from "./drawing-picture-scope.mjs";
import { pictureTextMeasure } from "./picture-text-measurement.mjs";
import { resolveDrawingWrapReservations } from "./drawing-wrap-reservations.mjs";
import { withInlineDrawingCollisionSources } from "./inline-drawing-collision-sources.mjs";
import {retainedGroupDrawingOwnership} from "./retained-group-drawing-ownership.mjs";
import {drawingNeedsCollision} from "./drawing-collision-policy.mjs";

// 본문 페이지 계산은 기존 경로에 위임하고 도형 내부 목록은 별도로 조판합니다.
export function layoutDrawingBodyContent(content, measure, maxRows, layoutBody, {retainedDrawings=[],retainedContainers=[]}={}) {
  return layoutWithCellHeightRetries(minimumCellHeight => layoutDrawingBodyAttempt(content, measure, maxRows,
    (body, bodyMeasure, budget, flowOptions) => layoutBody(body, bodyMeasure, budget, { minimumCellHeight, ...flowOptions }),retainedDrawings,retainedContainers));
}

function layoutDrawingBodyAttempt(content, measure, maxRows, layoutBody, retainedDrawings,retainedContainers) {
  const unavailable = error => ({ state: "unavailable", error });
  const retained=retainedGroupDrawingOwnership(content,retainedDrawings,retainedContainers);
  if(retained.state!=="selected")return retained;
  const {owners:retainedOwners,anchors:retainedAnchors}=retained;
  const retainedText=p=>retainedOwners.has(`${p.section}:${p.drawingText?.drawingNode}`);
  const retainedCaption=p=>retainedOwners.has(`${p.section}:${p.drawingCaption?.drawingNode}`);
  if (content.pictures?.some(p => !p.owner) || content.pageSettings?.length !== 1) return unavailable("UnsupportedDrawingPageObjects");
  if (content.drawingTextBindingErrors?.length || content.drawingTextSnapshotErrors?.length) return unavailable("AmbiguousDrawingPageContent");
  const roots = new Map();
  for (const drawing of content.drawings) {
    const root = drawingRootSource(drawing, content.containers);
    if (root.state !== "selected") return root;
    if (signedInt32(root.source.flow?.z_order) === null) return unavailable("MissingDrawingPaintOrder");
    roots.set(drawing, root);
  }
  const drawings = content.drawings.toSorted((a, b) => signedInt32(roots.get(a).source.flow.z_order) - signedInt32(roots.get(b).source.flow.z_order));
  const ids = new Set();
  for (const drawing of drawings) {
    const key = `${drawing.section}:${drawing.drawingNode}`;
    if (ids.has(key)) return unavailable("AmbiguousDrawingPageContent");
    ids.add(key);
    const source = drawing.source;
    const fill = drawingFillPlan(content, drawing);
    if (fill.state === "unavailable") return fill;
    const root = roots.get(drawing);
    const placementSource = root.source;
    const policyReason = drawingPagePolicyError(source, placementSource, root.grouped, fill.state, true, true);
    if (policyReason) return { ...unavailable("UnsupportedDrawingPagePolicy"), section: drawing.section, drawingNode: drawing.drawingNode, policyReason };
  }
  const bodyParagraphs = content.paragraphs.filter(p => (!p.drawingText||retainedText(p)) && (!p.drawingCaption||retainedCaption(p)));
  const pictureScope = drawingPictureScope(content, bodyParagraphs, {retainedAnchors});
  if (pictureScope.state !== "scoped") return pictureScope;
  const { bodyPictures } = pictureScope;
  const localMeasure = pictureTextMeasure(pictureScope.inlineIndex, [], measure);
  const bodyPictureIds = new Set(bodyPictures.map(picture => `${picture.section}:${picture.pictureNode}`));
  const pictureIds = new Set((content.pictures ?? []).filter(p => p.owner.anchorNode === p.pictureNode).map(p => `${p.section}:${p.pictureNode}`));
  if (pictureIds.size !== (content.pictures ?? []).filter(p => p.owner.anchorNode === p.pictureNode).length) return unavailable("AmbiguousDrawingPageContent");
  if ([...pictureIds].some(key => ids.has(key))) return unavailable("AmbiguousDrawingPageContent");
  if (content.paragraphs.some(p => p.drawingText && !retainedText(p) && !ids.has(`${p.section}:${p.drawingText.drawingNode}`)
    || p.drawingCaption && !retainedCaption(p) && !ids.has(`${p.section}:${p.drawingCaption.drawingNode}`) && !pictureIds.has(`${p.section}:${p.drawingCaption.drawingNode}`))) return unavailable("AmbiguousDrawingPageContent");
  const bodySourceParagraphs = content.paragraphs.filter(p => (!p.drawingText||retainedText(p)) && (!p.drawingCaption||retainedCaption(p)
    || bodyPictureIds.has(`${p.section}:${p.drawingCaption.drawingNode}`)));
  const bodyIds = new Set(bodySourceParagraphs.map(p => `${p.section}:${p.paragraph}`));
  const bodyMeasure = (text, paragraph, unit, kind) => kind === "text" && (drawings.some(d => d.section === paragraph.section && d.hostParagraph === paragraph.paragraph && d.anchorUnit === unit)
    || (content.pictures ?? []).some(p => !bodyPictureIds.has(`${p.section}:${p.pictureNode}`) && p.owner.anchorNode === p.pictureNode && p.section === paragraph.section && p.paragraph === paragraph.paragraph && p.anchorUnit === unit)) ? { width: 0, height: textMeasurement(measure("", paragraph, unit, kind)).height } : measure(text, paragraph, unit, kind);
  const flowAnchors = new Map();
  for (const drawing of drawings) {
    const root = roots.get(drawing);
    const node = root.grouped ? drawing.source.group_context.root_anchor : drawing.drawingNode;
    const key = `${drawing.section}:${node}`;
    const previous = flowAnchors.get(key);
    if (previous && (previous.paragraph !== drawing.hostParagraph || previous.anchorUnit !== drawing.anchorUnit)) return unavailable("AmbiguousDrawingFlowAnchor");
    flowAnchors.set(key, { section: drawing.section, paragraph: drawing.hostParagraph, anchorUnit: drawing.anchorUnit, node });
  }
  const cellDrawings = drawings.filter(d => bodySourceParagraphs.some(p => p.section === d.section && p.paragraph === d.hostParagraph && p.tableCell));
  const bodyDrawings = drawings.filter(d => !cellDrawings.includes(d));
  const bodyContent = { ...content, cellFloatingDrawingSources: cellDrawings.filter(d => [0, 1].includes(d.source.flow.text_wrap)), floatingDrawingAnchors: [...(content.floatingDrawingAnchors ?? []), ...flowAnchors.values()], drawings: retainedDrawings, pictures: bodyPictures, paragraphs: bodySourceParagraphs, paragraphFlows: content.paragraphFlows.filter(f => bodyIds.has(`${f.section}:${f.paragraph}`)) };
  const body = layoutDrawingWrapBody(bodyDrawings, bodyParagraphs, options => layoutBody(bodyContent, bodyMeasure, maxRows, options), {
    measure: bodyMeasure,
    resolveReservations: layout => resolveDrawingWrapReservations(bodyDrawings, bodyParagraphs, layout, content),
  });
  if (body.state !== "paginated") return { ...body, layoutStage: "drawing-body" };
  if (body.limited) return unavailable("DrawingPageLayoutLimit");
  for (const drawing of bodyContent.cellFloatingDrawingSources) if (body.cellFloatingDrawingReservations?.filter(r => r.section === drawing.section && r.drawingNode === drawing.drawingNode).length !== 1)
    return { ...unavailable("MissingCellFloatingDrawingReservation"), section: drawing.section, drawingNode: drawing.drawingNode };
  const pictureRows = [], flowPictures = [];
  for (const picture of content.pictures ?? []) {
    if (bodyPictureIds.has(`${picture.section}:${picture.pictureNode}`) || pictureScope.localIds.has(`${picture.section}:${picture.pictureNode}`)) continue;
    if (picture.owner.anchorNode === picture.pictureNode) {
      const placed = projectRootPicturePage(picture, content.paragraphs, body.rows, localMeasure, { maxRows: maxRows - body.rows.length - pictureRows.length });
      if (placed.state !== "placed") return { ...placed, layoutStage: "root-picture", section: picture.section, paragraph: picture.paragraph, pictureNode: picture.pictureNode };
      pictureRows.push(...placed.rows);
      flowPictures.push({ section: picture.section, pictureNode: picture.pictureNode, paragraph: picture.paragraph,
        anchorUnit: picture.anchorUnit, pageOrdinal: placed.pageOrdinal, rectangle: placed.rectangle, flow: picture.flow });
      continue;
    }
    const placed = projectGroupedPicturePage(picture, content.containers, content.paragraphs, body.rows);
    if (placed.state !== "placed") return placed;
    if (![2, 3].includes(placed.flow.text_wrap)) return unavailable("UnsupportedGroupedPictureFlow");
  }
  const rows = [...body.rows, ...pictureRows], placedDrawings = [], preparedDrawings = [];
  for (const drawing of drawings) {
    const columns = drawingColumnContext(drawing, content.paragraphs, content.paragraphFlows);
    if (columns.state !== "selected") return columns;
    const remaining = maxRows - rows.length;
    if (remaining < 1) return unavailable("DrawingPageLayoutLimit");
    const root = roots.get(drawing);
    // 미리보기 정책: 그룹도 저장된 도형 크기를 바꾸지 않고 넘친 텍스트를 표시합니다.
    const overflow = root.source.geometry?.treat_as_character === false ? "extend-last-column" : "reject";
    const result = projectDrawingTextPage(drawing, content.containers, content.paragraphs, columns.declaration, body.rows, localMeasure, { ...drawingPagePlacementOptions, maxRows: remaining, overflow });
    if (result.state !== "placed") return { ...result, layoutStage: "drawing-text", section: drawing.section, paragraph: drawing.hostParagraph, drawingNode: drawing.drawingNode };
    preparedDrawings.push({ drawing, result });
    rows.push(...result.rows.map(row => result.overflowed === true ? { ...row, drawingTextOverflow: "extend-last-column" } : row));
    placedDrawings.push({ section: drawing.section, drawingNode: drawing.drawingNode, hostParagraph: drawing.hostParagraph, anchorUnit: drawing.anchorUnit, rectangle: result.rectangle, pageOrdinal: result.pageOrdinal, fill: drawingFillPlan(content, drawing) });
  }
  if (preparedDrawings.some(item => drawingNeedsCollision(item.drawing.source))) {
    const collisionContent = withInlineDrawingCollisionSources({...content,drawings:[...content.drawings,...retainedDrawings]}, body);
    const inventory = drawingCollisionInventory(collisionContent, { ...body, rows, placedDrawings: [...(body.placedDrawings ?? []), ...placedDrawings], flowPictures: [...(body.flowPictures ?? []), ...flowPictures] });
    if (inventory.state !== "collected") return inventory;
    for (const [index, item] of preparedDrawings.entries()) {
      if (!drawingNeedsCollision(item.drawing.source)) continue;
      const page = body.pages.find(page => page.ordinal === item.result.pageOrdinal && page.section === item.drawing.section);
      if (!page) return unavailable("IncompleteRestrictedDrawingLayout");
      const scope = drawingCellCollisionScope(item.drawing, collisionContent, { ...body, rows, placedDrawings: [...(body.placedDrawings ?? []), ...placedDrawings] }, inventory);
      if (scope.state !== "scoped") return scope;
      const restricted = restrictDrawingLayout(item.drawing, item.result, scope.inventory, scope.body);
      if (restricted.state !== "placed") {
        const request = drawingCellHeightRequest(scope, restricted);
        return { ...restricted, layoutStage: "drawing-restriction", section: item.drawing.section,
          paragraph: item.drawing.hostParagraph, drawingNode: item.drawing.drawingNode,
          ...(request.state === "requested" ? { cellHeightRequest: request } : {}) };
      }
      item.result = restricted;
      placedDrawings[index] = { ...placedDrawings[index], rectangle: restricted.rectangle };
      const own = inventory.footprints.find(f => f.kind === "drawing" && f.section === item.drawing.section && f.node === item.drawing.drawingNode);
      own.rectangle = restricted.collisionFootprint;
    }
    rows.length = 0;
    for (const row of [...body.rows, ...pictureRows]) rows.push(row);
    for (const item of preparedDrawings) for (const row of item.result.rows) rows.push(item.result.overflowed === true ? { ...row, drawingTextOverflow: "extend-last-column" } : row);
  }
  const bottoms = [];
  for (const reserved of body.drawingWrapReservations ?? []) {
    const placed = placedDrawings.filter(d => d.section === reserved.section && d.drawingNode === reserved.drawingNode);
    if (placed.length !== 1 || placed[0].pageOrdinal !== reserved.pageOrdinal
      || ["x", "y", "width", "height"].some(key => Math.abs(placed[0].rectangle[key] - reserved.rectangle[key]) > 1e-8))
      return unavailable("UnresolvedDrawingWrapPlacement");
  }
  for (const row of rows) {
    const bounds = row.transform === undefined ? row : affineBox(row.transform, { x: rowLeft(row), y: row.y, width: row.width, height: row.height });
    if (!bounds || !Number.isFinite(bounds.y + bounds.height)) return unavailable("InvalidDrawingTextTransform");
    bottoms.push(bounds.y + bounds.height);
  }
  const coverageContent = withInlineDrawingCollisionSources(content, body);
  const objectOnlyTableHosts = objectOnlyTableHostKeys(coverageContent, body);
  const coverageOwners = coverageContent.paragraphs.filter(p => !objectOnlyTableHosts.has(`${p.section}:${p.paragraph}`));
  const anchors = tableAnchorCoverage(coverageContent, { ...body, rows });
  if (anchors.state !== "covered") return anchors;
  const coverageRows = [...rows, ...anchors.rows.filter(row => !objectOnlyTableHosts.has(`${row.section}:${row.paragraph}`))];
  const coverage = pageParagraphCoverage(coverageOwners, coverageRows);
  if (coverage.state !== "complete") {
    const grouped = new Map();
    for (const row of coverageRows) {
      const key = `${row.section}:${row.paragraph}`, group = grouped.get(key) ?? [];
      group.push(row); grouped.set(key, group);
    }
    const coverageFailures = [];
    for (const owner of coverageOwners) {
      const members = grouped.get(`${owner.section}:${owner.paragraph}`) ?? [];
      if (pageParagraphCoverage([owner], members).state !== "complete") coverageFailures.push({ section: owner.section, paragraph: owner.paragraph,
        length: owner.text.length, intervals: members.filter(row => row.kind === "text").map(row => [row.startUnit, row.endUnit]) });
    }
    return { ...coverage, layoutStage: "drawing-coverage", coverageFailures };
  }
  return { ...body, rows, placedDrawings: [...(body.placedDrawings ?? []), ...placedDrawings], flowPictures: [...(body.flowPictures ?? []), ...flowPictures], spatialRows: true, height: Math.max(body.height, ...bottoms), pageLayoutMode: "measured-drawing-body" };
}
