import { intersectPictureLineRegions } from "./picture-line-intersections.mjs";
import { regionTextFragments } from "./region-text-fragments.mjs";
import { TEXT_TOP } from "./row-geometry.mjs";
import { paragraphLineAdvance } from "./paragraph-geometry.mjs";
import { textMeasurement } from "./text-measurement.mjs";
import { inlineObjectLineAdvance } from "./inline-object-line-advance.mjs";
import { usesDocumentFontMetrics } from "./font-layout-policy.mjs";

export function pictureFlowLine(text, unit, line, pictures, measure, paragraphShape = null, lineRegions = intersectPictureLineRegions, { numberPrefix = null, allowFirstOverflow = false } = {}) {
  let height = line.height;
  const documentMetrics=usesDocumentFontMetrics(paragraphShape?.spacingFormat),minimum=documentMetrics?0:20;
  for (let attempt = 0; attempt < 32; attempt++) {
    const regions = lineRegions({ ...line, height }, pictures, { includeNextEvent: true });
    if (regions.state !== "available") return regions;
    const result = regionTextFragments(text, unit, regions.regions, measure, { numberPrefix,minimumTextHeight:minimum,
      hangingRightEdge: line.x + line.width,
      allowFirstOverflow: allowFirstOverflow && regions.regions.length === 1 && regions.regions[0].x === line.x && regions.regions[0].width === line.width });
    const emptyHeight=(documentMetrics&&result.fragments.length===0||text.length>0&&unit===text.length)?Math.max(minimum,textMeasurement(measure("",unit)).height):minimum;
    const textHeight = result.fragments.reduce((value, fragment) => Math.max(value, fragment.textHeight), emptyHeight);
    const inlineSpacing = result.fragments.some(fragment => fragment.spacingBasisHeight !== undefined);
    const basis = result.fragments.reduce((value, fragment) => Math.max(value, fragment.spacingBasisHeight ?? fragment.textHeight), emptyHeight);
    const advance = inlineSpacing ? inlineObjectLineAdvance(paragraphShape, textHeight, basis, Math.max(line.height, basis + TEXT_TOP))
      : paragraphLineAdvance(paragraphShape, textHeight, Math.max(line.height, textHeight + TEXT_TOP));
    const required = Math.max(height, advance);
    if (!Number.isFinite(required) || required <= 0) return { state: "invalid_line_height" };
    if (required === height) return { state: "available", regions: regions.regions, nextY: regions.nextY, ...result,
      fragments: result.fragments.map(fragment => fragment.spacingBasisHeight === undefined ? fragment : { ...fragment, textHeight: fragment.spacingBasisHeight }),
      // 그림 충돌 탐색은 잉크 높이를 사용하지만, 100% 미만 원본 줄 간격의
      // 다음 줄 원점까지 잉크 높이로 늘리지는 않습니다. 인라인 개체는 별도 정책입니다.
      height: documentMetrics && !inlineSpacing && advance > 0 && advance < textHeight ? advance : height,
      textHeight: inlineSpacing ? basis : textHeight };
    height = required;
  }
  return { state: "unstable_line_height" };
}
