/** 선택 구간의 검증·wire 인코딩만 담당합니다. 문단 번호는 바꾸지 않습니다. */
export function encodeCharacterRanges(ranges) {
  if (!Array.isArray(ranges)) throw new TypeError('InvalidCharacterRanges');
  if (ranges.length > 4096) throw new RangeError('LimitExceeded');
  const bytes = new Uint8Array(ranges.length * 16);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < ranges.length; i++) {
    const range = ranges[i];
    const names = ['section', 'paragraph', 'startUnit', 'endUnit'];
    if (
      !range ||
      typeof range !== 'object' ||
      Array.isArray(range) ||
      Object.keys(range).some((key) => !names.includes(key))
    )
      throw new TypeError('InvalidCharacterRanges');
    const values = names.map((name) => {
      const value = range[name];
      if (!Number.isInteger(value) || value < 0 || value > 0xffffffff)
        throw new RangeError('InvalidTextPosition');
      return value;
    });
    if (values[3] < values[2]) throw new RangeError('InvalidTextPosition');
    values.forEach((value, j) => view.setUint32(i * 16 + j * 4, value, true));
  }
  return bytes;
}
