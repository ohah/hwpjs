import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, readdir, symlink, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepareFixturePlan } from "../../tools/demo-fixture-plan.mjs";

test("fixture preflight rejects later missing inputs without touching existing public assets", async t => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "hwpjs-fixture-plan-")));
  t.after(() => rm(root, { recursive: true, force: true }));
  const destination = join(root, "web/preview/demo-fixtures");
  await mkdir(destination, { recursive: true });
  await writeFile(join(root, "source.hwp"), "original");
  await writeFile(join(destination, "one.hwp"), "previous");
  const first = { id: "one.hwp", path: "source.hwp" };
  await assert.rejects(prepareFixturePlan(root, [first, { id: "two.hwpx", path: "missing.hwpx" }]), { code: "ENOENT" });
  assert.equal(await readFile(join(destination, "one.hwp"), "utf8"), "previous");
  assert.deepEqual(await readdir(destination), ["one.hwp"]);
  const plan = await prepareFixturePlan(root, [first]);
  assert.equal(plan.length, 1);
  assert.equal(plan[0].target, join(destination, "one.hwp"));
  assert.equal(plan[0].bytes.toString(), "original");
  for (const fixtures of [[first, first], [{ ...first, id: "../escape.hwp" }], [{ ...first, path: "../outside.hwp" }]]) {
    await assert.rejects(prepareFixturePlan(root, fixtures), /InvalidFixtureId|UnsafeFixtureSource/);
  }
  await symlink(join(root, "does-not-exist"), join(destination, "two.hwpx"));
  await assert.rejects(prepareFixturePlan(root, [{ id: "two.hwpx", path: "source.hwp" }]), /UnsafeFixtureTarget/);
  assert.equal(await readFile(join(destination, "one.hwp"), "utf8"), "previous");
});
