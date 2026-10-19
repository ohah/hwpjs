import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { respondDemoFixture } from "../../tools/demo-fixture-response.mjs";
import { demoFixtures, fixtureUrl } from "../../web/preview/fixture-catalog.mjs";
const root = fileURLToPath(new URL("../../", import.meta.url));
function sink() {
  return { writeHead(status, headers) { this.status = status; this.headers = headers; }, end(body) { this.body = body; this.ended = true; } };
}
test("every UI catalog URL is intercepted and serves its exact original bytes", async () => {
  for (const fixture of demoFixtures) {
    for (const method of ["GET", "HEAD"]) {
      const response = sink();
      assert.equal(await respondDemoFixture(root, decodeURIComponent(fixtureUrl(fixture.id)), method, response), true, fixture.id);
      assert.equal(response.status, 200, fixture.id);
      if (method === "GET") assert.deepEqual(response.body, await readFile(new URL(`../../${fixture.path}`, import.meta.url)), fixture.id);
      else assert.equal(response.body, undefined);
    }
  }
});

test("nested table dutmal and formula reference examples are explicit catalog entries", async () => {
  for (const [id, path] of [
    ["empty-table-cells-reference.hwp", "reference/rhwp/samples/253E164F57A1BC6934-empty.hwp"],
    ["medical-exam-equipment.hwpx", "reference/rhwp/samples/issue5712/3184241_medical_exam_equipment.hwpx"],
    ["training-dutmal.hwpx", "reference/rhwp/samples/hwpx/opengov/36389301_결재문서본문_직장훈련계획_덧말.hwpx"],
    ["numeric-formula-reference.hwpx", "reference/rhwp/samples/hwpx/143E433F503322BD33.hwpx"],
    ["cascaded-formula-reference.hwpx", "reference/rhwp/samples/issue5543_carried_anchor_ladder.hwpx"],
    ["below-formula-reference.hwpx", "reference/rhwp/samples/issue6298/copay_cap_tac_table_leading.hwpx"],
  ]) {
    const matches = demoFixtures.filter(fixture => fixture.id === id);
    assert.equal(matches.length, 1);
    assert.equal(matches[0].path, path);
    assert.equal(Object.isFrozen(matches[0]), true);
    const response = sink();
    await respondDemoFixture(root, fixtureUrl(id), "GET", response);
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, await readFile(new URL(`../../${path}`, import.meta.url)));
    assert.throws(() => fixtureUrl(path), /UnknownDemoFixture/);
  }
});
test("fixture response serves exact original bytes and bodyless HEAD", async () => {
  for (const method of ["GET", "HEAD"]) {
    const response = sink();
    assert.equal(await respondDemoFixture(root, "/demo-fixtures/table.hwpx", method, response), true);
    assert.equal(response.status, 200);
    assert.equal(response.headers["X-Content-Type-Options"], "nosniff");
    assert.equal(response.headers["Cache-Control"], "no-store");
    if (method === "GET") assert.deepEqual(response.body, await readFile(new URL("../../legacy/rust/crates/hwp-core/tests/fixtures/table.hwpx", import.meta.url)));
    else assert.equal(response.body, undefined);
  }
});
test("fixture response rejects traversal unknown names and changed realpaths without reads", async () => {
  let reads = 0;
  const io = { realpath: async () => "/tmp/other-document", readFile: async () => { reads++; throw new Error("MustNotRead"); } };
  for (const path of ["/demo-fixtures/../AGENTS.md", "/demo-fixtures/%2e%2e", "/demo-fixtures/table.hwpx/extra", "/demo-fixtures/table.hwpx", "/demo-fixtures/", "/web/preview/demo-fixtures/../AGENTS.md", "/web/preview/demo-fixtures/%2e%2e", "/web/preview/demo-fixtures/table.hwpx/extra", "/web/preview/demo-fixtures/table.hwpx", "/web/preview/demo-fixtures/"]) {
    const response = sink();
    assert.equal(await respondDemoFixture(root, path, "GET", response, io), true);
    assert.equal(response.status, 404);
    assert.equal(response.ended, true);
  }
  assert.equal(reads, 0);
  assert.equal(await respondDemoFixture(root, "/js/hwpx.mjs", "GET", sink(), io), false);
});
