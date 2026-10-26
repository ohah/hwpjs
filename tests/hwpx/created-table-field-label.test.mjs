import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHwpxEditor } from "../../js/hwpx-editor.mjs";
import { execFileSync } from "../../tools/oracle-process.mjs";

test("all seven actual field fragments retain XML and redo with a generated table", async (t) => {
  const e = await createHwpxEditor(
    readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm"),
  );
  const inventory = (bytes) =>
    JSON.parse(
      execFileSync("python3", ["tools/hwpx-field-edit-oracle.py"], {
        input: JSON.stringify({ mode: "inventory", before: Buffer.from(bytes).toString("base64") }),
        encoding: "utf8",
        timeout: 30000,
      }),
    );
  let exercised = 0;
  try {
    for (const name of ["hyperlink", "issue144-fields-crossing-lineseg-boundary"]) {
      const source = readFileSync(`legacy/rust/crates/hwp-core/tests/fixtures/${name}.hwpx`);
      e.open(source);
      const rows = e.paragraphTextSnapshot(0),
        originalInventory = inventory(source),
        commands = [];
      for (const row of rows) {
        const labels = e.fieldLabels(0, row.paragraph),
          observed = originalInventory.filter((item) => item.paragraph === row.paragraph);
        assert.equal(labels.length, observed.length);
        for (const [index, label] of labels.entries()) {
          const beginId = observed[index].beginId;
          const fragment = originalInventory
            .filter((item) => item.beginId === beginId)
            .findIndex((item) => item.paragraph === row.paragraph);
          assert(fragment >= 0);
          commands.push({ paragraph: row.paragraph, label, beginId, fragment });
        }
      }
      const host = rows.find(
        (row) =>
          !row.nested &&
          (e.canEdit(0, row.paragraph) || e.canEditOutsideField(0, row.paragraph, 0, 0)),
      );
      assert(host);
      for (const command of commands) {
        e.open(source);
        e.enableHistory();
        const resources = Object.fromEntries(
          Object.entries(e.tableCreationResources()).map(([key, ids]) => [key, ids[0]]),
        );
        e.insertTable(0, host.paragraph, 0, {
          rows: 1,
          columns: 1,
          width: 100,
          rowHeight: 17,
          resources,
        });
        const before = e.save();
        const serialized = inventory(before).filter((item) => item.beginId === command.beginId)[
          command.fragment
        ];
        assert(serialized);
        e.spliceFieldLabel(
          0,
          command.paragraph,
          command.label.beginElement,
          command.label.start,
          0,
          "검증😀<&",
        );
        const after = e.save();
        for (const flags of [[], ["-O"]])
          execFileSync("python3", [...flags, "tools/hwpx-field-edit-oracle.py"], {
            input: JSON.stringify({
              before: Buffer.from(before).toString("base64"),
              after: Buffer.from(after).toString("base64"),
              beginId: command.beginId,
              paragraph: serialized.paragraph,
              text: "검증😀<&",
            }),
            timeout: 30000,
          });
        assert.equal(e.undo(), true);
        assert.deepEqual(e.save(), before);
        assert.throws(
          () =>
            e.spliceFieldLabel(
              0,
              command.paragraph,
              command.label.beginElement,
              command.label.start,
              0,
              "\0",
            ),
          /InvalidXmlCharacter/,
        );
        assert.deepEqual(e.save(), before);
        assert.equal(e.redo(), true);
        assert.deepEqual(e.save(), after);
        e.open(after);
        assert.deepEqual(e.save(), after);
        exercised++;
      }
    }
    assert.equal(exercised, 7);
    t.diagnostic(
      "7 field fragments in 2 actual fixtures; independent full XML ZIP; not every label command or browser",
    );
  } finally {
    e.close();
  }
});

test("crossing field label with generated table preserves dirty XML anchor and native redo", async () => {
  const e = await createHwpxEditor(
    readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm"),
  );
  try {
    e.open(
      readFileSync(
        "legacy/rust/crates/hwp-core/tests/fixtures/issue144-fields-crossing-lineseg-boundary.hwpx",
      ),
    );
    e.enableHistory();
    assert.equal(e.createdTableFieldLabelMode(0), true);
    for (const section of [-1, 0.5, "0", null])
      assert.throws(() => e.createdTableFieldLabelMode(section), /InvalidInteger/);
    assert.throws(() => e.createdTableFieldLabelMode(0xffffffff), /InvalidSectionIndex/);
    const resources = Object.fromEntries(
      Object.entries(e.tableCreationResources()).map(([key, ids]) => [key, ids[0]]),
    );
    e.insertTable(0, 3, 5, { rows: 1, columns: 1, width: 100, rowHeight: 17, resources });
    const before = e.save(),
      label = e.fieldLabels(0, 3)[0];
    const inventory = JSON.parse(
      execFileSync("python3", ["tools/hwpx-field-edit-oracle.py"], {
        input: JSON.stringify({
          mode: "inventory",
          before: Buffer.from(before).toString("base64"),
        }),
        encoding: "utf8",
        timeout: 30000,
      }),
    );
    const chosen = inventory.filter((row) => row.paragraph === 3);
    assert.equal(chosen.length, 1);
    e.spliceFieldLabel(0, 3, label.beginElement, 0, 0, "😀<&");
    assert.equal(e.createdTables(0)[0].anchor_unit, 9);
    const after = e.save();
    for (const flags of [[], ["-O"]])
      execFileSync("python3", [...flags, "tools/hwpx-field-edit-oracle.py"], {
        input: JSON.stringify({
          before: Buffer.from(before).toString("base64"),
          after: Buffer.from(after).toString("base64"),
          paragraph: 3,
          beginId: chosen[0].beginId,
          text: "😀<&",
        }),
        timeout: 30000,
      });
    assert.equal(e.undo(), true);
    assert.deepEqual(e.save(), before);
    e.spliceFieldLabel(0, 3, label.beginElement, 0, 0, "");
    assert.deepEqual(e.save(), before);
    assert.throws(() => e.spliceFieldLabel(0, 3, 0xffffffff, 0, 0, "bad"), /InvalidFieldElement/);
    assert.throws(
      () => e.spliceFieldLabel(0, 3, label.beginElement, 3, 2, ""),
      /InvalidTextPosition/,
    );
    assert.throws(
      () => e.spliceFieldLabel(0, 3, label.beginElement, 3, 3, ""),
      /ProtectedCreatedTableAnchor/,
    );
    assert.throws(
      () => e.spliceFieldLabel(0, 3, label.beginElement, 5, 0, "bad"),
      /InvalidTextPosition/,
    );
    assert.equal(e.createdTables(0)[0].anchor_unit, 5);
    assert.deepEqual(e.save(), before);
    assert.throws(
      () => e.spliceFieldLabel(0, 3, label.beginElement, 0, 0, "\0"),
      /InvalidXmlCharacter/,
    );
    assert.deepEqual(e.save(), before);
    assert.equal(e.createdTables(0)[0].anchor_unit, 5);
    assert.equal(e.redo(), true);
    assert.deepEqual(e.save(), after);
    e.open(after);
    assert.deepEqual(e.save(), after);
    assert.equal(e.fieldLabels(0, 3)[0].end, label.end + 4);
  } finally {
    e.close();
  }
});
