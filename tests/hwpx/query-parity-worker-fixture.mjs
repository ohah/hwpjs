// Synthetic child for the guard; no browser, fixtures, or WASM.
const send = value => new Promise((resolve, reject) => process.send(value, error => error ? reject(error) : resolve()));
const mode = process.argv[2];
if (mode === "idle") {
  await send({ kind: "progress", phase: "idle" });
  setInterval(() => {}, 1000);
} else {
  if (mode !== "missing") await send({ kind: "progress", phase: "fixture" });
  if (["success", "nonzero", "duplicate"].includes(mode)) await send({ kind: "result", value: { ok: true } });
  if (mode === "duplicate") await send({ kind: "result", value: { ok: false } });
  if (mode === "malformed") await send({ kind: "unknown" });
  if (mode === "output") process.stdout.write("x".repeat(32768));
  if (mode === "nonzero") process.exitCode = 1;
  process.disconnect();
}
