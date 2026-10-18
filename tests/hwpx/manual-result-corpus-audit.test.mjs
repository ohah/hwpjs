import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("manual result audit rejects missing duplicate or partial scope before reading files or starting children", () => {
  for (const args of [[], ["--fixture=/missing"], ["--wasm=/missing", "--wasm=/other", "--fixture=/missing"], ["--wasm=/missing", "--fixture=/missing", "--limit=1"]]) {
    const result = spawnSync(process.execPath, ["tools/hwpx-manual-result-input-audit.mjs", ...args], { encoding: "utf8", timeout: 10000, env: { ...process.env, PATH: "/nonexistent-manual-audit-tools" } });
    assert.equal(result.error, undefined); assert.equal(result.signal, null); assert.equal(result.status, 1);
    assert.equal(result.stdout, ""); assert.match(result.stderr, /MissingAuditWasm|DuplicateAuditArgument|Unknown argument/); assert.doesNotMatch(result.stderr, /ENOENT/);
  }
});

for (const [tool, expectedError] of [
  ["tools/hwpx-manual-result-input-audit.mjs", /AuditArtifactChanged/],
  ["tools/hwpx-specialized-input-audit.mjs", /AuditFileInputChanged/],
]) test(`${tool} rejects replacing its WASM file during execution`, async () => {
  assert(process.env.HWPJS_TEST_WASM, "Explicit candidate required");
  const directory = mkdtempSync(join(tmpdir(), "hwpjs-manual-artifact-")), candidate = join(directory, "candidate.wasm");
  copyFileSync(process.env.HWPJS_TEST_WASM, candidate);
  const child = spawn(process.execPath, [tool, `--wasm=${candidate}`, "--fixture=legacy/rust/crates/hwp-core/tests/fixtures/chart.hwpx"], { stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "", stderr = "", replaced = false;
  const done = new Promise((resolve, reject) => { child.once("error", reject); child.once("close", (code, signal) => resolve({ code, signal })); });
  const timer = setTimeout(() => child.kill("SIGTERM"), 30000);
  child.stdout.on("data", bytes => {
    stdout += bytes;
    if (!replaced && stdout.includes('"kind":"start"')) {
      writeFileSync(candidate, new Uint8Array([0]));
      replaced = true;
    }
  });
  child.stderr.on("data", bytes => { stderr += bytes; });
  try {
    const result = await done;
    assert.equal(result.signal, null); assert.equal(result.code, 1, stderr);
    assert.equal(replaced, true); assert.match(stderr, expectedError);
    assert(!stdout.includes('"kind":"summary"'), "changed artifact must not produce a successful summary");
    assert(!stdout.includes('"verified":'), "changed artifact must not produce successful totals");
  } finally {
    clearTimeout(timer);
    if (child.pid && child.exitCode === null && child.signalCode === null) { child.kill("SIGTERM"); await done.catch(() => {}); }
    rmSync(directory, { recursive: true, force: true });
  }
});

for (const [fixture, expected] of [
  ["legacy/rust/crates/hwp-core/tests/fixtures/chart.hwpx", 13],
  ["reference/rhwp/samples/issue6298/copay_cap_tac_table_leading.hwpx", 5],
  ["reference/rhwp/samples/hwpx/143E433F503322BD33.hwpx", 3],
  ["reference/rhwp/samples/issue1891_external_bindata_link.hwpx", 5],
]) test(`every direct manual result independently edits saves and reopens: ${fixture}`, t => {
  if (!existsSync(fixture)) return t.skip("reference fixture not present");
  assert(process.env.HWPJS_TEST_WASM, "Explicit candidate required");
  const result = spawnSync(process.execPath, ["tools/hwpx-manual-result-input-audit.mjs", `--wasm=${process.env.HWPJS_TEST_WASM}`, `--fixture=${fixture}`], { encoding: "utf8", timeout: 120000, maxBuffer: 1024 * 1024 });
  assert.equal(result.error, undefined); assert.equal(result.signal, null); assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  const rows = result.stdout.trim().split("\n").map(JSON.parse), summary = rows.at(-1);
  assert.equal(summary.kind, "summary"); assert.equal(summary.files, 1);
  assert.equal(summary.fields, expected); assert.equal(summary.verified, expected);
  assert.equal(summary.failures, 0); assert.deepEqual(summary.refusals, {});
  const digest = bytes => createHash("sha256").update(bytes).digest("hex");
  assert.equal(summary.wasmSha256, digest(readFileSync(process.env.HWPJS_TEST_WASM)));
  const fields = rows.filter(row => row.kind === "field");
  assert.equal(fields.length, expected);
  for (const row of fields) {
    assert.equal(row.path, fixture); assert.equal(row.status, "prefix_xml_reopen_history_verified");
    assert.equal(row.inputSha256, digest(readFileSync(fixture)));
  }
  assert.equal(new Set(fields.map(row => `${row.section}/${row.ordinal}`)).size, expected);
});
