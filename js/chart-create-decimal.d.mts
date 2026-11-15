export function parseChartDecimal(text: string): {
  negative: boolean;
  digits: string;
  scale: number;
};
export function compareChartDecimals(left: string, right: string): -1 | 0 | 1;
