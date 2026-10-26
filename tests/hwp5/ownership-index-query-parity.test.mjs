import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createExperimentalHwp5Editor } from "../../js/hwp5-editor.mjs";
import { inspect } from "./style-preservation/text-record-oracle.mjs";
import { tableBindings } from "./style-preservation/table-binding-oracle.mjs";

assert(
  process.env.HWPJS_BASELINE_WASM && process.env.HWPJS_TEST_WASM,
  "Explicit ownership parity artifacts required",
);
const artifacts = [process.env.HWPJS_BASELINE_WASM, process.env.HWPJS_TEST_WASM].map((path) =>
  readFileSync(path),
);
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
assert.notEqual(
  digest(artifacts[0]),
  digest(artifacts[1]),
  "Distinct baseline and candidate required",
);
const modules = Promise.all(artifacts.map((bytes) => WebAssembly.compile(bytes)));
const observe = (callback) => {
  try {
    return { value: callback() };
  } catch (error) {
    return { error: error.message };
  }
};
const expectedRefusals = new Map([
  ["password-12345.hwp", "UnsupportedEncryption"],
  ["distribution.hwp", "UnsupportedDistribution"],
  ["viewtext.hwp", "UnsupportedDistribution"],
]);

async function verifyPaths(t, paths) {
  const counts = {
    files: 0,
    opened: 0,
    matchedOpenRefusals: 0,
    sections: 0,
    queries: 0,
    matchedQueryRefusals: 0,
    cells: 0,
  };
  for (const path of paths) {
    const input = readFileSync(path),
      original = Buffer.from(input),
      editors = [],
      errors = [];
    try {
      for (const module of await modules) {
        try {
          editors.push(await createExperimentalHwp5Editor(module, input));
          errors.push(null);
        } catch (error) {
          editors.push(null);
          errors.push(error.message);
        }
      }
      assert.equal(errors[1], errors[0], `${path}:open`);
      counts.files++;
      if (errors[0]) {
        assert.equal(
          errors[0],
          expectedRefusals.get(path.split("/").at(-1)),
          `${path}:unexpected baseline refusal`,
        );
        counts.matchedOpenRefusals++;
        continue;
      }
      counts.opened++;
      const source = inspect(input);
      assert.equal(editors[0].sectionCount(), editors[1].sectionCount(), path);
      for (let section = 0; section < editors[0].sectionCount(); section++) {
        counts.sections++;
        for (const name of ["tableBindings", "paragraphFlow", "columnSources"]) {
          const before = observe(() => editors[0][name](section)),
            after = observe(() => editors[1][name](section));
          assert.deepEqual(after, before, `${path}:${section}:${name}`);
          counts.queries++;
          if (before.error) {
            counts.matchedQueryRefusals++;
            continue;
          }
          if (name === "tableBindings") {
            const expected = tableBindings(source.sections[section].bytes);
            assert.deepEqual(after.value, expected, `${path}:${section}:independent cells`);
            counts.cells += expected.length;
            if (expected.length)
              assert.throws(
                () =>
                  assert.deepEqual(
                    after.value,
                    expected.map((row, index) => (index ? row : { ...row, row: row.row + 1 })),
                  ),
                assert.AssertionError,
              );
          }
        }
      }
      for (const editor of editors)
        assert.deepEqual(
          Buffer.from(editor.save().bytes),
          original,
          `${path}:query changed source`,
        );
    } finally {
      for (const editor of editors) editor?.close();
      assert.deepEqual(input, original, `${path}:input mutation`);
    }
  }
  assert(counts.opened > 0 && counts.queries > 0 && counts.cells > 0);
  assert.equal(
    counts.matchedQueryRefusals,
    0,
    "These fixtures require successful ownership queries, not matching failures",
  );
  assert.equal(
    counts.matchedOpenRefusals,
    paths.filter((path) => expectedRefusals.has(path.split("/").at(-1))).length,
  );
  t.diagnostic(
    JSON.stringify({
      ...counts,
      artifacts: artifacts.map(digest),
      scope:
        "full native query arrays, independent raw cell bindings and source preservation; matched refusals are not support",
    }),
  );
}

test("ownership query index preserves all tracked HWP fixture responses and independent source cells", async (t) => {
  const paths = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
    .split("\0")
    .filter((path) => path.includes("/fixtures/") && /\.hwp$/i.test(path))
    .sort();
  assert(paths.length >= 45);
  await verifyPaths(t, paths);
});

test("ownership query index preserves complete huge table and mixed-field reference snapshots", async (t) => {
  await verifyPaths(t, [
    "reference/rhwp/samples/task2070/1130000-201900011_D0150004-1-002_2017년기준 시장구조조사.hwp",
    "reference/rhwp/samples/issue1891/76076_regulatory_analysis.hwpx",
    "reference/rhwp/samples/추진일정.hwp",
  ]);
});
