export function shortChartLabel(value) {
  let result = "",
    length = 0;
  for (const character of value) {
    if (length++ === 128) return result + "…";
    result += character;
  }
  return result;
}

/** Shared preview budgets; source legend placement and typography remain separate. */
export function chartPreviewLegendLayout(rows, available, left, measure) {
  if (![available, left].every(Number.isFinite) || available <= 0)
    return { state: "unavailable", reason: "ChartPreviewTextSpaceUnavailable" };
  const legend = [];
  let cursor = 0,
    line = 0,
    shortened = 0;
  for (const row of rows.slice(0, 64)) {
    if (row.text === null) continue;
    const text = shortChartLabel(row.text),
      measured = measure(text);
    if (typeof measured !== "number" || !Number.isFinite(measured) || measured < 0)
      return { state: "unavailable", reason: "ChartPreviewTextSpaceUnavailable" };
    const size = Math.min(available, measured + 26);
    if (cursor > 0 && cursor + size > available) {
      line++;
      cursor = 0;
    }
    if (line >= 3) break;
    if (text !== row.text) shortened++;
    legend.push({ ...row, text, x: left + cursor, line, maxWidth: Math.max(0, size - 20) });
    cursor += size;
  }
  return {
    state: "ready",
    legend,
    height: legend.length ? (line + 1) * 18 : 0,
    omitted: rows.filter((row) => row.text !== null).length - legend.length,
    shortened,
  };
}
