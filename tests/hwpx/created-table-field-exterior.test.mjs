import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHwpxEditor } from "../../js/hwpx-editor.mjs";
import { execFileSync } from "../../tools/oracle-process.mjs";

test("generated table outside crossing field preserves independent XML linked spans and redo", async () => {
  const e = await createHwpxEditor(
    readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm"),
  );
  const source = readFileSync(
    "legacy/rust/crates/hwp-core/tests/fixtures/issue144-fields-crossing-lineseg-boundary.hwpx",
  );
  try {
    e.open(source);
    e.enableHistory();
    const resources = Object.fromEntries(
      Object.entries(e.tableCreationResources()).map(([key, ids]) => [key, ids[0]]),
    );
    const options = { rows: 1, columns: 1, width: 100, rowHeight: 17, resources };
    assert.throws(() => e.insertTable(0, 2, 7, options), /ProtectedFieldRange/);
    assert.deepEqual(Buffer.from(e.save()), source);
    e.insertTable(0, 2, 0, options);
    const before = e.save(),
      old = e.fieldLabels(0, 2)[0];
    e.splice(0, 2, 0, 0, "앞😀<&");
    const after = e.save(),
      now = e.fieldLabels(0, 2)[0];
    assert.equal(now.start, old.start + 5);
    assert.equal(now.end, old.end + 5);
    assert.equal(e.createdTables(0)[0].anchor_unit, 5);
    for (const flags of [[], ["-O"]])
      execFileSync("python3", [...flags, "tools/hwpx-field-outside-oracle.py"], {
        input: JSON.stringify({
          before: Buffer.from(before).toString("base64"),
          after: Buffer.from(after).toString("base64"),
          part: "Contents/section0.xml",
          paragraph: 2,
          prefix: "앞😀<&",
        }),
        timeout: 30000,
      });
    assert.equal(e.undo(), true);
    assert.deepEqual(e.save(), before);
    assert.throws(() => e.splice(0, 2, 7, 0, "x"), /ProtectedFieldRange/);
    assert.deepEqual(e.save(), before);
    assert.equal(e.redo(), true);
    assert.deepEqual(e.save(), after);
    const text = "필드😀";
    e.spliceFieldLabel(0, 2, now.beginElement, now.start, 0, text);
    const pendingEdit = e.save();
    e.open(after);
    assert.deepEqual(e.save(), after);
    const reopened = e.fieldLabels(0, 2)[0];
    const sourceObjects = Number(
      execFileSync(
        "python3",
        [
          "-c",
          "import io,sys,zipfile,xml.etree.ElementTree as E;n='{http://www.hancom.co.kr/hwpml/2011/paragraph}';z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()));p=list(E.fromstring(z.read('Contents/section0.xml')).iter(n+'p'))[1];print(sum(1 for r in p.findall(n+'run') for c in r if c.tag==n+'tbl'))",
        ],
        { input: after, encoding: "utf8", timeout: 30000 },
      ),
    );
    assert.equal(
      sourceObjects,
      1,
      "the generated table must be serialized as a source object in this exact host",
    );
    assert.equal(e.createdTables(0).length, 0);
    assert.equal(reopened.start, now.start + sourceObjects);
    assert.equal(reopened.end, now.end + sourceObjects);
    e.spliceFieldLabel(0, 2, reopened.beginElement, reopened.start, 0, text);
    assert.deepEqual(
      e.save(),
      pendingEdit,
      "the same label edit must commute with serialization and reopening",
    );
    const inventory = JSON.parse(
      execFileSync("python3", ["tools/hwpx-field-edit-oracle.py"], {
        input: JSON.stringify({ mode: "inventory", before: Buffer.from(after).toString("base64") }),
        encoding: "utf8",
        timeout: 30000,
      }),
    );
    const target = inventory.find((row) => row.paragraph === 2);
    assert(target);
    const payload = {
      before: Buffer.from(after).toString("base64"),
      after: Buffer.from(pendingEdit).toString("base64"),
      beginId: target.beginId,
      paragraph: 2,
      text,
    };
    for (const flags of [[], ["-O"]]) {
      const check = (value) =>
        execFileSync("python3", [...flags, "tools/hwpx-field-edit-oracle.py"], {
          input: JSON.stringify(value),
          timeout: 30000,
        });
      check(payload);
      assert.throws(
        () => check({ ...payload, text: "wrong" }),
        (error) =>
          error.status === 1 &&
          /Unexpected XML change outside the chosen field prefix|complete XML mismatch/.test(
            String(error.stderr),
          ),
      );
    }
  } finally {
    e.close();
  }
});
