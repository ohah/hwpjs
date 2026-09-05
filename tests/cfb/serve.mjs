import { createServer } from "node:http";
import { readFileSync, readdirSync } from "node:fs";
const root = new URL("../../", import.meta.url);
const fixtures = new URL("legacy/rust/crates/hwp-core/tests/fixtures/", root);
const names = readdirSync(fixtures).filter((n) => n.endsWith(".hwp"));
const routes = {
  "/": ["tests/cfb/browser.html", "text/html; charset=utf-8"],
  "/cfb.mjs": ["js/cfb.mjs", "text/javascript"],
  "/input.mjs": ["js/input.mjs", "text/javascript"],
  "/output-bytes.mjs": ["js/output-bytes.mjs", "text/javascript"],
  "/blob-cursor.mjs": ["js/blob-cursor.mjs", "text/javascript"],
  "/exact-result.mjs": ["tests/cfb/exact-result.mjs", "text/javascript"],
  "/wasm-memory.mjs": ["js/wasm-memory.mjs", "text/javascript"],
  "/cfb-entry.mjs": ["js/cfb-entry.mjs", "text/javascript"],
  "/cfb-find.mjs": ["js/cfb-find.mjs", "text/javascript"],
  "/cfb-search-snapshot.mjs": ["js/cfb-search-snapshot.mjs", "text/javascript"],
  "/abi.mjs": ["js/abi.mjs", "text/javascript"],
  "/abi-schema.mjs": ["js/abi-schema.mjs", "text/javascript"],
  "/search-lifecycle.mjs": [
    "tests/cfb/search-lifecycle.mjs",
    "text/javascript",
  ],
  "/legacy.js": ["legacy/cfb.js", "text/javascript"],
  "/browser-boundaries.mjs": [
    "tests/cfb/browser-boundaries.mjs",
    "text/javascript",
  ],
  "/hwpjs.wasm": ["zig-out/bin/hwpjs.wasm", "application/wasm"],
};
createServer((req, res) => {
  const path = decodeURIComponent(
    new URL(req.url, "http://localhost").pathname,
  );
  let body,
    type = "application/octet-stream";
  if (routes[path]) {
    const [file, mime] = routes[path];
    body = readFileSync(new URL(file, root));
    type = mime;
  } else if (path === "/fixtures") {
    body = JSON.stringify(names);
    type = "application/json";
  } else if (path.startsWith("/fixture/") && names.includes(path.slice(9)))
    body = readFileSync(new URL(path.slice(9), fixtures));
  else {
    res.writeHead(404);
    res.end();
    return;
  }
  res.writeHead(200, { "Content-Type": type });
  res.end(body);
}).listen(11309, "127.0.0.1", () => console.log("http://127.0.0.1:11309"));
