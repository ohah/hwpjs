import { drawingColumnContext } from "./drawing-column-context.mjs";
import { drawingRootSource, projectDrawingTextPage } from "./drawing-text-page-projection.mjs";
import { textMeasurement } from "./text-measurement.mjs";
import { drawingAxisGeometry } from "./drawing-axis-geometry.mjs";
import { drawingRotatedGeometry } from "./drawing-rotated-geometry.mjs";
import { drawingPagePlacementOptions } from "./drawing-placement.mjs";
import { signedInt32 } from "./signed-int32.mjs";
import { affineBox } from "./affine-point-geometry.mjs";
import { rowLeft } from "./row-geometry.mjs";
import { drawingFillPlan } from "./drawing-fill-plan.mjs";
import { projectGroupedPicturePage } from "./grouped-picture-page-projection.mjs";
import { drawingScaledGeometry } from "./drawing-scaled-geometry.mjs";
import { pageParagraphCoverage } from "./page-paragraph-coverage.mjs";
import { objectOnlyTableHostKeys } from "./object-only-table-hosts.mjs";
import { projectRootPicturePage } from "./root-picture-page-projection.mjs";
import { drawingPictureScope } from "./drawing-picture-scope.mjs";
import { pictureTextMeasure } from "./picture-text-measurement.mjs";

