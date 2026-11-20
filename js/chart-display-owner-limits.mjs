// Nearest strictly later plot/axis in the same XML area. Called after uint validation.
// Four stable byte passes keep arbitrary axis input order compatible without O(n log n) sort.
export function chartDisplayOwnerLimits(plots, axes) {
  let source = [
    ...plots.map((value) => ({ node: value.node, area: value.area_node, plot: true })),
    ...axes.map((value) => ({ node: value.node, area: value.area_node, plot: false })),
  ];
  let target = Array.from({ length: source.length });
  const counts = new Uint32Array(256);
  for (let shift = 0; shift < 32; shift += 8) {
    counts.fill(0);
    for (const value of source) counts[(value.node >>> shift) & 255]++;
    let at = 0;
    for (let byte = 0; byte < 256; byte++) {
      const count = counts[byte];
      counts[byte] = at;
      at += count;
    }
    for (const value of source) target[counts[(value.node >>> shift) & 255]++] = value;
    [source, target] = [target, source];
  }
  const next = new Map(),
    limits = new Map();
  let end = source.length;
  while (end > 0) {
    const node = source[end - 1].node;
    let begin = end - 1;
    while (begin > 0 && source[begin - 1].node === node) begin--;
    // Equal node aliases are not strictly later; publish the group only afterwards.
    for (let i = begin; i < end; i++) {
      const value = source[i];
      if (value.plot) limits.set(value.node, next.get(value.area) ?? Infinity);
    }
    for (let i = begin; i < end; i++) next.set(source[i].area, node);
    end = begin;
  }
  return limits;
}
