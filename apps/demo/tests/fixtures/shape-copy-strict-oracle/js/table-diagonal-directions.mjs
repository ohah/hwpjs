// Basic geometry proven by paired official exports and the unobscured cell body.
export const TABLE_DIAGONAL_DIRECTIONS = Object.freeze(['none', 'rising', 'falling', 'cross']);
export function hwp5DiagonalDirections(attributes) {
  if (!Number.isInteger(attributes) || attributes < 0 || attributes > 0xffff) return null;
  const slash = (attributes >>> 2) & 7,
    back = (attributes >>> 5) & 7;
  if ((attributes & 0xff00) !== 0 || ![0, 2].includes(slash) || ![0, 2].includes(back)) return null;
  return slash === 2 ? (back === 2 ? 'cross' : 'rising') : back === 2 ? 'falling' : 'none';
}
export function hwpxDiagonalDirections(style) {
  if (
    !style ||
    style.center_line !== 'NONE' ||
    !['slash_crooked', 'slash_is_counter', 'back_slash_crooked', 'back_slash_is_counter'].every(
      (key) => style[key] === '0',
    ) ||
    !['NONE', 'CENTER'].includes(style.slash) ||
    !['NONE', 'CENTER'].includes(style.back_slash)
  )
    return null;
  return style.slash === 'CENTER'
    ? style.back_slash === 'CENTER'
      ? 'cross'
      : 'rising'
    : style.back_slash === 'CENTER'
      ? 'falling'
      : 'none';
}
