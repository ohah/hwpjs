// Source tick kind, preview-axis geometry. Length and tick spacing remain preview style.
const kinds = new Set(['cross', 'in', 'none', 'out']);
export function chartMajorTickPolicy(field) {
  if (field === undefined) return { state: 'legacy' };
  if (field === null) return { state: 'absent' };
  if (
    !field ||
    typeof field !== 'object' ||
    !Number.isSafeInteger(field.node) ||
    field.node < 0 ||
    field.node > 0xffffffff
  )
    return { state: 'invalid' };
  if (field.value === null) return { state: 'unknown' };
  return kinds.has(field.value) ? { state: 'explicit', kind: field.value } : { state: 'invalid' };
}

/** O(V+C) visits/output; no history cache or input mutation. Hash membership is fixed four values. */
export function chartMajorTickSegments(layout, primitives, length = 4) {
  const unavailable = (reason) => ({ state: 'unavailable', reason });
  // Only the existing 2D bar projection opts in. Other chart dispatch remains unchanged.
  if (primitives.major_tick_marks === undefined)
    return { state: 'ready', segments: [], policies: null };
  const p = layout.plot;
  if (
    !p ||
    ![p.width, p.height, length].every(Number.isFinite) ||
    p.width <= 0 ||
    p.height <= 0 ||
    length <= 0 ||
    length > 16
  )
    return unavailable('InvalidChartTickGeometry');
  if (!['bar', 'col'].includes(primitives.direction))
    return unavailable('UnsupportedChartTickDirection');
  const marks = primitives.major_tick_marks;
  if (!marks || typeof marks !== 'object') return unavailable('InvalidChartTickPolicy');
  const policies = {
    value: chartMajorTickPolicy(marks.value),
    category: chartMajorTickPolicy(marks.category),
  };
  if (Object.values(policies).some((row) => row.state === 'invalid'))
    return unavailable('InvalidChartTickPolicy');
  const segments = [],
    hidden = layout.axes_hidden ?? { value: false, category: false };
  const horizontal = primitives.direction === 'bar';
  for (const [axis, points] of [
    ['value', layout.ticks],
    ['category', layout.categories],
  ]) {
    const policy = policies[axis];
    if (hidden[axis] || policy.state !== 'explicit' || policy.kind === 'none') continue;
    const bottom = axis === 'value' ? horizontal : !horizontal;
    const position = primitives.major_tick_positions?.[axis];
    if (position !== (bottom ? 'b' : 'l')) {
      policies[axis] = { ...policy, state: 'unsupported_position', position: position ?? null };
      continue;
    }
    if (!Array.isArray(points)) return unavailable('InvalidChartTickPositions');
    const inside = policy.kind === 'out' ? 0 : length;
    const outside = policy.kind === 'in' ? 0 : length;
    for (const point of points) {
      const fraction = point?.fraction;
      if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1)
        return unavailable('InvalidChartTickPositions');
      const position = fraction * (bottom ? p.width : p.height);
      segments.push(
        bottom
          ? { axis, x1: position, y1: p.height - inside, x2: position, y2: p.height + outside }
          : {
              axis,
              x1: outside === 0 ? 0 : -outside,
              y1: p.height - position,
              x2: inside,
              y2: p.height - position,
            },
      );
    }
  }
  return {
    state: 'ready',
    segments,
    policies,
    exact: false,
    length,
    placement: 'preview-axis-edges',
  };
}
