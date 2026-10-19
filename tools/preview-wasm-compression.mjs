import { gzipSync } from "node:zlib";

export function createPreviewWasmCompression() {
  let cached = null;
  return (body, acceptEncoding = "") => {
    const gzip = acceptEncoding.split(",").some(token => {
      const [name, ...parameters] = token.trim().split(";");
      if (name.toLowerCase() !== "gzip") return false;
      if (!parameters.length) return true;
      return parameters.length === 1 && /^\s*q\s*=\s*(?:1(?:\.0{0,3})?|0\.\d{1,3})\s*$/i.test(parameters[0])
        && Number(parameters[0].split("=")[1]) > 0;
    });
    if (!gzip) return null;
    if (!cached || !cached.source.equals(body)) cached = { source: Buffer.from(body), bytes: gzipSync(body, { level: 1 }) };
    return cached.bytes;
  };
}
