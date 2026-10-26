import { encodeChartPointBatch } from '../../js/chart-point-batch.mjs';
// Only unapplied values are owned here; canonical point records are never changed.
export function createChartPointDrafts() {
  let entries = new Map();
  return {
    size: () => entries.size,
    value: (point) => entries.get(point)?.value,
    changes: () => [...entries].map(([point, change]) => ({ point, ...change })),
    clear() {
      entries.clear();
    },
    stage(point, value, current, limits) {
      if (
        !Number.isInteger(point) ||
        point < 0 ||
        point > 0xffffffff ||
        !current?.[point] ||
        typeof current[point].value !== 'string' ||
        typeof value !== 'string' ||
        !value.isWellFormed()
      )
        throw new Error('InvalidChartDraft');
      const next = new Map(entries);
      if (value === current[point].value) next.delete(point);
      else next.set(point, { before: current[point].value, value });
      encodeChartPointBatch(
        [...next].map(([point, { value }]) => ({ point, value })),
        limits,
        (value) => {
          const bytes = new TextEncoder().encode(value);
          if (
            !Number.isInteger(limits.maxValueBytes) ||
            limits.maxValueBytes <= 0 ||
            bytes.length > limits.maxValueBytes
          )
            throw new Error('LimitExceeded');
          return bytes;
        },
      );
      entries = next;
    },
  };
}
