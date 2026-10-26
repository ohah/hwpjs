export function paragraphMarginArgs(margins) {
  const names = ['left', 'right', 'indent', 'before', 'after'];
  if (
    !margins ||
    typeof margins !== 'object' ||
    Array.isArray(margins) ||
    Object.keys(margins).some((key) => !names.includes(key))
  )
    throw new TypeError('InvalidParagraphMargins');
  let mask = 0;
  const values = names.map((key, index) => {
    if (!Object.hasOwn(margins, key) || margins[key] === null) return 0;
    const value = margins[key];
    if (!Number.isInteger(value) || value < -2147483648 || value > 2147483647)
      throw new RangeError('InvalidParagraphMargins');
    mask |= 1 << index;
    return value;
  });
  return [mask, ...values];
}
