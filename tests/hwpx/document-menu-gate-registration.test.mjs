import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { verifyHwpxGateRegistration } from "../../tools/hwpx-gate-registration.mjs";

function verify(source, names) {
  verifyHwpxGateRegistration(source, names.map(name => `tests/hwpx/${name}`));
}

test("every document menu test is registered exactly once in the HWPX gate", () => {
  const source = readFileSync(new URL("../../build.zig", import.meta.url), "utf8");
  const names = readdirSync(new URL("./", import.meta.url)).filter(name => /^document-menu.*\.test\.mjs$/.test(name));
  assert(names.length > 0);
  verify(source, names);
  const line = '    hwpx_text_tests.addArg("tests/hwpx/document-menu-mnemonic.test.mjs");';
  assert.throws(() => verify(source.replace(line, ""), names), /HwpxGateRegistration/);
  assert.throws(() => verify(source.replace(line, `${line}\n${line}`), names), /HwpxGateRegistration/);
  assert.throws(() => verify(source.replace(line, '    unrelated_tests.addArg("tests/hwpx/document-menu-mnemonic.test.mjs");'), names), /HwpxGateRegistration/);
  assert.throws(() => verify(source.replace(line, `// ${line}`), names), /HwpxGateRegistration/);
});
