import { gzipSync, brotliCompressSync, constants } from "node:zlib";

function selectEncoding(header) {
  const qualities = new Map();
  for (const token of (header ?? "").split(",")) {
    const [raw, ...parameters] = token.trim().split(";"), name = raw.trim().toLowerCase();
    if (!["br", "gzip", "identity", "*"].includes(name)) continue;
    let q = 1;
    if (parameters.length) {
      const match = parameters.length === 1 && /^\s*q\s*=\s*(0(?:\.\d{0,3})?|1(?:\.0{0,3})?)\s*$/i.exec(parameters[0]);
      q = match ? Number(match[1]) : 0;
    }
    // Conflicting repeated entries cannot override an explicit refusal.
    qualities.set(name, Math.min(qualities.get(name) ?? 1, q));
  }
  const identity = qualities.get("identity") ?? (qualities.get("*") === 0 ? 0 : 1);
  const weight = name => qualities.get(name) ?? qualities.get("*") ?? 0;
  const encoding = ["br", "gzip"].sort((a, b) => weight(b) - weight(a)).find(name => weight(name) > 0);
  if (!encoding) return identity > 0 ? "identity" : null;
  return qualities.has("identity") && identity > weight(encoding) ? "identity" : encoding;
}

export function createPreviewWasmCompression() {
  let cached = null;
  return (body, acceptEncoding = "") => {
    const encoding = selectEncoding(acceptEncoding);
    if (encoding === null) return { encoding: null, bytes: null };
    if (encoding === "identity") return { encoding: null, bytes: body };
    if (!cached || !cached.source.equals(body)) cached = { source: Buffer.from(body), variants: new Map() };
    if (!cached.variants.has(encoding)) cached.variants.set(encoding, { encoding, bytes: encoding === "br"
      ? brotliCompressSync(body, { params: { [constants.BROTLI_PARAM_QUALITY]: 6 } })
      : gzipSync(body, { level: 6 }) });
    return cached.variants.get(encoding);
  };
}
