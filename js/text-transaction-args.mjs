export function textTransactionArgs({ section, paragraph, startUnit, endUnit, text }) {
  const positions = [section, paragraph, startUnit, endUnit];
  if (positions.some(value => !Number.isInteger(value) || value < 0 || value > 0xffffffff) || endUnit < startUnit) throw new RangeError("InvalidTextPosition");
  if (typeof text !== "string") throw new TypeError("Text must be a string");
  if (!text.isWellFormed()) throw new RangeError("InvalidUnicodeEncoding");
  if (text.length === 0 || startUnit + text.length > 0xffffffff) throw new RangeError("InvalidTextPosition");
  if (text.length > 4 * 1024 * 1024) throw new RangeError("LimitExceeded");
  const bytes = new TextEncoder().encode(text);
  if (bytes.length > 4 * 1024 * 1024) throw new RangeError("LimitExceeded");
  return { positions, bytes };
}
