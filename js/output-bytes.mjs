// Host representation only; CFB allocation and content-presence rules stay in Zig.
export const nodeBuffer =
  typeof Buffer !== "undefined" &&
  typeof process !== "undefined" &&
  process.versions?.node
    ? Buffer
    : null;

export function outputBytes(input) {
  const buffered = Boolean(nodeBuffer?.isBuffer(input));
  return {
    content(bytes) {
      // Legacy get_mfat_entry allocates empty results using the host's new_buf.
      return nodeBuffer && (buffered || bytes.length === 0)
        ? nodeBuffer.from(bytes)
        : Array.from(bytes);
    },
    raw(bytes) {
      if (buffered) return nodeBuffer.from(bytes);
      return Array.isArray(input) ? Array.from(bytes) : bytes;
    },
  };
}
