import { selectDrawingBrush } from "./drawing-solid-fill.mjs";
import { selectedFillPlan } from "./selected-fill-plan.mjs";
import { hwp5DrawingPaintPlan } from "./hwp5-drawing-paint-plan.mjs";

export function drawingFillPlan(content, drawing) {
  if (drawing.hwp5Style !== undefined) {
    const plan = hwp5DrawingPaintPlan(drawing.hwp5Style);
    return plan.state === "planned" ? plan.fill : plan;
  }
  return selectedFillPlan(selectDrawingBrush(content, drawing));
}
