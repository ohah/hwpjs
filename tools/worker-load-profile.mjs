import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { detectDocumentFormat } from "../js/document-format.mjs";
const [wasmPath, fixture, mode] = process.argv.slice(2);
const unwrapped = mode === "--unwrapped";
if (!wasmPath || !fixture || (mode !== undefined && !unwrapped) || process.argv.length > 5) throw Error("ExplicitWasmAndFixtureRequired");
const wasm = readFileSync(wasmPath), input = readFileSync(fixture);
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const workerPath = resolve("web/preview/reader-worker.mjs"), workerSha256 = hash(readFileSync(workerPath));
const originalInstantiate = WebAssembly.instantiate, originalCompile = WebAssembly.compile;
const previousSelf = globalThis.self, previousFetch = globalThis.fetch, replies = [], stats = new Map();
const record = (name, elapsed) => {
  const row = stats.get(name) ?? { name, calls: 0, totalMs: 0, maxMs: 0 };
  row.calls++; row.totalMs += elapsed; row.maxMs = Math.max(row.maxMs, elapsed); stats.set(name, row);
};
if (!unwrapped) {
WebAssembly.compile = async (...args) => {
  const start = performance.now();
  try { return await originalCompile(...args); } finally { record("WebAssembly.compile", performance.now() - start); }
};
WebAssembly.instantiate = async (...args) => {
  const start = performance.now(), instance = await originalInstantiate(...args);
  record("WebAssembly.instantiate", performance.now() - start);
  if (!(instance instanceof WebAssembly.Instance)) throw Error("ModuleInstantiationExpected");
  return { exports: Object.fromEntries(Object.entries(instance.exports).map(([name, value]) => [name, typeof value !== "function" ? value : (...params) => {
    const begin = performance.now();
    try { return value(...params); } finally { record(name, performance.now() - begin); }
  }])) };
};
}
globalThis.self = { postMessage: reply => replies.push(reply) };
globalThis.fetch = async () => new Response(wasm);
try {
  const begin = performance.now();
  await import(pathToFileURL(resolve("web/preview/reader-worker.mjs")));
  const importMs = performance.now() - begin, start = performance.now();
  await self.onmessage({ data: { kind: "load", format: detectDocumentFormat(input), bytes: input } });
  const workerMs = performance.now() - start, reply = replies.shift();
  if (replies.length || !reply) throw Error("UnexpectedWorkerReplies");
  const ordered = [...stats.values()].sort((a,b) => b.totalMs-a.totalMs);
  console.log(JSON.stringify({ fixture, wasmSha256: hash(wasm), fixtureSha256: hash(input), workerSha256,
    workerSourceUnchanged: hash(readFileSync(workerPath)) === workerSha256, importMs, workerMs,
    unwrapped, contentSha256: reply.content ? hash(JSON.stringify(reply.content)) : null,
    error: reply.error ?? null, paragraphs: reply.content?.paragraphs.length,
    measured: "offline Node Worker handler; no transfer/network/Canvas/fonts/image decoding; wrappers add overhead",
    top: ordered.slice(0, 20), callCount: ordered.reduce((sum,row)=>sum+row.calls,0) }));
  if (reply.error) process.exitCode = 1;
} finally {
  try { await self.onmessage?.({ data: { kind: "load", format: "close-profile", bytes: [] } }); }
  finally { WebAssembly.instantiate = originalInstantiate; WebAssembly.compile = originalCompile; globalThis.self = previousSelf; globalThis.fetch = previousFetch; }
}
