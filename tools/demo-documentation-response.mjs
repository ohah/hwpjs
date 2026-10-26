import { readdir, readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { createPreviewWasmCompression } from "./preview-wasm-compression.mjs";

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/vnd.microsoft.icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".hwp": "application/octet-stream",
  ".hwpx": "application/octet-stream",
};

/** Only a built site's public files are snapshotted; requests never read the filesystem. */
export async function loadDemoDocumentation(root) {
  const assets = new Map(),
    compress = createPreviewWasmCompression();
  async function snapshot(directory, prefix = "") {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = resolve(directory, entry.name),
        key = prefix + entry.name;
      if (entry.isDirectory()) await snapshot(file, key + "/");
      else if (entry.isFile() && Object.hasOwn(types, extname(entry.name)))
        assets.set(key, await readFile(file));
    }
  }
  try {
    await snapshot(resolve(root, "apps/docs/doc_build"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    assets.clear();
  }
  const ready = assets.has("index.html");
  return {
    ready,
    respond(path, method, response, acceptEncoding = "") {
      if (path !== "/docs" && !path.startsWith("/docs/")) return false;
      if (path === "/docs") {
        response.writeHead(301, { Location: "/docs/", "Cache-Control": "no-store" });
        response.end();
        return true;
      }
      const relative = path.slice("/docs/".length);
      const safe = !relative
        .split("/")
        .some((part) => part === "." || part === ".." || part.includes("\\"));
      const candidates =
        relative === ""
          ? ["index.html"]
          : [relative, relative + ".html", relative.replace(/\/$/, "") + "/index.html"];
      const key = ready && safe ? candidates.find((name) => assets.has(name)) : undefined;
      const status = key ? 200 : 404,
        selected = key ?? (ready && assets.has("404.html") ? "404.html" : null);
      const body = selected ? assets.get(selected) : Buffer.from("문서 사이트를 찾을 수 없습니다.");
      const representation = key?.endsWith(".wasm")
        ? compress(body, acceptEncoding)
        : { bytes: body, encoding: null };
      if (representation.bytes === null) {
        response.writeHead(406, { Vary: "Accept-Encoding", "Cache-Control": "no-store" });
        response.end();
        return true;
      }
      response.writeHead(status, {
        "Content-Type": selected ? types[extname(selected)] : "text/plain; charset=utf-8",
        "Content-Length": representation.bytes.length,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        ...(key?.endsWith(".wasm") ? { Vary: "Accept-Encoding" } : {}),
        ...(representation.encoding ? { "Content-Encoding": representation.encoding } : {}),
      });
      response.end(method === "HEAD" ? undefined : representation.bytes);
      return true;
    },
  };
}
