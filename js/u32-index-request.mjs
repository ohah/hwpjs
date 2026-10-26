/** Shared bounded count+u32 request envelope; callers own semantic errors. */
export function encodeU32IndexRequest(indices, limit, limitError, requestError) {
  const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
  if (!uint(limit) || limit === 0) throw Error(limitError);
  if (!Array.isArray(indices) || indices.length > limit) throw RangeError(requestError);
  for (let at = 0; at < indices.length; at++)
    if (!Object.hasOwn(indices, at) || !uint(indices[at])) throw RangeError(requestError);
  const bytes = new Uint8Array(4 + indices.length * 4),
    view = new DataView(bytes.buffer);
  view.setUint32(0, indices.length, true);
  indices.forEach((index, at) => view.setUint32(4 + at * 4, index, true));
  return bytes;
}
