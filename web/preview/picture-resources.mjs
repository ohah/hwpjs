/** Derived bitmap ownership only. Native remains the document authority. */
export function createPictureResources({ read, decode, onChange = () => {}, maxPixels = 16000000, maxTotalPixels = 16000000, maxEntries = 256, maxBytes = 64 * 1024 * 1024, maxTotalBytes = 64 * 1024 * 1024 }) {
  if (typeof read !== "function" || typeof decode !== "function" || ![maxPixels, maxTotalPixels, maxEntries, maxBytes, maxTotalBytes].every(value => Number.isSafeInteger(value) && value >= 1)) throw new Error("InvalidPictureResources");
  let epoch = 0, closed = false, pixels = 0, decodingBytes = 0;
  const entries = new Map();
  const key = (section, node) => `${section}:${node}`;
  const clear = () => {
    epoch++;
    for (const entry of entries.values()) entry.bitmap?.close();
    entries.clear();
    pixels = 0;
    decodingBytes = 0;
  };
  return {
    get(section, pictureNode) { return entries.get(key(section, pictureNode)) ?? null; },
    status(section, pictureNode) {
      const entry = entries.get(key(section, pictureNode));
      if (entry) return entry;
      if (closed) return { bitmap: null, error: "PictureResourcesClosed" };
      if (entries.size >= maxEntries) return { bitmap: null, error: "PictureResourceCountLimitExceeded" };
      return null;
    },
    async load(section, pictureNode) {
      if (closed) throw new Error("PictureResourcesClosed");
      if (![section, pictureNode].every(value => Number.isInteger(value) && value >= 0 && value <= 0xffffffff)) throw new Error("InvalidPictureResourceKey");
      const id = key(section, pictureNode);
      if (entries.has(id)) return entries.get(id).pending;
      if (entries.size >= maxEntries) throw new Error("PictureResourceCountLimitExceeded");
      const generation = epoch, entry = { bitmap: null, error: null, pending: null };
      entries.set(id, entry);
      entry.pending = (async () => {
        let bitmap, reservedBytes = 0;
        try {
          const bytes = await read(section, pictureNode);
          if (generation !== epoch || closed) return;
          if (!(bytes instanceof Uint8Array) || bytes.length > maxBytes) throw new Error("PictureBytesLimitExceeded");
          if (bytes.length > maxTotalBytes - decodingBytes) throw new Error("PictureTotalBytesLimitExceeded");
          reservedBytes = bytes.length; decodingBytes += reservedBytes;
          bitmap = await decode(bytes);
          if (generation !== epoch || closed) { bitmap.close(); return; }
          if (!Number.isSafeInteger(bitmap.width) || !Number.isSafeInteger(bitmap.height) || bitmap.width < 1 || bitmap.height < 1 || bitmap.width > maxPixels / bitmap.height) {
            bitmap.close(); bitmap = null;
            throw new Error("PicturePixelsLimitExceeded");
          }
          const amount = bitmap.width * bitmap.height;
          if (amount > maxTotalPixels - pixels) {
            bitmap.close(); bitmap = null;
            throw new Error("PictureTotalPixelsLimitExceeded");
          }
          pixels += amount;
          entry.bitmap = bitmap;
        } catch (error) {
          if (generation !== epoch || closed) return;
          entry.error = error?.message || String(error);
        } finally {
          if (generation === epoch) decodingBytes -= reservedBytes;
        }
        if (generation === epoch && !closed) onChange(section, pictureNode);
      })();
      return entry.pending;
    },
    clear,
    close() { if (!closed) { closed = true; clear(); } },
  };
}
