/** Native marker presence and preview defaults remain separate from saved values. */
const supportedSymbols = new Set([
  "none",
  "circle",
  "square",
  "diamond",
  "triangle",
  "plus",
  "x",
  "dash",
  "dot",
]);
export const chartMarkerSettings = (display) =>
  new Map((display.series_settings ?? []).map((row) => [row.series_node, row]));
export function validChartMarker(marker) {
  return (
    marker &&
    supportedSymbols.has(marker.symbol) &&
    Number.isFinite(marker.radius) &&
    marker.radius >= 0 &&
    marker.radius <= 48
  );
}
export function chartMarkerPolicy(setting, fallbackEnabled, { allowSmooth = false } = {}) {
  if (!allowSmooth && setting?.smooth && setting.smooth.value !== false)
    return { state: "unavailable", reason: "UnsupportedChartSeriesCurve" };
  const marker = setting?.marker,
    warnings = [];
  if (!marker && !fallbackEnabled)
    return {
      state: "ready",
      symbol: "none",
      radius: 0,
      source_size: false,
      automatic: false,
      warnings: ["SourceMarkersNotApplied"],
    };
  if (
    (marker?.symbol && marker.symbol.value === null) ||
    (marker?.size && marker.size.value === null)
  )
    return { state: "unavailable", reason: "MissingChartMarkerValue" };
  const sourceSymbol = marker?.symbol?.value ?? "auto";
  if (["picture", "star"].includes(sourceSymbol))
    return { state: "unavailable", reason: "UnsupportedChartMarkerSymbol" };
  const automatic = sourceSymbol === "auto",
    symbol = automatic ? "circle" : sourceSymbol;
  if (!supportedSymbols.has(symbol))
    return { state: "unavailable", reason: "UnsupportedChartMarkerSymbol" };
  const size = marker?.size?.value;
  if (size !== undefined && (!Number.isInteger(size) || size < 2 || size > 72))
    return { state: "unavailable", reason: "InvalidChartMarkerSize" };
  if (automatic) warnings.push("PreviewAutoMarkerSymbol");
  if (size === undefined && symbol !== "none") warnings.push("PreviewDefaultMarkerSize");
  if (!["none", "circle"].includes(symbol)) warnings.push("PreviewMarkerGeometry");
  return {
    state: "ready",
    symbol,
    radius: symbol === "none" ? 0 : size === undefined ? 3 : (size * 2) / 3,
    source_size: size !== undefined,
    automatic,
    warnings,
  };
}
