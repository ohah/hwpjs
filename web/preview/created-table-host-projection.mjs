import { createdTableIdentity } from "../../js/created-table-identity.mjs";

// Read-only layout projection, never an editor document or native source index.
export function projectCreatedTableHost(source, tables) {
  const fail = () => { throw new RangeError("InvalidCreatedTableHostProjection"); };
  if (!source || typeof source.text !== "string" || !source.text.isWellFormed() || !Array.isArray(tables)
      || !Number.isSafeInteger(source.section) || source.section < 0 || !Number.isSafeInteger(source.paragraph) || source.paragraph < 0) return fail();
  const sourceText = source.text;
  const first = source.textStartUnit ?? 0, last = first + sourceText.length;
  if (!Number.isSafeInteger(first) || first < 0 || !Number.isSafeInteger(last)) return fail();
  const boundary = (text, unit) => Number.isSafeInteger(unit) && unit >= 0 && unit <= text.length
    && !(unit > 0 && unit < text.length && /[\uD800-\uDBFF]/.test(text[unit - 1]) && /[\uDC00-\uDFFF]/.test(text[unit]));
  const ids = new Set();
  for (const table of tables) {
    try { createdTableIdentity(table?.identity); } catch { return fail(); }
    if (ids.has(table.identity) || table.section !== source.section || table.hostParagraph !== source.paragraph
        || !boundary(sourceText, table.anchorUnit - first)) return fail();
    ids.add(table.identity);
  }
  const ordered = [...tables].sort((a, b) => a.anchorUnit - b.anchorUnit);
  const anchors = [], runs = [];
  let text = "", cursor = first;
  for (const table of ordered) {
    if (cursor < table.anchorUnit) {
      const part = sourceText.slice(cursor - first, table.anchorUnit - first);
      runs.push({ sourceStart: cursor, sourceEnd: table.anchorUnit, viewStart: text.length, viewEnd: text.length + part.length, text: part });
      text += part;
    }
    anchors.push({ createdTableIdentity: table.identity, sourceUnit: table.anchorUnit, unit: text.length });
    text += "\ufffc";
    cursor = table.anchorUnit;
  }
  if (cursor < last) {
    const part = sourceText.slice(cursor - first);
    runs.push({ sourceStart: cursor, sourceEnd: last, viewStart: text.length, viewEnd: text.length + part.length, text: part });
    text += part;
  }
  const countAnchors = (key, value, inclusive = false) => {
    let low = 0, high = anchors.length;
    while (low < high) {
      const middle = low + Math.floor((high - low) / 2), current = anchors[middle][key];
      if (current < value || inclusive && current === value) low = middle + 1; else high = middle;
    }
    return low;
  };
  const sourceUnitForView = unit => {
    if (!boundary(text, unit)) return fail();
    return first + unit - countAnchors("unit", unit);
  };
  const viewUnitForSource = (unit, affinity = "before") => {
    if (!boundary(sourceText, unit - first) || !["before", "after"].includes(affinity)) return fail();
    return unit - first + countAnchors("sourceUnit", unit, affinity === "after");
  };
  const sourceRunsForViewRange = (start, end) => {
    if (!boundary(text, start) || !boundary(text, end) || end < start) return fail();
    return runs.flatMap(run => {
      const left = Math.max(start, run.viewStart), right = Math.min(end, run.viewEnd);
      return left < right ? [{ sourceStart: run.sourceStart + left - run.viewStart, sourceEnd: run.sourceStart + right - run.viewStart,
        viewStart: left, viewEnd: right, text: run.text.slice(left - run.viewStart, right - run.viewStart) }] : [];
    });
  };
  return { text, anchors: anchors.map(anchor => Object.freeze(anchor)), sourceUnitForView, viewUnitForSource, sourceRunsForViewRange };
}
