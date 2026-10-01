// Loopback-only development server. No document upload endpoint or dependencies.
import { createServer } from "node:http";
import { readFile, realpath } from "node:fs/promises";
import { resolve, sep, extname } from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const port = Number(process.argv[2] ?? 8080);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("InvalidPort");
const mime = { ".html": "text/html; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".wasm": "application/wasm" };
const server = createServer(async (request, response) => {
  try {
    if (request.method !== "GET" && request.method !== "HEAD") { response.writeHead(405); response.end(); return; }
    const path = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    if (!(path.startsWith("/web/preview/") || path.startsWith("/js/") || path === "/zig-out/bin/hwpjs.wasm")) { response.writeHead(404); response.end(); return; }
    const file = await realpath(resolve(root, `.${path}`));
    const allowed = [resolve(root, "web/preview") + sep, resolve(root, "js") + sep];
    if (!file.startsWith(root) || (!allowed.some(prefix => file.startsWith(prefix)) && file !== resolve(root, "zig-out/bin/hwpjs.wasm"))) { response.writeHead(404); response.end(); return; }
    const body = await readFile(file);
    response.writeHead(200, { "Content-Type": mime[extname(file)] || "application/octet-stream", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    response.end(request.method === "HEAD" ? undefined : body);
  } catch { response.writeHead(404); response.end(); }
});
server.listen(port, "127.0.0.1", () => console.log(`http://127.0.0.1:${port}/web/preview/index.html`));
