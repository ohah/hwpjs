/** Derived bitmap ownership only. Native remains the document authority. */
import { createPictureResourceSlots } from "./picture-resource-slots.mjs";
export function createPictureResources({
  read,
  readBackground,
  decode,
  decodeIdentity = () => null,
  onChange = () => {},
  maxPixels = 16000000,
  maxTotalPixels = 16000000,
  maxEntries = 256,
  maxConcurrent = 4,
  maxBytes = 64 * 1024 * 1024,
  maxTotalBytes = 64 * 1024 * 1024,
  maxEncodedBytes = 64 * 1024 * 1024,
}) {
  if (
    (readBackground !== undefined && typeof readBackground !== "function") ||
    typeof read !== "function" ||
    typeof decode !== "function" ||
    typeof decodeIdentity !== "function" ||
    ![
      maxPixels,
      maxTotalPixels,
      maxEntries,
      maxConcurrent,
      maxBytes,
      maxTotalBytes,
      maxEncodedBytes,
    ].every((value) => Number.isSafeInteger(value) && value >= 1)
  )
    throw new Error("InvalidPictureResources");
  const slots = createPictureResourceSlots(maxConcurrent);
  let epoch = 0,
    closed = false,
    pixels = 0,
    decodingBytes = 0;
  const entries = new Map();
  const costs = new WeakMap();
  const identities = new WeakMap();
  const sources = new WeakMap(),
    versions = new WeakMap();
  let encodedBytes = 0;
  const releaseSource = (entry) => {
    const bytes = sources.get(entry);
    if (bytes) {
      encodedBytes -= bytes.length;
      sources.delete(entry);
      identities.delete(entry);
    }
  };
  let retained = null;
  const key = (section, node, kind = "picture") => `${kind}:${section}:${node}`;
  const release = (entry) => {
    releaseSource(entry);
    if (entry.bitmap) {
      entry.bitmap.close();
      entry.bitmap = null;
      pixels -= costs.get(entry) ?? 0;
      costs.delete(entry);
    }
  };
  const clear = () => {
    epoch++;
    for (const entry of entries.values()) release(entry);
    entries.clear();
    retained = null;
    pixels = 0;
    decodingBytes = 0;
    slots.wake();
  };
  const resources = {
    get(section, pictureNode, kind = "picture") {
      return entries.get(key(section, pictureNode, kind)) ?? null;
    },
    status(section, pictureNode, kind = "picture") {
      const entry = entries.get(key(section, pictureNode, kind));
      if (entry) return entry;
      if (closed) return { bitmap: null, error: "PictureResourcesClosed" };
      if (retained !== null && !retained.has(key(section, pictureNode, kind)))
        return { bitmap: null, error: null, deferred: true };
      if (entries.size >= maxEntries)
        return { bitmap: null, error: "PictureResourceCountLimitExceeded" };
      return null;
    },
    async load(section, pictureNode, kind = "picture") {
      if (closed) throw new Error("PictureResourcesClosed");
      if (
        !["picture", "table-background"].includes(kind) ||
        ![section, pictureNode].every(
          (value) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff,
        )
      )
        throw new Error("InvalidPictureResourceKey");
      const id = key(section, pictureNode, kind);
      if (entries.get(id)?.pending) return entries.get(id).pending;
      if (!entries.has(id) && entries.size >= maxEntries)
        throw new Error("PictureResourceCountLimitExceeded");
      const generation = epoch,
        entry = entries.get(id) ?? { bitmap: null, error: null, pending: null };
      const version = (versions.get(entry) ?? 0) + 1;
      versions.set(entry, version);
      entry.error = null;
      entry.refreshing = true;
      const alive = () =>
        generation === epoch &&
        !closed &&
        entries.get(id) === entry &&
        versions.get(entry) === version;
      entries.set(id, entry);
      entry.pending = (async () => {
        let bitmap,
          reservedBytes = 0,
          acquired = false;
        try {
          while (alive() && !slots.take()) await slots.changed();
          if (!alive()) return;
          acquired = true;
          const reader = kind === "picture" ? read : readBackground;
          if (!reader) throw new Error("TableBackgroundReaderUnavailable");
          const identity = decodeIdentity({ kind, section, node: pictureNode });
          const bytes = await reader(section, pictureNode);
          if (!alive()) return;
          if (!(bytes instanceof Uint8Array) || bytes.length > maxBytes)
            throw new Error("PictureBytesLimitExceeded");
          const previous = sources.get(entry);
          if (
            entry.bitmap &&
            Object.is(identities.get(entry), identity) &&
            previous &&
            previous.length === bytes.length &&
            previous.every((value, index) => value === bytes[index])
          )
            return;
          release(entry);
          if (bytes.length > maxEncodedBytes - encodedBytes)
            throw new Error("PictureTotalEncodedBytesLimitExceeded");
          if (bytes.length > maxTotalBytes - decodingBytes)
            throw new Error("PictureTotalBytesLimitExceeded");
          // Own the comparison bytes: readers and decoders may reuse or mutate their buffers.
          sources.set(entry, bytes.slice());
          identities.set(entry, identity);
          encodedBytes += bytes.length;
          reservedBytes = bytes.length;
          decodingBytes += reservedBytes;
          bitmap = await decode(bytes, { kind, section, node: pictureNode, identity });
          if (!alive()) {
            bitmap.close();
            return;
          }
          if (
            !Number.isSafeInteger(bitmap.width) ||
            !Number.isSafeInteger(bitmap.height) ||
            bitmap.width < 1 ||
            bitmap.height < 1 ||
            bitmap.width > maxPixels / bitmap.height
          ) {
            bitmap.close();
            bitmap = null;
            throw new Error("PicturePixelsLimitExceeded");
          }
          const amount = bitmap.width * bitmap.height;
          if (amount > maxTotalPixels - pixels) {
            bitmap.close();
            bitmap = null;
            throw new Error("PictureTotalPixelsLimitExceeded");
          }
          pixels += amount;
          costs.set(entry, amount);
          entry.bitmap = bitmap;
        } catch (error) {
          if (!alive()) return;
          release(entry);
          entry.error = error?.message || String(error);
        } finally {
          if (generation === epoch) decodingBytes -= reservedBytes;
          if (acquired) slots.release();
          if (alive()) {
            entry.refreshing = false;
            onChange(section, pictureNode, kind);
          }
        }
      })();
      return entry.pending;
    },
    retain(targets, backgrounds = []) {
      if (closed) throw new Error("PictureResourcesClosed");
      if (
        !Array.isArray(targets) ||
        targets.some(
          (p) =>
            !p ||
            ![p.section, p.pictureNode].every(
              (n) => Number.isInteger(n) && n >= 0 && n <= 0xffffffff,
            ),
        )
      )
        throw new Error("InvalidPictureResourceKey");
      if (
        !Array.isArray(backgrounds) ||
        backgrounds.some(
          (p) =>
            !p ||
            ![p.section, p.listNode].every((n) => Number.isInteger(n) && n >= 0 && n <= 0xffffffff),
        )
      )
        throw new Error("InvalidPictureResourceKey");
      retained = new Set([
        ...targets.map((p) => key(p.section, p.pictureNode)),
        ...backgrounds.map((p) => key(p.section, p.listNode, "table-background")),
      ]);
      for (const [id, entry] of entries)
        if (!retained.has(id)) {
          entries.delete(id);
          release(entry);
        }
      slots.wake();
    },
    // Operation revision only. Document replacement must still call clear().
    refresh() {
      if (closed) throw new Error("PictureResourcesClosed");
      for (const entry of entries.values()) {
        versions.set(entry, (versions.get(entry) ?? 0) + 1);
        entry.pending = null;
        entry.refreshing = true;
      }
      slots.wake();
    },
    encodedStats() {
      return { bytes: encodedBytes, limit: maxEncodedBytes };
    },
    stats() {
      return { entries: entries.size, pixels, decodingBytes };
    },
    activity() {
      return slots.stats();
    },
    clear,
    close() {
      if (!closed) {
        closed = true;
        clear();
      }
    },
  };
  resources.backgrounds = {
    clear() {
      if (closed) throw new Error("PictureResourcesClosed");
      for (const [id, entry] of entries)
        if (id.startsWith("table-background:")) {
          entries.delete(id);
          release(entry);
        }
      slots.wake();
    },
    get: (section, listNode) => resources.get(section, listNode, "table-background"),
    status: (section, listNode) => resources.status(section, listNode, "table-background"),
    load: (section, listNode) => resources.load(section, listNode, "table-background"),
  };
  return resources;
}
