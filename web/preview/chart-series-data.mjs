// Derived plot inputs only. Point ordinal identifies edits; idx joins data.
const dataRoles = ["category", "value", "x", "y", "bubble_size"];
const numericKinds = new Set(["numeric_cache", "numeric_literal"]);
export function chartDisplayNumber(raw) {
  const value = raw.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, "");
  if (["INF", "-INF", "NaN"].includes(value)) return { kind: "non_finite", value: null };
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)) return { kind: "invalid", value: null };
  const number = Number(value);
  return Number.isFinite(number) ? { kind: "finite", value: number } : { kind: "non_finite", value: null };
}

export function projectChartSeries(display) {
  const diagnostics = [], owners = new Map(), directNames = new Map();
  for (const value of display.series_text) {
    const names = directNames.get(value.series_node) ?? [];
    names.push(value); directNames.set(value.series_node, names);
  }
  const plots = display.plots.map(plot => ({ node: plot.node, kind: plot.kind, series: plot.series_nodes.map(node => {
    const row = { node, name: null, roles: Object.fromEntries([...dataRoles, "name"].map(role => [role, []])), points: [], diagnostics: [] };
    owners.set(node, { plot: plot.node, row }); return row;
  }) }));
  for (const [ordinal, source] of display.points.entries()) {
    const binding = display.bindings[ordinal], owner = owners.get(binding.series_node);
    if (!owner || owner.plot !== binding.plot_node || !Object.hasOwn(owner.row.roles, binding.role)) {
      diagnostics.push({ code: "unclassified_point", ordinal }); continue;
    }
    const point = { ...source, ordinal, number: numericKinds.has(source.kind) ? chartDisplayNumber(source.value) : null };
    owner.row.roles[binding.role].push(point);
  }
  for (const { row } of owners.values()) {
    const names = directNames.get(row.node) ?? [];
    if (names.length === 1 && row.roles.name.length === 0) row.name = { kind: "direct", text: names[0].text, value_node: names[0].value_node };
    else if (names.length === 0 && row.roles.name.length === 1) row.name = { kind: "cache", text: row.roles.name[0].value, ordinal: row.roles.name[0].ordinal };
    else if (names.length || row.roles.name.length) row.diagnostics.push({ code: "ambiguous_name" });
    const indices = new Set(), maps = new Map();
    for (const role of dataRoles) {
      const points = row.roles[role], map = new Map(); maps.set(role, map);
      const caches = new Set(points.map(point => point.cache_node));
      if (caches.size > 1) row.diagnostics.push({ code: "ambiguous_role_source", role });
      for (const point of points) {
        indices.add(point.index);
        if (map.has(point.index)) { map.set(point.index, null); row.diagnostics.push({ code: "ambiguous_index", role, index: point.index }); }
        else map.set(point.index, point);
        if (point.kind === "multilevel_cache") row.diagnostics.push({ code: "multilevel_category", role, ordinal: point.ordinal });
        if (point.number?.kind !== undefined && point.number.kind !== "finite") row.diagnostics.push({ code: point.number.kind, role, ordinal: point.ordinal });
      }
    }
    row.points = [...indices].sort((a, b) => a - b).map(index => ({ index, ...Object.fromEntries(dataRoles.map(role => [role, maps.get(role).get(index) ?? null])) }));
  }
  return { plots, diagnostics };
}
