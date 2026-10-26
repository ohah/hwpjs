import test from "node:test";
import assert from "node:assert/strict";
import { openSync, closeSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { writeAuditRow } from "../../tools/audit-jsonl-output.mjs";

test("audit JSONL retries partial byte writes including split UTF8 characters", () => {
  const parts = [],
    value = { kind: "result", text: "한😀" };
  writeAuditRow(value, (fd, bytes, offset, count) => {
    assert.equal(fd, 1);
    const size = Math.min(2, count);
    parts.push(Buffer.from(bytes.subarray(offset, offset + size)));
    return size;
  });
  assert.equal(Buffer.concat(parts).toString(), JSON.stringify(value) + "\n");
});
test("audit JSONL never swallows ENOSPC or accepts invalid write progress", () => {
  const error = Object.assign(new Error("disk full"), { code: "ENOSPC" });
  assert.throws(
    () =>
      writeAuditRow({ kind: "result" }, () => {
        throw error;
      }),
    (x) => x === error,
  );
  for (const value of [0, -1, NaN, Infinity, 1.5, 1000000])
    assert.throws(() => writeAuditRow({}, () => value), /AuditOutputWriteFailed/);
});
test("audit JSONL rejects unserializable evidence before any output", () => {
  for (const value of [undefined, 1n]) {
    let calls = 0;
    assert.throws(() =>
      writeAuditRow(value, () => {
        calls++;
        return 1;
      }),
    );
    assert.equal(calls, 0);
  }
});
test("real readonly stdout reproduces console silent success but reliable output fails closed", () => {
  const path = new URL(import.meta.url),
    before = readFileSync(path),
    fd = openSync(path, "r");
  try {
    const run = (script) =>
      spawnSync(process.execPath, ["--input-type=module", "-e", script], {
        stdio: ["ignore", fd, "pipe"],
        encoding: "utf8",
      });
    const old = run('console.log(JSON.stringify({kind:"summary"}))');
    assert.equal(old.status, 0);
    assert.equal(old.signal, null);
    const reliable = run(
      `import {writeAuditRow} from ${JSON.stringify(new URL("../../tools/audit-jsonl-output.mjs", import.meta.url).href)};writeAuditRow({kind:"summary"});`,
    );
    assert.equal(reliable.status, 1);
    assert.equal(reliable.signal, null);
    assert.match(reliable.stderr, /EBADF/);
  } finally {
    closeSync(fd);
  }
  assert.deepEqual(readFileSync(path), before);
});
