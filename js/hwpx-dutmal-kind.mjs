export function dutmalKind(value) {
  if (value === 'mainText') return 0;
  if (value === 'subText') return 1;
  throw new RangeError('InvalidDutmalTextKind');
}
