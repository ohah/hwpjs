function integer(raw, minimum, maximum) {
  if (typeof raw !== "string" || raw.length > 4096 || !/^[ \t\r\n]*[+-]?\d+[ \t\r\n]*$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isInteger(value) && value >= minimum && value <= maximum ? value === 0 ? 0 : value : null;
}
export const xmlSigned32 = raw => integer(raw, -0x80000000, 0x7fffffff);
export const xmlUnsigned32 = raw => integer(raw, 0, 0xffffffff);
