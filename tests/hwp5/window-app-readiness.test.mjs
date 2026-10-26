import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("application window gate admits both formats only with a ready idle editor and settled input", () => {
  const source = readFileSync("web/preview/app.mjs", "utf8");
  const block = source.match(
    /documentWindowControls = createDocumentWindowControls\(\{([\s\S]*?)\n\}\);/,
  );
  assert(block, "ApplicationWindowControlWiringMissing");
  const expression = block[1].match(/ready:\s*\(\) => ([^\n]+),/)[1];
  const ready = new Function(
    "worker",
    "openedFormat",
    "controls",
    "direct",
    "return (" + expression + ");",
  );
  for (const format of ["hwp5", "hwpx"]) {
    const check = (worker, active, busy, settled) =>
      ready(worker, format, { ready: () => active, busy: () => busy }, { settled: () => settled });
    assert.equal(check({}, true, false, true), true, format);
    for (const args of [
      [null, true, false, true],
      [{}, false, false, true],
      [{}, true, true, true],
      [{}, true, false, false],
    ])
      assert.equal(check(...args), false);
  }
  for (const format of [null, "hwp3", "unknown"])
    assert.equal(
      ready({}, format, { ready: () => true, busy: () => false }, { settled: () => true }),
      false,
    );
});
