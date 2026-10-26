import { structuralAnchorUnits } from './structural-anchor-units.mjs';

// Source-proven structural markers do not become extra tables or text glyphs.
// Callers retain format/inline/floating permission; this only classifies a host.
export function tableHostProfile(paragraph, table) {
  if (
    !table ||
    typeof paragraph?.text !== 'string' ||
    ![paragraph.section, paragraph.paragraph].every(
      (value) => Number.isSafeInteger(value) && value >= 0,
    ) ||
    table.section !== paragraph.section ||
    table.hostParagraph !== paragraph.paragraph
  )
    return null;
  let structural;
  try {
    structural = structuralAnchorUnits(paragraph);
  } catch {
    return null;
  }
  const unit = table.anchorUnit ?? (paragraph.text === '\ufffc' ? 0 : null);
  if (
    !Number.isSafeInteger(unit) ||
    unit < 0 ||
    paragraph.text[unit] !== '\ufffc' ||
    structural.has(unit)
  )
    return null;
  for (let at = 0; at < paragraph.text.length; at++)
    if (paragraph.text[at] === '\ufffc' && at !== unit && !structural.has(at)) return null;
  let leading = true;
  for (let at = 0; at < unit; at++) if (!structural.has(at)) leading = false;
  return { unit, leading, tableOnly: paragraph.text.length === structural.size + 1 };
}
