// Display flow only. Native control insertion/deletion policy is separate.
export const isHardLineBreak = (segment) =>
  segment === '\n' || segment === '\r' || segment === '\r\n';
