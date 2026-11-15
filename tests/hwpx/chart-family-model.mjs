export function model(
  kind = 'areaChart',
  rows = [
    [2, -3, 4],
    [1, 2, -1],
  ],
) {
  const series = rows.map((_, i) => 10 + i * 100);
  const xy = kind === 'bubbleChart';
  const settings = {
    direction: null,
    grouping: ['areaChart', 'area3DChart', 'line3DChart'].includes(kind)
      ? { node: 4, value: 'standard' }
      : null,
    vary_colors: null,
    gap_width: null,
    overlap: null,
    scatter_style: null,
    first_slice_angle: null,
    of_pie_type: null,
    second_pie_size: null,
    split_type: null,
    split_position: null,
    custom_split_node: null,
    stock: null,
    spatial: ['area3DChart', 'line3DChart'].includes(kind)
      ? { gap_depth: { node: 5, value: 150 }, shape: null }
      : null,
    axis_references: [],
  };
  const axes =
    kind === 'doughnutChart'
      ? []
      : [
          {
            node: 900,
            area_node: 2,
            kind: 'valAx',
            id: { node: 901, value: 1 },
            cross_axis: null,
            position: { node: 902, value: 'l' },
            deleted: null,
            scaling: null,
          },
          {
            node: 910,
            area_node: 2,
            kind: xy ? 'valAx' : 'catAx',
            id: { node: 911, value: 2 },
            cross_axis: null,
            position: { node: 912, value: 'b' },
            deleted: null,
            scaling: null,
          },
        ];
  settings.axis_references = axes.map((a, i) => ({ node: 800 + i, value: i + 1 }));
  const d = {
    kind: 'chart_display',
    pair: {
      chart_path: 'Chart/test.xml',
      ole_path: 'BinData/test.ole',
      wrapper_node: 0,
      section_ordinal: 0,
      section_sha256: Array(32).fill(0),
      declared_external: false,
    },
    host: {
      wrapper_node: 0,
      chart_node: 2,
      geometry: {
        width: 600,
        height: 400,
        width_relative: null,
        height_relative: null,
        treat_as_character: false,
        horizontal_offset: 0,
        vertical_offset: 0,
      },
      position: { flags: [null, null, null, null], relations: [null, null, null, null] },
    },
    plots: [{ node: 3, area_node: 2, kind, series_nodes: series }],
    plot_settings: [settings],
    series_text: [],
    rich_text: [],
    point_settings: [],
    series_settings: series.map((node) => ({
      plot_node: 3,
      series_node: node,
      index: null,
      order: null,
      marker: null,
      smooth: null,
      explosion: null,
    })),
    axes,
    axis_links: axes.map((a, i) => ({
      plot_node: 3,
      reference_node: 800 + i,
      id: i + 1,
      target: { status: 'resolved', node: a.node },
    })),
    points: [],
    bindings: [],
    blank_policy: null,
    view_3d: null,
  };
  function add(s, role, values, offset) {
    values.forEach((v, index) => {
      if (v === null) return;
      const ordinal = d.points.length,
        base = series[s];
      d.points.push({
        cache_node: base + offset,
        point_node: base + 20 + offset + index * 2,
        value_node: base + 21 + offset + index * 2,
        index,
        kind: 'numeric_literal',
        level_node: null,
        value: String(v),
      });
      d.bindings.push({
        point: ordinal,
        series_node: base,
        plot_node: 3,
        role_node: base + offset - 1,
        role,
      });
    });
  }
  rows.forEach((row, s) => {
    if (xy) {
      add(
        s,
        'x',
        row.map((_, i) => (i + 1) * 10),
        2,
      );
      add(s, 'y', row, 20);
      add(
        s,
        'bubble_size',
        row.map((_, i) => i * 4),
        40,
      );
    } else add(s, 'value', row, 2);
  });
  return d;
}
export function camera(d) {
  d.view_3d = {
    node: 950,
    rotation_x: { node: 951, value: 20 },
    rotation_y: { node: 952, value: 25 },
    height_percent: { node: 953, value: 100 },
    depth_percent: { node: 954, value: 100 },
    perspective: null,
    right_angle_axes: { node: 955, value: true },
    unparsed_children: false,
  };
  return d;
}
// Proposed contract examples. These are not claimed to be current Native output.
export function proposed(d) {
  const s = d.plot_settings[0];
  s.family_unparsed_children = false;
  const values =
    {
      doughnutChart: { hole_size: 50 },
      radarChart: { radar_style: 'filled' },
      bubbleChart: {
        bubble_scale: 100,
        size_represents: 'area',
        show_negative_bubbles: false,
        bubble_3d: false,
      },
      surfaceChart: { wireframe: false },
      surface3DChart: { wireframe: false },
    }[d.plots[0].kind] ?? {};
  Object.entries(values).forEach(([key, value], i) => (s[key] = { node: 820 + i, value }));
  return d;
}
export function context() {
  const calls = [];
  let depth = 0;
  const ctx = new Proxy(
    {},
    {
      set(t, k, v) {
        t[k] = v;
        return true;
      },
      get(t, k) {
        if (k in t) return t[k];
        return (...args) => {
          calls.push([k, ...args]);
          if (k === 'save') depth++;
          if (k === 'restore') depth--;
          if (k === 'measureText') return { width: String(args[0]).length * 6 };
        };
      },
    },
  );
  return { ctx, calls, depth: () => depth };
}
