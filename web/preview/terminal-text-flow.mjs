import { isZeroAdvanceTextAnchor } from './row-geometry.mjs';

// A line may have several fragments beside a floating picture. Explicit
// paragraph gaps follow the last line but are not part of its line spacing.
export function terminalTextLine(rows) {
  let last = rows.length - 1;
  while (last >= 0 && rows[last].kind === 'gap') last--;
  const row = rows[last];
  if (row?.kind !== 'text') return null;
  let first = last;
  while (first > 0 && row.height > 0 && row.x !== undefined) {
    const previous = rows[first - 1];
    if (
      previous.kind !== 'text' ||
      previous.x === undefined ||
      previous.y !== row.y ||
      previous.height !== row.height ||
      previous.section !== row.section ||
      previous.paragraph !== row.paragraph
    )
      break;
    first--;
  }
  return { first, last };
}

// Change only the terminal line's advance to its occupied extent. Earlier
// line advances, explicit gaps, and caller-owned object reservations survive.
export function compactTerminalTextFlow(flow, minimumHeight = 0) {
  if (!Number.isFinite(minimumHeight) || minimumHeight < 0)
    throw new RangeError('InvalidLayoutBounds');
  const terminal = terminalTextLine(flow.rows);
  if (!terminal || flow.limited) return flow;
  const line = flow.rows.slice(terminal.first, terminal.last + 1);
  const extent = line.reduce(
    (end, row) =>
      Math.max(end, isZeroAdvanceTextAnchor(row) ? 0 : (row.textTop ?? 0) + row.textHeight),
    0,
  );
  const delta = Math.min(0, extent - line[0].height);
  if (!Number.isFinite(extent) || extent < 0 || !Number.isFinite(flow.height + delta))
    throw new RangeError('InvalidLayoutBounds');
  const rows = flow.rows.map((row, index) =>
    index >= terminal.first && index <= terminal.last
      ? { ...row, height: row.height + delta }
      : index > terminal.last
        ? { ...row, y: row.y + delta }
        : row,
  );
  let height = Math.max(minimumHeight, flow.height + delta);
  for (const row of rows) {
    const ink =
      row.kind === 'text' && !isZeroAdvanceTextAnchor(row)
        ? (row.textTop ?? 0) + row.textHeight
        : 0;
    height = Math.max(height, row.y + Math.max(row.height, ink));
  }
  if (!Number.isFinite(height)) throw new RangeError('InvalidLayoutBounds');
  return { ...flow, rows, height };
}
