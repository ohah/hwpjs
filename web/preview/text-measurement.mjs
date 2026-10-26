import { DEFAULT_TEXT_HEIGHT } from "./row-geometry.mjs";
import { automaticNumberText } from "./automatic-number-text.mjs";
import { isStructuralAnchor } from "./structural-anchor-units.mjs";
import { measureSourceTab } from "./source-tab-measurement.mjs";
import { canPaintTabLeader } from "./tab-leader-paint.mjs";

// Glyph substitution only; current-source tab advances are resolved below.
export const displayRunText = (
  text,
  paragraph,
  unit,
  kind,
  pageNumber = paragraph?.displayPageNumber,
) => {
  if (text === "\ufffc" && kind === "text") {
    if (
      isStructuralAnchor(paragraph, unit) ||
      paragraph?.pageControls?.some(
        (control) =>
          control.unit === unit &&
          control.paragraph === paragraph.paragraph &&
          control.section === paragraph.section,
      )
    )
      return "";
    const number = automaticNumberText(paragraph, unit, pageNumber);
    if (number !== null) return number;
  }
  return text
    .replaceAll("\t", "    ")
    .replaceAll("\ufffc", "◇")
    .replaceAll("\r", "")
    .replaceAll("\n", "");
};
export function textMeasurement(value) {
  const width = typeof value === "number" ? value : value?.width;
  const height = typeof value === "number" ? DEFAULT_TEXT_HEIGHT : value?.height;
  if (!Number.isFinite(width) || width < 0 || !Number.isFinite(height) || height <= 0)
    throw new RangeError("InvalidTextMeasurement");
  const basis = typeof value === "object" && value !== null ? value.spacingBasisHeight : undefined;
  const advance = typeof value === "object" && value !== null ? value.advance : undefined;
  if (advance !== undefined && (!Number.isFinite(advance) || advance < 0))
    throw new RangeError("InvalidTextMeasurement");
  if (basis !== undefined && (!Number.isFinite(basis) || basis <= 0))
    throw new RangeError("InvalidTextMeasurement");
  return {
    width,
    height,
    ...(advance === undefined ? {} : { advance }),
    ...(basis === undefined ? {} : { spacingBasisHeight: basis }),
  };
}

export function measureDisplayRun(text, paragraph, unit, kind, measure, context) {
  const display = displayRunText(text, paragraph, unit, kind);
  const measured = textMeasurement(measure(display, paragraph, unit, kind));
  if (
    text === "\t" &&
    kind === "text" &&
    paragraph &&
    (Object.hasOwn(paragraph, "tabSources") || paragraph.paragraphShape?.spacingFormat === "hwpx")
  ) {
    const tab = measureSourceTab(paragraph, unit, context, (segment, position) =>
      textMeasurement(
        measure(displayRunText(segment, paragraph, position, kind), paragraph, position, kind),
      ),
    );
    if (tab.state !== "placed") return { ...measured, tabUnavailable: tab.error };
    return {
      ...measured,
      width: tab.advance,
      sourceTab: tab,
      ...(!canPaintTabLeader(tab.leader) ? { tabUnavailable: "UnsupportedTabLeaderPaint" } : {}),
    };
  }
  return text === "\ufffc" && display === "" ? { ...measured, width: 0 } : measured;
}
