import { validateFieldTargets } from "./hwpx-field-target-wire.mjs";

export function decodeFormulaResultDisplaySnapshot(bytes) {
  const rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  const invalid = () => {
    throw new Error("InvalidFormulaResultDisplaySnapshot");
  };
  if (!Array.isArray(rows) || rows.length > 100000) invalid();
  let previous = 0;
  return rows.map((row) => {
    if (
      !row ||
      !Number.isInteger(row.paragraph) ||
      row.paragraph <= previous ||
      row.paragraph > 0xffffffff ||
      typeof row.text !== "string" ||
      !Array.isArray(row.targets) ||
      !row.targets.length
    )
      invalid();
    previous = row.paragraph;
    const targets = validateFieldTargets(
      row.targets.map((target) => ({
        beginElement: target?.begin_element,
        start: target?.start,
        end: target?.end,
      })),
    );
    if (targets.some((target) => target.end > row.text.length)) invalid();
    return { paragraph: row.paragraph, text: row.text, targets };
  });
}
