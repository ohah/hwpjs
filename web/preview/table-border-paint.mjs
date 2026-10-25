import { validDrawingFill } from "./drawing-fill-validation.mjs";
// 행의 변환/clip은 호출자가 공유 paintRowTransform으로 적용합니다.
import { paintTableBackground } from "./table-background-paint.mjs";
import { validTableImageFill } from "./table-image-fill.mjs";
import { tableBorderStrokeParts } from "./table-border-stroke.mjs";
export function paintTableBorder(ctx, box, plan, scrollTop, {bitmap} = {}) {
  if (!box || ![box.x, box.y, box.width, box.height, scrollTop, box.x + box.width, box.y + box.height].every(Number.isFinite)
    || box.width <= 0 || box.height <= 0 || !["none", "strokes"].includes(plan?.state)) return false;
  if (plan.fill && !validDrawingFill(plan.fill) && !validTableImageFill(plan.fill)) return false;
  if (plan.state === "none") return !plan.fill || plan.fill.state==="image"&&!bitmap || paintTableBackground(ctx,box,plan.fill,scrollTop,bitmap);
  if (!Array.isArray(plan.strokes) || !plan.strokes.length || plan.strokes.some(s => !Number.isInteger(s.edge) || s.edge < 0 || s.edge > 3
    || !Number.isFinite(s.width) || s.width <= 0 || !/^#[0-9a-f]{6}$/i.test(s.color))) return false;
  const parts = plan.strokes.map(tableBorderStrokeParts);
  if (parts.some(value => value === null)) return false;
  const x = box.x, y = box.y - scrollTop, right = x + box.width, bottom = y + box.height;
  const ends = [[x, y, x, bottom], [right, y, right, bottom], [x, y, right, y], [x, bottom, right, bottom]];
  ctx.save();
  try {
    if(plan.fill && !(plan.fill.state==="image"&&!bitmap) && !paintTableBackground(ctx,box,plan.fill,scrollTop,bitmap)) return false;
    ctx.setLineDash([]); ctx.lineCap = "butt";
    for (const [index, stroke] of plan.strokes.entries()) {
      ctx.strokeStyle = stroke.color;
      const [x1, y1, x2, y2] = ends[stroke.edge];
      for (const part of parts[index]) {
        ctx.lineWidth = part.width;
        const vertical = stroke.edge < 2;
        ctx.beginPath();
        ctx.moveTo(x1 + (vertical ? part.offset : -part.extension), y1 + (vertical ? -part.extension : part.offset));
        ctx.lineTo(x2 + (vertical ? part.offset : part.extension), y2 + (vertical ? part.extension : part.offset));
        ctx.stroke();
      }
    }
  } finally { ctx.restore(); }
  return true;
}