// 본문 페이지 계산은 기존 경로에 위임하고 도형 내부 목록은 별도로 조판합니다.
export function layoutDrawingBodyContent(content, measure, maxRows, layoutBody) {
  const unavailable = error => ({ state: "unavailable", error });
  if (content.pictures?.some(p => !p.owner) || content.lines?.length || content.pageSettings?.length !== 1) return unavailable("UnsupportedDrawingPageObjects");
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
    if ((!root.grouped && (!(drawingAxisGeometry(source) || drawingRotatedGeometry(source) || drawingScaledGeometry(source)) || fill.state !== "none" && !drawingAxisGeometry(source))) || source.paint?.shadow_type !== 0 || placementSource.flow?.text_wrap !== 3 || placementSource.position?.flags?.[1] !== false || placementSource.position?.flags?.[2] !== true) return unavailable("UnsupportedDrawingPagePolicy");
  }
  const bodyParagraphs = content.paragraphs.filter(p => !p.drawingText && !p.drawingCaption);
  const pictureScope = drawingPictureScope(content, bodyParagraphs);
  if (pictureScope.state !== "scoped") return pictureScope;
  const localMeasure = pictureTextMeasure(pictureScope.inlineIndex, [], measure);
  const pictureIds = new Set((content.pictures ?? []).filter(p => p.owner.anchorNode === p.pictureNode).map(p => `${p.section}:${p.pictureNode}`));
  if (pictureIds.size !== (content.pictures ?? []).filter(p => p.owner.anchorNode === p.pictureNode).length) return unavailable("AmbiguousDrawingPageContent");
  if ([...pictureIds].some(key => ids.has(key))) return unavailable("AmbiguousDrawingPageContent");
  if (content.paragraphs.some(p => p.drawingText && !ids.has(`${p.section}:${p.drawingText.drawingNode}`)
    || p.drawingCaption && !ids.has(`${p.section}:${p.drawingCaption.drawingNode}`) && !pictureIds.has(`${p.section}:${p.drawingCaption.drawingNode}`))) return unavailable("AmbiguousDrawingPageContent");
  const bodyIds = new Set(bodyParagraphs.map(p => `${p.section}:${p.paragraph}`));
  const bodyMeasure = (text, paragraph, unit, kind) => kind === "text" && (drawings.some(d => d.section === paragraph.section && d.hostParagraph === paragraph.paragraph && d.anchorUnit === unit)
    || (content.pictures ?? []).some(p => p.owner.anchorNode === p.pictureNode && p.section === paragraph.section && p.paragraph === paragraph.paragraph && p.anchorUnit === unit)) ? { width: 0, height: textMeasurement(measure("", paragraph, unit, kind)).height } : measure(text, paragraph, unit, kind);
  const flowAnchors = new Map();
  for (const drawing of drawings) {
    const root = roots.get(drawing);
    const node = root.grouped ? drawing.source.group_context.root_anchor : drawing.drawingNode;
    const key = `${drawing.section}:${node}`;
    const previous = flowAnchors.get(key);
    if (previous && (previous.paragraph !== drawing.hostParagraph || previous.anchorUnit !== drawing.anchorUnit)) return unavailable("AmbiguousDrawingFlowAnchor");
    flowAnchors.set(key, { section: drawing.section, paragraph: drawing.hostParagraph, anchorUnit: drawing.anchorUnit, node });
  }
  const body = layoutBody({ ...content, floatingDrawingAnchors: [...flowAnchors.values()], drawings: [], pictures: [], paragraphs: bodyParagraphs, paragraphFlows: content.paragraphFlows.filter(f => bodyIds.has(`${f.section}:${f.paragraph}`)) }, bodyMeasure, maxRows);
  if (body.state !== "paginated") return body;
  if (body.limited) return unavailable("DrawingPageLayoutLimit");
  const pictureRows = [], flowPictures = [];
  for (const picture of content.pictures ?? []) {
    if (pictureScope.localIds.has(`${picture.section}:${picture.pictureNode}`)) continue;
    if (picture.owner.anchorNode === picture.pictureNode) {
      const placed = projectRootPicturePage(picture, content.paragraphs, body.rows, localMeasure, { maxRows: maxRows - body.rows.length - pictureRows.length });
      if (placed.state !== "placed") return placed;
      pictureRows.push(...placed.rows);
      flowPictures.push({ section: picture.section, pictureNode: picture.pictureNode, paragraph: picture.paragraph,
        anchorUnit: picture.anchorUnit, pageOrdinal: placed.pageOrdinal, rectangle: placed.rectangle, flow: picture.flow });
      continue;
    }
    const placed = projectGroupedPicturePage(picture, content.containers, content.paragraphs, body.rows);
    if (placed.state !== "placed") return placed;
    if (![2, 3].includes(placed.flow.text_wrap)) return unavailable("UnsupportedGroupedPictureFlow");
  }
  const rows = [...body.rows, ...pictureRows], placedDrawings = [];
  for (const drawing of drawings) {
    const columns = drawingColumnContext(drawing, content.paragraphs, content.paragraphFlows);
    if (columns.state !== "selected") return columns;
    const remaining = maxRows - rows.length;
    if (remaining < 1) return unavailable("DrawingPageLayoutLimit");
    const root = roots.get(drawing);
    // 미리보기 정책: 그룹도 저장된 도형 크기를 바꾸지 않고 넘친 텍스트를 표시합니다.
    const overflow = root.source.geometry?.treat_as_character === false ? "extend-last-column" : "reject";
    const result = projectDrawingTextPage(drawing, content.containers, content.paragraphs, columns.declaration, body.rows, localMeasure, { ...drawingPagePlacementOptions, maxRows: remaining, overflow });
    if (result.state !== "placed") return result;
    rows.push(...result.rows.map(row => result.overflowed === true ? { ...row, drawingTextOverflow: "extend-last-column" } : row));
    placedDrawings.push({ section: drawing.section, drawingNode: drawing.drawingNode, hostParagraph: drawing.hostParagraph, anchorUnit: drawing.anchorUnit, rectangle: result.rectangle, pageOrdinal: result.pageOrdinal, fill: drawingFillPlan(content, drawing) });
  }
  const bottoms = [];
  for (const row of rows) {
    const bounds = row.transform === undefined ? row : affineBox(row.transform, { x: rowLeft(row), y: row.y, width: row.width, height: row.height });
    if (!bounds || !Number.isFinite(bounds.y + bounds.height)) return unavailable("InvalidDrawingTextTransform");
    bottoms.push(bounds.y + bounds.height);
  }
  const objectOnlyTableHosts = objectOnlyTableHostKeys(content, body);
  const coverage = pageParagraphCoverage(content.paragraphs.filter(p => !objectOnlyTableHosts.has(`${p.section}:${p.paragraph}`)), rows);
  if (coverage.state !== "complete") return coverage;
  return { ...body, rows, placedDrawings, flowPictures: [...(body.flowPictures ?? []), ...flowPictures], spatialRows: true, height: Math.max(body.height, ...bottoms), pageLayoutMode: "measured-drawing-body" };
}
