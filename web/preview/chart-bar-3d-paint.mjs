export function validChartBar3D(value) {
  if (!value || !Array.isArray(value.faces) || !value.faces.length) return false;
  for (const face of value.faces) {
    if (
      !face ||
      !["front", "side", "cap"].includes(face.kind) ||
      !Number.isFinite(face.depth) ||
      !Array.isArray(face.points) ||
      face.points.length !== 4
    )
      return false;
    for (const point of face.points)
      if (!point || ![point.x, point.y].every(Number.isFinite)) return false;
  }
  return true;
}
export function paintChartBar3D(ctx, value, plot, x, y, color) {
  if (!validChartBar3D(value)) return false;
  const faces = value.faces.map((face) => ({
    ...face,
    pixels: face.points.map((p) => ({ x: x + p.x * plot.width, y: y + p.y * plot.height })),
  }));
  if (faces.some((face) => face.pixels.some((point) => ![point.x, point.y].every(Number.isFinite))))
    return false;
  ctx.save();
  try {
    ctx.beginPath();
    ctx.rect(x, y, plot.width, plot.height);
    ctx.clip();
    for (const face of faces) {
      ctx.fillStyle = color(face.series_node);
      ctx.beginPath();
      ctx.moveTo(face.pixels[0].x, face.pixels[0].y);
      for (const point of face.pixels.slice(1)) ctx.lineTo(point.x, point.y);
      ctx.closePath();
      ctx.fill();
      if (face.kind !== "front") {
        ctx.fillStyle = face.kind === "cap" ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.25)";
        ctx.fill();
      }
    }
    return true;
  } finally {
    ctx.restore();
  }
}
