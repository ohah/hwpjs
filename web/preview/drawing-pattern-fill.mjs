import { selectDrawingBrush } from "./drawing-solid-fill.mjs";
export const DRAWING_PATTERN_KINDS = Object.freeze([
  "HORIZONTAL",
  "VERTICAL",
  "BACK_SLASH",
  "SLASH",
  "CROSS",
  "CROSS_DIAGONAL",
]);
export function drawingPatternFill(content, drawing) {
  return selectedPatternFill(selectDrawingBrush(content, drawing));
}

export function selectedPatternFill(selected) {
  if (selected.state !== "selected") return selected;
  const { brush, nodes } = selected;
  const n = nodes[0];
  if (
    brush.direct_children !== 1 ||
    brush.other_attributes !== 0 ||
    nodes.length !== 1 ||
    n.kind !== "win_brush" ||
    n.direct_children !== 0 ||
    n.other_attributes !== 0 ||
    n.unknown_enums !== 0 ||
    n.non_six_hex_colors !== 0 ||
    n.raw[3] !== "0" ||
    !DRAWING_PATTERN_KINDS.includes(n.raw[2]) ||
    ![n.raw[0], n.raw[1]].every((c) => /^#[0-9a-f]{6}$/i.test(c ?? ""))
  )
    return { state: "unavailable", error: "UnsupportedDrawingPatternFill" };
  return {
    state: "pattern",
    background: n.raw[0],
    color: n.raw[1],
    kind: n.raw[2],
    rasterParity: "unverified",
  };
}

export function createDrawingPattern(ctx, fill, createCanvas) {
  if (
    !DRAWING_PATTERN_KINDS.includes(fill?.kind) ||
    ![fill.background, fill.color].every((c) => /^#[0-9a-f]{6}$/i.test(c ?? ""))
  )
    return null;
  const tile = createCanvas ? createCanvas() : ctx.canvas.ownerDocument.createElement("canvas");
  tile.width = 6;
  tile.height = 6;
  const target = tile.getContext("2d");
  if (!target) return null;
  target.fillStyle = fill.background;
  target.fillRect(0, 0, 6, 6);
  target.strokeStyle = fill.color;
  target.lineWidth = 1;
  target.beginPath();
  const line = (a, b, c, d) => {
    target.moveTo(a, b);
    target.lineTo(c, d);
  };
  if (["HORIZONTAL", "CROSS"].includes(fill.kind)) line(0, 3, 6, 3);
  if (["VERTICAL", "CROSS"].includes(fill.kind)) line(3, 0, 3, 6);
  if (["BACK_SLASH", "CROSS_DIAGONAL"].includes(fill.kind)) line(6, 0, 0, 6);
  if (["SLASH", "CROSS_DIAGONAL"].includes(fill.kind)) line(0, 0, 6, 6);
  target.stroke();
  return ctx.createPattern(tile, "repeat");
}
