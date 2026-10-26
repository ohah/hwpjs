/** Two-pass absolute-total arithmetic shared by circular and stacked previews. */
export function createChartAbsoluteTotal(values) {
  if (!Array.isArray(values)) return null;
  let magnitude = 0,
    scaled = 0;
  for (const value of values) {
    if (!Number.isFinite(value)) return null;
    magnitude = Math.max(magnitude, Math.abs(value));
  }
  if (magnitude > 0) for (const value of values) scaled += Math.abs(value / magnitude);
  return {
    isZero: magnitude === 0,
    share: (value) => (magnitude === 0 ? 0 : value / magnitude / scaled),
    accumulator() {
      let sum = 0;
      return (value) => {
        if (magnitude === 0) return 0;
        sum += value / magnitude;
        return sum / scaled;
      };
    },
  };
}
