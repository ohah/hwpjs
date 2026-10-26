// Candidate ownership is native; this decoder grants no editing permission.
export function decodeFormulaResultParagraphs(bytes) {
  const values = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  if (!Array.isArray(values)) throw new Error("InvalidFormulaResultParagraphs");
  let previous = 0;
  for (const value of values) {
    if (!Number.isInteger(value) || value <= previous || value > 0xffffffff)
      throw new Error("InvalidFormulaResultParagraphs");
    previous = value;
  }
  return values;
}
