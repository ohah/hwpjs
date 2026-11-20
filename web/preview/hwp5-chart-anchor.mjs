// Native source units and retained display units are different coordinate spaces.
// Each extended control consumes eight source units and one display marker.
export function hwp5ChartAnchorIndex(row) {
  const offsets = row?.sourceOffsets;
  if (!Array.isArray(offsets) || offsets[0]?.at !== 0 || offsets[0]?.source !== 0)
    throw Error('MissingHwp5ChartSourceOffsets');
  if (typeof row.text !== 'string') throw Error('InvalidHwp5ChartSourceOffsets');
  const result = new Map();
  let previous = offsets[0];
  for (let i = 1; i < offsets.length; i++) {
    const value = offsets[i];
    if (
      !Number.isSafeInteger(value.at) ||
      !Number.isSafeInteger(value.source) ||
      value.at <= previous.at ||
      value.at > row.text.length ||
      value.source - value.at !== previous.source - previous.at + 7
    )
      throw Error('InvalidHwp5ChartSourceOffsets');
    result.set(value.source - 8, value.at - 1);
    previous = value;
  }
  return result;
}
