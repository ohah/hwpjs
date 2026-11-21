import { checkedHwp5PieValues } from './hwp5-chart-pie-create.mjs';

// Raw decimal drafts remain strings; this validation grants no edit authority.
export function checkedHwp5PieLiteralEdits(literals, edits) {
  if (literals?.series?.length !== 1) throw Error('UnsupportedChartLiteralEditProfile');
  const values = [...literals.series[0].values];
  for (const edit of edits) {
    if (!edit.value) continue;
    const { series, category, value } = edit.value;
    if (
      series !== 0 ||
      !Number.isSafeInteger(category) ||
      category < 0 ||
      category >= values.length
    )
      throw Error('InvalidChartPointIndex');
    values[category] = value;
  }
  checkedHwp5PieValues(values);
  return edits;
}
