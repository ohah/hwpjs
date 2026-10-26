import { chartOfPieData } from "./chart-of-pie-data.mjs";
import { chartCircularIntervals } from "./chart-circular-intervals.mjs";
const unavailable = (reason) => ({ state: "unavailable", reason });

/** Unit-square preview fit; not native wrapping, connector or plot layout. */
export function chartOfPiePrimitives(display, plotNode) {
  const data = chartOfPieData(display, plotNode);
  if (data.state !== "ready") return data;
  if (data.series_explosion?.value === null) return unavailable("MissingOfPieExplosionValue");
  if ((data.series_explosion?.value ?? 0) !== 0) return unavailable("UnsupportedOfPieExplosion");
  if (data.point_settings.some((row) => row.explosion !== null && row.explosion.value !== 0))
    return unavailable("UnsupportedOfPiePointExplosion");
  const count = data.primary.length + data.secondary.length,
    ratio = data.second_pie_size / 100;
  const radius = 0.42 / (1 + ratio),
    secondaryRadius = radius * ratio;
  const firstX = 0.04 + radius,
    secondX = 0.96 - secondaryRadius;
  const combined = { ...data.combined, category: "묶음", color_index: count };
  const primary = [...data.primary, combined],
    origin = data.combined.global_fraction * Math.PI;
  const primaryIntervals = chartCircularIntervals(
    primary.map((point) => point.global_fraction),
    origin,
  );
  const secondaryIntervals = chartCircularIntervals(
    data.secondary.map((point) => point.value),
    origin,
  );
  if (primaryIntervals.state !== "ready") return primaryIntervals;
  if (secondaryIntervals.state !== "ready") return secondaryIntervals;
  const sector = (point, interval, center, r) => ({
    ...point,
    ordinal: point.value_ordinal ?? null,
    ...interval,
    center_x: center,
    center_y: 0.5,
    radius: r,
  });
  const groups = [
    {
      kind: "primary",
      origin_angle: origin,
      slices: primary.map((point, i) =>
        sector(point, primaryIntervals.intervals[i], firstX, radius),
      ),
    },
  ];
  const bars = [];
  if (data.plot_type === "pie")
    groups.push({
      kind: "secondary",
      origin_angle: origin,
      slices: data.secondary.map((point, i) =>
        sector(point, secondaryIntervals.intervals[i], secondX, secondaryRadius),
      ),
    });
  else
    for (const [i, point] of data.secondary.entries()) {
      const interval = secondaryIntervals.intervals[i],
        width = secondaryRadius * 0.9;
      bars.push({
        ...point,
        ordinal: point.value_ordinal,
        rectangle: {
          x: secondX - width / 2,
          y: 0.5 - secondaryRadius + interval.start_fraction * secondaryRadius * 2,
          width,
          height: (interval.end_fraction - interval.start_fraction) * secondaryRadius * 2,
        },
      });
    }
  const legend = [...data.primary, ...data.secondary]
    .sort((a, b) => a.color_index - b.color_index)
    .map((point) => ({
      series_node: data.series_node,
      color_key: point.color_index,
      text: point.category,
    }));
  legend.push({ series_node: data.series_node, color_key: count, text: "묶음", generated: true });
  return {
    state: "ready",
    exact: false,
    legend,
    warnings: [
      ...data.warnings,
      "PreviewOfPieFit",
      "PreviewCombinedCategory",
      "SourceStylesNotApplied",
      "SourcePieDataLabelsNotApplied",
      "SourceChartConnectorsNotApplied",
      "SourceChartGapNotApplied",
      ...(data.point_settings.some((row) => row.unparsed_children)
        ? ["SourcePointOverridesNotApplied"]
        : []),
    ],
    of_pie: { plot_type: data.plot_type, groups, bars, membership: data },
  };
}
