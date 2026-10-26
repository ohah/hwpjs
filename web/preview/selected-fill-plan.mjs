import { selectedSolidFill } from "./drawing-solid-fill.mjs";
import { selectedGradientSource } from "./drawing-gradient-source.mjs";
import { selectedPatternFill } from "./drawing-pattern-fill.mjs";
import { gradientStepStops } from "./gradient-step-stops.mjs";

// Consume verified source selection from either a drawing or a table resource.
export function selectedFillPlan(selected, projectSource = (source) => source) {
  const solid = selectedSolidFill(selected);
  if (solid.error === "UnsupportedDrawingSolidFill")
    return projectSource(selectedPatternFill(selected));
  if (solid.state !== "unavailable" || solid.error !== "UnsupportedDrawingFillVariant")
    return projectSource(solid);
  let source = selectedGradientSource(selected);
  if (source.state !== "gradient_source") return source;
  if (
    source.type !== "LINEAR" ||
    source.alpha !== "0" ||
    !/^-?\d+$/.test(source.angle ?? "") ||
    !/^\d+$/.test(source.step ?? "") ||
    !/^\d+$/.test(source.stepCenter ?? "")
  )
    return { state: "unavailable", error: "UnsupportedDrawingGradientPlan" };
  const angle = Number(source.angle);
  if (!Number.isSafeInteger(angle))
    return { state: "unavailable", error: "UnsupportedDrawingGradientPlan" };
  source = projectSource(source);
  if (source.state !== "gradient_source") return source;
  try {
    const stops = gradientStepStops(source.colors, Number(source.step), Number(source.stepCenter));
    if (!stops.length) return { state: "none" };
    return { state: "linear_gradient", angle, stops, rasterParity: "unverified" };
  } catch (error) {
    return { state: "unavailable", error: error.message };
  }
}
