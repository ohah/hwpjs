// Command validation and tight cubic bounds are shared by placement and painting.
function extrema(values) {
  let differences = [values[1] - values[0], values[2] - values[1], values[3] - values[2]];
  if (!differences.every(Number.isFinite)) {
    const scale = Math.max(...values.map(Math.abs));
    const p = values.map((v) => v / scale);
    differences = [p[1] - p[0], p[2] - p[1], p[3] - p[2]];
  }
  const scale = Math.max(...differences.map(Math.abs));
  if (scale === 0) return [];
  const [d0, d1, d2] = differences.map((v) => v / scale);
  const a = d0 - 2 * d1 + d2,
    b = 2 * (d1 - d0),
    c = d0;
  if (a === 0) return b === 0 ? [] : [-c / b];
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return [];
  const q = -0.5 * (b + (b < 0 ? -1 : 1) * Math.sqrt(discriminant));
  return q === 0 ? [-b / (2 * a)] : [q / a, c / q];
}
function at(values, t) {
  const lerp = (a, b) => (Number.isFinite(b - a) ? a + (b - a) * t : a * (1 - t) + b * t);
  const a = lerp(values[0], values[1]),
    b = lerp(values[1], values[2]),
    c = lerp(values[2], values[3]);
  return lerp(lerp(a, b), lerp(b, c));
}
export function curveCommandBounds(commands) {
  if (!Array.isArray(commands) || !commands.length || commands.length > 3 * 65536) return null;
  let start = null,
    end = null,
    edges = 0,
    left = Infinity,
    top = Infinity,
    right = -Infinity,
    bottom = -Infinity;
  for (const c of commands) {
    if (c?.kind === "closePath") {
      if (!start || !edges || end[0] !== start[0] || end[1] !== start[1]) return null;
      start = null;
      continue;
    }
    if (
      !["moveTo", "lineTo", "bezierCurveTo"].includes(c?.kind) ||
      ![c.x, c.y].every(Number.isFinite)
    )
      return null;
    if (c.kind === "moveTo") {
      if (start && !edges) return null;
      start = [c.x, c.y];
      edges = 0;
    } else {
      if (!start) return null;
      edges++;
      if (c.kind === "bezierCurveTo") {
        if (![c.cp1x, c.cp1y, c.cp2x, c.cp2y].every(Number.isFinite)) return null;
        const xs = [end[0], c.cp1x, c.cp2x, c.x],
          ys = [end[1], c.cp1y, c.cp2y, c.y];
        for (const t of extrema(xs))
          if (t > 0 && t < 1) {
            const x = at(xs, t);
            left = Math.min(left, x);
            right = Math.max(right, x);
          }
        for (const t of extrema(ys))
          if (t > 0 && t < 1) {
            const y = at(ys, t);
            top = Math.min(top, y);
            bottom = Math.max(bottom, y);
          }
      }
    }
    end = [c.x, c.y];
    left = Math.min(left, c.x);
    top = Math.min(top, c.y);
    right = Math.max(right, c.x);
    bottom = Math.max(bottom, c.y);
  }
  if (start && !edges) return null;
  const bounds = { x: left, y: top, width: right - left, height: bottom - top };
  return Object.values(bounds).every(Number.isFinite) ? bounds : null;
}
export function mapCurveCommands(commands, mapPoint) {
  if (typeof mapPoint !== "function" || !curveCommandBounds(commands)) return null;
  const result = [];
  for (const c of commands) {
    if (c.kind === "closePath") {
      result.push({ kind: "closePath" });
      continue;
    }
    const output = { kind: c.kind };
    for (const [xKey, yKey] of c.kind === "bezierCurveTo"
      ? [
          ["cp1x", "cp1y"],
          ["cp2x", "cp2y"],
          ["x", "y"],
        ]
      : [["x", "y"]]) {
      const point = mapPoint([c[xKey], c[yKey]]);
      if (!Array.isArray(point) || point.length !== 2 || !Array.from(point).every(Number.isFinite))
        return null;
      [output[xKey], output[yKey]] = point;
    }
    result.push(output);
  }
  return curveCommandBounds(result) ? result : null;
}
