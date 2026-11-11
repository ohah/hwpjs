import { formTextProjection } from './form-text-eol.mjs';
// The same Canvas font, width and scalar-safe rows are used in static paint and edit QA.
export function formTextLayout(text, { width, wrap, measure, maxLines = 65536 }) {
  if (
    typeof text !== 'string' ||
    text.length > 65535 ||
    !Number.isFinite(width) ||
    width < 0 ||
    typeof wrap !== 'boolean' ||
    !Number.isSafeInteger(maxLines) ||
    maxLines < 1 ||
    maxLines > 65536
  )
    throw Error('InvalidFormTextLayout');
  const value = formTextProjection(text),
    rows = [];
  let start = 0;
  const measured = (s) => {
    const n = measure(s);
    if (!Number.isFinite(n) || n < 0) throw Error('InvalidFormTextMetric');
    return n;
  };
  const segmenter = wrap ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
  for (const line of value.split('\n')) {
    if (!wrap || !line.length) {
      rows.push({ start, end: start + line.length, text: line, width: measured(line) });
    } else {
      const boundaries = [...segmenter.segment(line)].map((x) => x.index);
      boundaries.push(line.length);
      for (let at = 0; at < boundaries.length - 1;) {
        let low = at + 1,
          high = low;
        while (
          high < boundaries.length - 1 &&
          measured(line.slice(boundaries[at], boundaries[high])) <= width
        ) {
          low = high;
          high = Math.min(boundaries.length - 1, at + (high - at) * 2);
        }
        if (measured(line.slice(boundaries[at], boundaries[low])) > width) high = low;
        while (low + 1 < high) {
          const middle = Math.floor((low + high) / 2);
          if (measured(line.slice(boundaries[at], boundaries[middle])) <= width) low = middle;
          else high = middle;
        }
        const end = measured(line.slice(boundaries[at], boundaries[high])) <= width ? high : low;
        const part = line.slice(boundaries[at], boundaries[end]);
        rows.push({
          start: start + boundaries[at],
          end: start + boundaries[end],
          text: part,
          width: measured(part),
        });
        at = end;
        if (rows.length >= maxLines)
          return {
            value,
            rows,
            clipped: at < boundaries.length - 1 || start + line.length < value.length,
          };
      }
    }
    if (rows.length >= maxLines)
      return { value, rows, clipped: start + line.length < value.length };
    start += line.length + 1;
  }
  return { value, rows, clipped: false };
}
