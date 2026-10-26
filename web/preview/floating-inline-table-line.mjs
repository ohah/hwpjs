import { inlineTableRowFitsPaper } from './inline-table-row-fit.mjs';

// Only a leading owned inline table can extend its line into physical paper.
// Unknown controls, ordinary prefix text and floating exclusions retain their
// normal region checks; source dimensions are never clamped.
export function floatingInlineTableLine(line, group, paragraph, unit, zeroWidthUnits, reference) {
  const item = group
    .filter((item) => item.inline && item.table.anchorUnit >= unit)
    .sort((a, b) => a.table.anchorUnit - b.table.anchorUnit)[0];
  if (!item || item.width <= line.width) return line;
  for (let at = unit; at < item.table.anchorUnit; at++) if (!zeroWidthUnits.has(at)) return line;
  const paragraphShape = {
    ...paragraph.paragraphShape,
    alignment: 0,
    ...(unit === 0 ? {} : { indent: 0 }),
  };
  if (
    inlineTableRowFitsPaper(
      { inlineTableFit: { width: item.width, paragraphShape } },
      reference,
    ) !== true
  )
    return line;
  return { ...line, width: item.width };
}
