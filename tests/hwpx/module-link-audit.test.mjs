import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

test("module link audit validates exports and cycles without executing module bodies", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "hwpjs-link-audit-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const run = () =>
    JSON.parse(
      execFileSync(
        process.execPath,
        [
          "--experimental-vm-modules",
          resolve("tools/preview-module-link-audit.mjs"),
          root,
          "main.mjs",
        ],
        { encoding: "utf8", timeout: 10000, stdio: ["ignore", "pipe", "pipe"] },
      ),
    );
  await writeFile(
    join(root, "main.mjs"),
    'import { value } from "./dep.mjs"; export const other = 1; throw new Error("MustNotEvaluate");',
  );
  await writeFile(
    join(root, "dep.mjs"),
    'import { other } from "./main.mjs"; export const value = 2;',
  );
  assert.equal(run().linkedModules, 2);
  assert.equal(run().evaluatedModules, 0);
  await writeFile(join(root, "dep.mjs"), "export const wrong = 2;");
  assert.throws(
    run,
    (error) =>
      error.status === 1 &&
      error.signal === null &&
      /does not provide an export named/.test(String(error.stderr)),
  );
  await rm(join(root, "dep.mjs"));
  assert.throws(run, (error) => error.status === 1 && /ENOENT/.test(String(error.stderr)));
  await writeFile(join(root, "main.mjs"), 'import fs from "node:fs";');
  assert.throws(
    run,
    (error) => error.status === 1 && /UnexpectedExternalImport/.test(String(error.stderr)),
  );
  await writeFile(join(root, "main.mjs"), 'import "../outside.mjs";');
  assert.throws(
    run,
    (error) => error.status === 1 && /InvalidModulePath/.test(String(error.stderr)),
  );
});
