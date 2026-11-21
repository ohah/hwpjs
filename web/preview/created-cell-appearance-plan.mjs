import { gradientStepStops } from './gradient-step-stops.mjs';
import { validateCreatedCellAppearance } from '../../js/created-cell-properties-projection.mjs';
import { tableBorderStrokeParts } from './table-border-stroke.mjs';
import { tableDiagonalPaintPlan } from './table-diagonal-paint.mjs';
const rgb = (n) => `#${n.toString(16).padStart(6, '0')}`;
function stroke(e, edge) {
  if (e.style === 'NONE') return { none: true };
  if (
    !['SOLID', 'DOUBLE_SLIM'].includes(e.style) ||
    !Number.isInteger(e.width_hundredth_mm) ||
    e.width_hundredth_mm <= 0 ||
    !Number.isInteger(e.color)
  )
    return null;
  const s = {
    ...(edge === undefined ? {} : { edge }),
    width: ((e.width_hundredth_mm / 100) * 96) / 25.4,
    color: rgb(e.color),
    ...(e.style === 'DOUBLE_SLIM' ? { compound: 'DOUBLE_SLIM' } : {}),
  };
  return tableBorderStrokeParts(s) ? s : null;
}
export function createdCellAppearancePlan(source) {
  let fill;
  const unavailable = (error) => ({ state: 'unavailable', error, ...(fill ? { fill } : {}) });
  try {
    validateCreatedCellAppearance(source?.value);
  } catch {
    return unavailable('InvalidCreatedCellAppearance');
  }
  const v = source.value,
    b = v.background;
  if (b?.solid) fill = { state: 'solid', color: rgb(b.solid.color) };
  else if (b?.hatch)
    fill = {
      state: 'pattern',
      background: rgb(b.hatch.face),
      color: rgb(b.hatch.hatch),
      kind: b.hatch.style,
    };
  else if (b?.linear) {
    try {
      const g = b.linear,
        stops = gradientStepStops(g.colors.map(rgb), g.step, g.step_center);
      if (stops.length)
        fill = { state: 'linear_gradient', angle: g.angle, stops, rasterParity: 'unverified' };
    } catch {
      return unavailable('UnsupportedCreatedCellGradientProjection');
    }
  } else if (b === null) return unavailable('UnsupportedCreatedCellFill');
  if (source.effectsSupported !== true) return unavailable('UnsupportedCreatedCellEffects');
  const strokes = [];
  for (const [edge, e] of v.edges.entries()) {
    const s = stroke(e, edge);
    if (!s) return unavailable('UnsupportedCreatedCellStroke');
    if (!s.none) strokes.push(s);
  }
  const diagonal = tableDiagonalPaintPlan(v.diagonal.directions, stroke(v.diagonal.stroke));
  return {
    ...(strokes.length ? { state: 'strokes', strokes } : { state: 'none' }),
    ...diagonal,
    ...(fill ? { fill } : {}),
  };
}
export function addCreatedCellPaintIndex(index, content) {
  const cells = new Map();
  for (const table of content.createdTables ?? []) {
    if (table.createdCellPropertiesVersion !== 1) continue;
    for (const cell of table.cells) {
      const key = `${table.section}:${table.identity}:${cell.row}:${cell.column}`;
      cells.set(
        key,
        cells.has(key)
          ? { state: 'unavailable', error: 'AmbiguousCreatedCellPaint' }
          : createdCellAppearancePlan(cell.createdCellAppearance),
      );
    }
  }
  return { ...index, createdCells: cells };
}
export function createdCellPlanForBox(index, box) {
  const c = box.createdCell;
  return (
    index.createdCells?.get(`${box.section}:${c.identity}:${c.row}:${c.column}`) ?? {
      state: 'proxy',
    }
  );
}
