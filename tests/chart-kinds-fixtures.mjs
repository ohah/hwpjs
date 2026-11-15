export const profiles = [
  { kind: 'barChart', bar_direction: 'col', grouping: 'clustered' },
  { kind: 'bar3DChart', bar_direction: 'bar', grouping: 'percentStacked' },
  { kind: 'lineChart', grouping: 'standard' },
  { kind: 'line3DChart', grouping: 'stacked' },
  { kind: 'areaChart', grouping: 'percentStacked' },
  { kind: 'area3DChart', grouping: 'standard' },
  { kind: 'radarChart', radar_style: 'filled' },
  { kind: 'scatterChart', scatter_style: 'smoothMarker' },
  { kind: 'bubbleChart' },
  { kind: 'pieChart' },
  { kind: 'pie3DChart' },
  { kind: 'doughnutChart' },
  { kind: 'ofPieChart', of_pie_type: 'bar' },
  { kind: 'stockChart', stock_layout: 'highLowClose' },
  { kind: 'surfaceChart', wireframe: false },
  { kind: 'surface3DChart', wireframe: true },
];
export function optionsFor(chart) {
  let categories = ['A', 'B'],
    series = [{ name: 'S', values: [1, 2] }];
  if (['scatterChart', 'bubbleChart'].includes(chart.kind)) {
    categories = [];
    series = [
      {
        name: 'S',
        values: [-2, 3],
        x_values: [8, 13],
        ...(chart.kind === 'bubbleChart' ? { bubble_sizes: [0, 4] } : {}),
      },
    ];
  }
  if (chart.kind.startsWith('surface')) series.push({ name: 'T', values: [3, 4] });
  if (chart.kind === 'stockChart')
    series = [
      ...(chart.stock_layout === 'openHighLowClose'
        ? [{ name: 'O', stock_role: 'open', values: [4, 5] }]
        : []),
      { name: 'H', stock_role: 'high', values: [9, 10] },
      { name: 'L', stock_role: 'low', values: [1, 2] },
      { name: 'C', stock_role: 'close', values: [6, 7] },
    ];
  return { width: 21600, height: 14400, categories, series, chart };
}
