import { canvasFontSize } from "./canvas-font-size.mjs";
/** Preview policy only; conflicting source flags are not assigned precedence. */
export function characterReliefStyle(flags, font) {
  if (
    typeof flags?.emboss !== "boolean" ||
    typeof flags?.engrave !== "boolean" ||
    flags.emboss === flags.engrave
  )
    return null;
  const size = canvasFontSize(font);
  if (!size) return null;
  const offset = Math.max(1, size.pixels / 20);
  return {
    kind: flags.emboss ? "emboss" : "engrave",
    passes: [
      { dx: -offset, dy: -offset, color: flags.emboss ? "#ffffff" : "#808080" },
      { dx: offset, dy: offset, color: flags.emboss ? "#808080" : "#ffffff" },
    ],
  };
}
export function paintCharacterRelief(ctx, plan, text, x, y) {
  const color = ctx.fillStyle;
  ctx.save();
  try {
    for (const pass of plan.passes) {
      ctx.fillStyle = pass.color;
      ctx.fillText(text, x + pass.dx, y + pass.dy);
    }
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  } finally {
    ctx.restore();
  }
}
