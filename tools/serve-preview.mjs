// Loopback-only development server. No document upload endpoint or dependencies.
import { createServer } from "node:http";
import { readFile, realpath } from "node:fs/promises";
import { resolve, sep, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { respondDemoFixture } from "./demo-fixture-response.mjs";
import { createPreviewWasmCompression } from "./preview-wasm-compression.mjs";
const compressWasm = createPreviewWasmCompression();
const root = fileURLToPath(new URL("../", import.meta.url));
const port = Number(process.argv[2] ?? 8080);
const experimentalWasm = process.argv[3] ? await realpath(resolve(process.argv[3])) : null;
if (experimentalWasm) {
  const bytes = await readFile(experimentalWasm);
  if (bytes.length < 8 || !bytes.subarray(0, 8).equals(Buffer.from([0, 97, 115, 109, 1, 0, 0, 0])))
    throw new Error("InvalidExperimentalWasm");
  compressWasm(bytes, "br");
  compressWasm(bytes, "gzip");
}
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("InvalidPort");
const mime = {
  ".html": "text/html; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".wasm": "application/wasm",
};
const server = createServer(async (request, response) => {
  try {
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405);
      response.end();
      return;
    }
    const path = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    if (await respondDemoFixture(root, path, request.method, response)) return;
    if (
      !(
        path.startsWith("/web/preview/") ||
        path.startsWith("/js/") ||
        path === "/zig-out/bin/hwpjs.wasm"
      )
    ) {
      response.writeHead(404);
      response.end();
      return;
    }
    const override = path === "/zig-out/bin/hwpjs.wasm" && experimentalWasm !== null;
    const file = override ? experimentalWasm : await realpath(resolve(root, `.${path}`));
    const allowed = [resolve(root, "web/preview") + sep, resolve(root, "js") + sep];
    if (
      !override &&
      (!file.startsWith(root) ||
        (!allowed.some((prefix) => file.startsWith(prefix)) &&
          file !== resolve(root, "zig-out/bin/hwpjs.wasm")))
    ) {
      response.writeHead(404);
      response.end();
      return;
    }
    const body = await readFile(file);
    const wasm = override || extname(file) === ".wasm";
    const representation = wasm
      ? compressWasm(body, request.headers["accept-encoding"])
      : { bytes: body, encoding: null };
    if (representation.bytes === null) {
      response.writeHead(406, { Vary: "Accept-Encoding", "Cache-Control": "no-store" });
      response.end();
      return;
    }
    const encoded = representation.bytes;
    response.writeHead(200, {
      "Content-Type": override
        ? "application/wasm"
        : mime[extname(file)] || "application/octet-stream",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Length": encoded.length,
      ...(wasm ? { Vary: "Accept-Encoding" } : {}),
      ...(representation.encoding ? { "Content-Encoding": representation.encoding } : {}),
    });
    response.end(request.method === "HEAD" ? undefined : encoded);
  } catch {
    response.writeHead(404);
    response.end();
  }
});
server.listen(port, "127.0.0.1", () =>
  console.log(`http://127.0.0.1:${port}/web/preview/index.html`),
);
