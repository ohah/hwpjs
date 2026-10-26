// Native owns limits and value semantics. This only encodes the bounded envelope.
export function readChartPointBatchLimits(wasm) {
  if (
    ![
      'hwpx_edit_set_chart_points',
      'hwpx_edit_chart_point_batch_max_edits',
      'hwpx_edit_chart_point_batch_max_bytes',
      'hwpx_edit_chart_point_max_bytes',
    ].every((name) => typeof wasm[name] === 'function')
  )
    throw new Error('HwpxChartBatchEditAbiUnavailable');
  const limits = {
    maxEdits: wasm.hwpx_edit_chart_point_batch_max_edits(),
    maxBytes: wasm.hwpx_edit_chart_point_batch_max_bytes(),
    maxValueBytes: wasm.hwpx_edit_chart_point_max_bytes(),
  };
  validateLimits(limits);
  if (
    !Number.isInteger(limits.maxValueBytes) ||
    limits.maxValueBytes <= 0 ||
    limits.maxValueBytes > 0xffffffff
  )
    throw new Error('InvalidChartBatchLimit');
  return limits;
}
function validateLimits({ maxEdits, maxBytes }) {
  if (
    !Number.isInteger(maxEdits) ||
    maxEdits <= 0 ||
    maxEdits > 0xffffffff ||
    !Number.isInteger(maxBytes) ||
    maxBytes < 4 ||
    maxBytes > 0xffffffff
  )
    throw new Error('InvalidChartBatchLimit');
}
export function encodeChartPointBatch(edits, { maxEdits, maxBytes }, encodeValue) {
  validateLimits({ maxEdits, maxBytes });
  if (!Array.isArray(edits)) throw new TypeError('InvalidChartPointBatch');
  if (edits.length > maxEdits) throw new RangeError('LimitExceeded');
  const seen = new Set(),
    rows = [];
  let size = 4;
  for (const edit of edits) {
    if (!edit || typeof edit !== 'object' || Array.isArray(edit))
      throw new TypeError('InvalidChartPointBatch');
    const point = edit.point,
      value = edit.value;
    if (!Number.isInteger(point) || point < 0 || point > 0xffffffff)
      throw new RangeError('InvalidInteger');
    if (seen.has(point)) throw new Error('DuplicateChartPointEdit');
    seen.add(point);
    const bytes = encodeValue(value);
    if (!(bytes instanceof Uint8Array)) throw new TypeError('InvalidChartPointBytes');
    size += 8 + bytes.length;
    if (!Number.isSafeInteger(size) || size > maxBytes) throw new RangeError('LimitExceeded');
    rows.push({ point, bytes });
  }
  const output = new Uint8Array(size),
    view = new DataView(output.buffer);
  view.setUint32(0, rows.length, true);
  let offset = 4;
  for (const row of rows) {
    view.setUint32(offset, row.point, true);
    view.setUint32(offset + 4, row.bytes.length, true);
    output.set(row.bytes, offset + 8);
    offset += 8 + row.bytes.length;
  }
  return output;
}
