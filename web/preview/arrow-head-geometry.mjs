// Shape construction only; caller supplies measured dimensions and outward direction.
export function arrowHeadGeometry({ tip, direction, length, width, style }) {
  if (
    !Array.isArray(tip) ||
    tip.length !== 2 ||
    !tip.every(Number.isFinite) ||
    !Array.isArray(direction) ||
    direction.length !== 2 ||
    !direction.every(Number.isFinite) ||
    !Number.isFinite(length) ||
    length <= 0 ||
    !Number.isFinite(width) ||
    width <= 0
  )
    return null;
  const norm = Math.hypot(...direction);
  if (!Number.isFinite(norm) || norm === 0 || !['ARROW', 'SPEAR'].includes(style)) return null;
  const [dx, dy] = direction.map((value) => value / norm);
  const base = [tip[0] - length * dx, tip[1] - length * dy];
  const a = [base[0] - (dy * width) / 2, base[1] + (dx * width) / 2];
  const b = [base[0] + (dy * width) / 2, base[1] - (dx * width) / 2];
  if (![...a, ...b].every(Number.isFinite)) return null;
  return style === 'ARROW'
    ? { points: [tip.slice(), a, b], closed: true }
    : { points: [a, tip.slice(), b], closed: false };
}
