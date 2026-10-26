import { drawingFillPlan } from "./drawing-fill-plan.mjs";
import { strokeDashPattern } from "./stroke-dash-pattern.mjs";
import { hwpUnitPixels } from "./hwp-units.mjs";
import { drawingHasNoShadow } from "./drawing-shadow-policy.mjs";

// Ellipse and sampled curve previews share stroke, fill and refusal policies.
export function curvedShapePaintPlan(content, item, kind) {
  const fail = (error) => ({ state: "unavailable", error }),
    source = item?.source?.common;
  if (!["Ellipse", "Curve"].includes(kind)) return fail("InvalidCurvedShapeKind");
  if (!drawingHasNoShadow(source?.paint)) return fail(`Unsupported${kind}Shadow`);
  const fill = drawingFillPlan(content, {
    section: item.section,
    drawingNode: item.source.node,
    source,
  });
  if (!["none", "solid"].includes(fill.state)) return fail(fill.error ?? `Unsupported${kind}Fill`);
  const stroke = source.stroke;
  if (
    (source.stroke_style === 0 || stroke?.style === 0) &&
    [null, "UnsupportedLineStrokeColor"].includes(source.stroke_error)
  )
    return { state: "planned", fill, strokeEnabled: false };
  if (
    !stroke ||
    source.stroke_error !== null ||
    !Number.isInteger(stroke.color) ||
    stroke.color < 0 ||
    stroke.color > 0xffffff ||
    !Number.isInteger(stroke.width) ||
    stroke.width < 0 ||
    stroke.width > 0xffffffff ||
    !strokeDashPattern(stroke.style)
  )
    return fail(source.stroke_error ?? `Unsupported${kind}Stroke`);
  return {
    state: "planned",
    fill,
    strokeColor: `#${stroke.color.toString(16).padStart(6, "0")}`,
    lineWidth: Math.max(0.5, hwpUnitPixels(stroke.width)),
    dash: [...strokeDashPattern(stroke.style)],
    strokePolicy: "rhwp-preview-min-0.5px",
  };
}
