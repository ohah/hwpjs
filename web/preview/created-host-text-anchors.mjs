import { structuralAnchorUnits } from "./structural-anchor-units.mjs";
import { storedAutomaticNumberText } from "./automatic-number-text.mjs";

// Classify source-owned display controls, not generated table placeholders.
export function projectCreatedHostTextAnchors(source, projection) {
  const fail = () => { throw new Error("UnsupportedCreatedTableHostControls"); };
  const first = source.textStartUnit ?? 0, last = first + source.text.length;
  const visible = row => row && Number.isSafeInteger(row.unit) && row.unit >= first && row.unit < last;
  const shift = row => ({ ...row, unit: projection.viewUnitForSource(row.unit, "after") });
  if (![source.automaticNumbers ?? [], source.structuralAnchors ?? [], source.pageControls ?? []].every(Array.isArray)) return fail();
  const numbers = new Map();
  for (const row of (source.automaticNumbers ?? []).filter(visible)) {
    if (numbers.has(row.unit) || source.text[row.unit - first] !== "\ufffc") return fail();
    numbers.set(row.unit, row);
  }
  const structural = (source.structuralAnchors ?? []).filter(visible);
  let hidden;
  try { hidden = new Set([...structuralAnchorUnits({ ...source, structuralAnchors: structural.map(row => ({ ...row, unit: row.unit - first })) })].map(unit => unit + first)); }
  catch { return fail(); }
  const controls = (source.pageControls ?? []).filter(visible);
  for (const row of controls) {
    if (row.section !== source.section || row.paragraph !== source.paragraph || source.text[row.unit - first] !== "\ufffc") return fail();
    hidden.add(row.unit);
  }
  const textAnchorUnits = [], zeroWidthUnits = [];
  for (let index = 0; index < source.text.length; index++) if (source.text[index] === "\ufffc") {
    const unit = first + index;
    if (hidden.has(unit)) {
      if (numbers.has(unit)) return fail();
      zeroWidthUnits.push(projection.viewUnitForSource(unit, "after"));
    } else {
      const number = numbers.get(unit);
      if (!number || number.source?.hwp5PageNumber || storedAutomaticNumberText(number.source) === null) return fail();
      textAnchorUnits.push(projection.viewUnitForSource(unit, "after"));
    }
  }
  return { textAnchorUnits, zeroWidthUnits, automaticNumbers: [...numbers.values()].map(shift),
    structuralAnchors: structural.map(shift), pageControls: controls.map(shift) };
}
