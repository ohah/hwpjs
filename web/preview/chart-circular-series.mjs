/** First source series only: ISO 29500 ofPie and MS-OI29500 pie/pie3D.
 * The source model keeps all series. Do not apply this rule to doughnut rings.
 */
export function chartFirstCircularSeries(data) {
  if (!["pieChart", "pie3DChart", "ofPieChart"].includes(data.kind))
    return { state: "unavailable", reason: "UnsupportedFirstCircularSeriesKind" };
  if (!data.rows.length) return { state: "unavailable", reason: "EmptyCircularData" };
  return {
    state: "selected",
    row: data.rows[0],
    non_displayed_series_nodes: data.rows.slice(1).map((row) => row.series_node),
    warnings:
      data.rows.length > 1
        ? [data.kind === "ofPieChart" ? "SourceOfPieFirstSeries" : "OfficePieFirstSeries"]
        : [],
  };
}
