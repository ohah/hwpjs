export const paragraphSpacingTypes = Object.freeze([
  'PERCENT',
  'FIXED',
  'BETWEEN_LINES',
  'AT_LEAST',
]);
export function paragraphSpacingArgs(type, value) {
  const kind = paragraphSpacingTypes.indexOf(type);
  if (kind < 0 || !Number.isInteger(value) || value < -2147483648 || value > 2147483647)
    throw new RangeError('InvalidParagraphSpacing');
  return [kind, value];
}
