import { drawingSolidFill } from "./drawing-solid-fill.mjs";
import { drawingGradientSource } from "./drawing-gradient-source.mjs";
import { gradientStepStops } from "./gradient-step-stops.mjs";
import { drawingPatternFill } from "./drawing-pattern-fill.mjs";
import { hwp5DrawingPaintPlan } from "./hwp5-drawing-paint-plan.mjs";

export function drawingFillPlan(content, drawing) {
  if (drawing.hwp5Style !== undefined) {
    const plan = hwp5DrawingPaintPlan(drawing.hwp5Style);
    return plan.state === "planned" ? plan.fill : plan;
  }
  const solid = drawingSolidFill(content, drawing);
  if (solid.error === "UnsupportedDrawingSolidFill") return drawingPatternFill(content, drawing);
  if (solid.state !== "unavailable" || solid.error !== "UnsupportedDrawingFillVariant") return solid;
  const source = drawingGradientSource(content, drawing);
  if (source.state !== "gradient_source") return source;
  if (source.type !== "LINEAR" || source.alpha !== "0" || !/^-?\d+$/.test(source.angle ?? "") || !/^\d+$/.test(source.step ?? "") || !/^\d+$/.test(source.stepCenter ?? "")) return { state: "unavailable", error: "UnsupportedDrawingGradientPlan" };
  try {
    const stops = gradientStepStops(source.colors, Number(source.step), Number(source.stepCenter));
    if (!stops.length) return { state: "none" };
    return { state: "linear_gradient", angle: Number(source.angle), stops, rasterParity: "unverified" };
  } catch (error) { return { state: "unavailable", error: error.message }; }
}
