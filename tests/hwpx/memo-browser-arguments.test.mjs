import test from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";

test("memo browser audit refuses missing candidate before browser setup", () => {
  assert.throws(() => execFileSync(process.execPath, ["tools/hwpx-memo-browser-audit.mjs"], {
    encoding:"utf8", stdio:"pipe", timeout:10000, env:{...process.env,HWPJS_TEST_WASM:""},
  }), error => error.status === 1 && error.stderr.includes("ExplicitBrowserCandidateRequired") && !error.stdout.includes("memo-browser-phase"));
});

test("memo browser audit rejects unexpected arguments before reading a candidate or opening a browser", () => {
  for (const argument of ["--port=0","--root=/","extra"]) assert.throws(() => execFileSync(process.execPath, ["tools/hwpx-memo-browser-audit.mjs",argument], {
    encoding:"utf8", stdio:"pipe", timeout:10000, env:{...process.env,HWPJS_TEST_WASM:"must-not-read.wasm"},
  }), error => error.status === 1 && error.stderr.includes("UnexpectedBrowserAuditArguments") && !error.stderr.includes("ENOENT") && !error.stdout.includes("memo-browser-phase"));
});
