import { pictureParagraphFlow } from './picture-paragraph-flow.mjs';
import { paragraphSpacePixels } from './paragraph-geometry.mjs';
import { textMeasurement } from './text-measurement.mjs';

// A floating picture's nonpainted anchor is not text that must avoid its own
// picture. Foreign obstacles still participate in the ordinary line solver.
export function pictureAnchorOnlyFlow(
  paragraph,
  box,
  placements,
  obstacles,
  measure,
  maxLines,
  { includeTerminalAfter = true, compactTerminal = false } = {},
) {
  if (
    !paragraph.text.length ||
    paragraph.text !== '\ufffc'.repeat(paragraph.text.length) ||
    (paragraph.textStartUnit ?? 0) !== 0 ||
    placements.length !== paragraph.text.length
  )
    return null;
  const units = new Set();
  for (const p of placements) {
    if (
      p.section !== paragraph.section ||
      p.paragraph !== paragraph.paragraph ||
      !Number.isSafeInteger(p.anchorUnit) ||
      p.anchorUnit < 0 ||
      p.anchorUnit >= paragraph.text.length ||
      units.has(p.anchorUnit)
    )
      return null;
    units.add(p.anchorUnit);
  }
  const flow = pictureParagraphFlow(
    paragraph.text,
    box,
    obstacles,
    (_text, unit) => ({ ...textMeasurement(measure('', unit)), width: 0 }),
    { paragraphShape: paragraph.paragraphShape, maxLines, includeTerminalAfter },
  );
  if (flow.state !== 'complete') return flow;
  const rows = flow.rows.map((row) =>
    compactTerminal && row.height > 0
      ? { ...row, height: Math.min(row.height, row.textHeight + (row.textTop ?? 0)) }
      : row,
  );
  let bottom = box.y;
  for (const row of rows)
    bottom = Math.max(bottom, row.y + Math.max(row.height, row.textHeight + (row.textTop ?? 0)));
  for (const p of placements)
    if (![2, 3].includes(p.flow?.textWrap))
      bottom = Math.max(
        bottom,
        (p.flowRectangle ?? p.rectangle).y + (p.flowRectangle ?? p.rectangle).height,
      );
  const height =
    bottom -
    box.y +
    (includeTerminalAfter ? paragraphSpacePixels(paragraph.paragraphShape?.after) : 0);
  if (!Number.isFinite(height) || height < 0) throw new RangeError('InvalidParagraphFlowBounds');
  return { ...flow, rows, height };
}
