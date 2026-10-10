import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "../../tools/oracle-process.mjs";

test("oracle file input reaches EOF beyond pipe capacity in both Python modes", () => {
  const input = "검증😀".repeat(200000);
  const expected = String(Buffer.byteLength(input));
  for (const flags of [[], ["-O"]]) {
    const args = [...flags, "-c", "import sys; data=sys.stdin.buffer.read(); print(len(data), end='')"];
    assert.equal(execFileSync("python3", args, { input, encoding: "utf8", timeout: 5000 }), expected);
    const result = spawnSync("python3", args, { input: Buffer.from(input), encoding: "utf8", timeout: 5000 });
    assert.equal(result.status, 0);
    assert.equal(result.error, undefined);
    assert.equal(result.stdout, expected);
  }
});

test("oracle adapter preserves subprocess failures and rejects conflicting stdio", () => {
  assert.throws(() => execFileSync("python3", ["-c", "import sys; sys.stdin.read(); sys.stderr.write('oracle-rejected'); sys.exit(1)"], {
    input: "", encoding: "utf8", timeout: 5000,
  }), error => error.status === 1 && error.signal === null && error.stderr === "oracle-rejected");
  assert.throws(() => execFileSync("python3", [], { input: "x", stdio: "pipe" }), /Oracle input owns stdin/);
  assert.throws(() => execFileSync("/definitely-missing-hwpjs-oracle", [], { input: "x" }), error => error.code === "ENOENT");
  assert.equal(execFileSync("python3", ["-c", "print('no-input', end='')"], { encoding: "utf8", timeout: 5000 }), "no-input");
});
