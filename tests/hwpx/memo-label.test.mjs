import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHwpxEditor } from "../../js/hwpx-editor.mjs";
import { execFileSync } from "../../tools/oracle-process.mjs";
import { selectFieldPrefixOracle } from "../../tools/hwpx-field-prefix-oracle.mjs";
assert(process.env.HWPJS_TEST_WASM, "Explicit MEMO candidate required");
const wasm = readFileSync(process.env.HWPJS_TEST_WASM);
const source = readFileSync("reference/rhwp/samples/hwpx/aift.hwpx");
test("MEMO annotation and label edits coexist without original-subtree cache overriding current text", async () => {
  const e = await createHwpxEditor(wasm);
  try {
    e.open(source);
    e.enableHistory();
    assert.equal(e.canEdit(2, 3009), true);
    const comment = "주석😀",
      label = "라벨😀";
    e.splice(2, 3009, 0, 0, comment);
    const annotated = Buffer.from(e.save());
    const plain = {
      mode: "plain_text",
      before: source.toString("base64"),
      after: annotated.toString("base64"),
      section: 2,
      paragraph: 2695,
      text: comment,
    };
    for (const flags of [[], ["-O"]])
      execFileSync("python3", [...flags, "tools/hwpx-anchor-prefix-oracle.py"], {
        input: JSON.stringify(plain),
        timeout: 30000,
      });
    const target = e.fieldLabels(2, 3008)[0];
    assert(target);
    e.spliceFieldLabel(2, 3008, target.beginElement, 0, 0, label);
    const both = Buffer.from(e.save());
    const request = {
      before: annotated.toString("base64"),
      after: both.toString("base64"),
      section: 2,
      paragraph: 2694,
      beginId: "2135782115",
      text: label,
    };
    for (const flags of [[], ["-O"]])
      execFileSync("python3", [...flags, "tools/memo-label-oracle.py"], {
        input: JSON.stringify(request),
        timeout: 30000,
      });
    assert.equal(e.undo(), true);
    assert.deepEqual(Buffer.from(e.save()), annotated);
    assert.equal(e.undo(), true);
    assert.deepEqual(Buffer.from(e.save()), source);
    assert.equal(e.redo(), true);
    assert.deepEqual(Buffer.from(e.save()), annotated);
    assert.equal(e.redo(), true);
    assert.deepEqual(Buffer.from(e.save()), both);
  } finally {
    e.close();
  }
});
test("MEMO negative metadata never grants a label or loses pending redo", async () => {
  const probe = await createHwpxEditor(wasm);
  let begin;
  try {
    probe.open(source);
    begin = probe.fieldLabels(2, 3008)[0].beginElement;
  } finally {
    probe.close();
  }
  for (const mode of [
    "readonly",
    "missing-editable",
    "unknown-attribute",
    "unknown-child",
    "missing-parameters",
    "duplicate-sublist",
    "unclosed",
    "nested-bookmark",
  ]) {
    const mutated = Buffer.from(
      execFileSync("python3", ["tools/memo-label-mutate.py"], {
        input: JSON.stringify({ before: source.toString("base64"), mode }),
        encoding: "utf8",
        timeout: 30000,
        maxBuffer: 32 * 1024 * 1024,
      }).trim(),
      "base64",
    );
    const e = await createHwpxEditor(wasm);
    try {
      e.open(mutated);
      e.enableHistory();
      if (mode === "unclosed") {
        try {
          assert.deepEqual(e.fieldLabels(2, 3008), [], mode);
        } catch (error) {
          assert.match(error.message, /InvalidFieldLinks/);
        }
      } else assert.deepEqual(e.fieldLabels(2, 3008), [], mode);
      assert.deepEqual(Buffer.from(e.save()), mutated, mode);
      let seed;
      for (let p = 1; p < 80; p++)
        if (e.canEdit(0, p)) {
          seed = p;
          break;
        }
      assert(seed, "independent editable seed required");
      e.splice(0, seed, 0, 0, "seed");
      const changed = Buffer.from(e.save());
      assert.equal(e.undo(), true);
      assert.deepEqual(Buffer.from(e.save()), mutated);
      assert.throws(
        () => e.spliceFieldLabel(2, 3008, begin, 0, 0, "blocked"),
        mode === "unclosed"
          ? /InvalidFieldLinks|InvalidFieldElement/
          : /Unsupported(?:Nested)?FieldLabel/,
        mode,
      );
      assert.deepEqual(Buffer.from(e.save()), mutated, mode);
      assert.equal(e.redo(), true, mode);
      assert.deepEqual(Buffer.from(e.save()), changed, mode);
    } finally {
      e.close();
    }
  }
});
for (const [paragraph, local, beginId] of [
  [3008, 2694, "2135782115"],
  [3011, 2697, "2135782116"],
])
  test(`actual MEMO ${paragraph} label preserves independent annotation XML and complete ZIP`, async () => {
    const e = await createHwpxEditor(wasm);
    try {
      e.open(source);
      e.enableHistory();
      const labels = e.fieldLabels(2, paragraph);
      assert.equal(labels.length, 1);
      assert.equal(labels[0].start, 0);
      assert.deepEqual(Buffer.from(e.save()), source);
      const marker = "메모😀<&",
        target = labels[0];
      const selected = selectFieldPrefixOracle({
        before: source.toString("base64"),
        section: 2,
        paragraph: local,
        beginElement: target.beginElement,
      });
      assert.deepEqual(selected, { oracle: "tools/memo-label-oracle.py", beginId });
      e.spliceFieldLabel(2, paragraph, target.beginElement, 0, 0, marker);
      const saved = Buffer.from(e.save());
      const request = {
        before: source.toString("base64"),
        after: saved.toString("base64"),
        section: 2,
        paragraph: local,
        beginId,
        text: marker,
      };
      for (const flags of [[], ["-O"]]) {
        execFileSync("python3", [...flags, selected.oracle], {
          input: JSON.stringify({ ...request, mode: "prefix" }),
          timeout: 30000,
        });
        assert.throws(
          () =>
            execFileSync("python3", [...flags, "tools/memo-label-oracle.py"], {
              input: JSON.stringify({ ...request, text: "wrong" }),
              timeout: 30000,
            }),
          (x) => x.status === 1 && /complete XML mismatch/.test(String(x.stderr)),
        );
      }
      assert.throws(
        () => e.spliceFieldLabel(2, paragraph, target.beginElement, 3, 0, "X"),
        /SplitSurrogatePair/,
      );
      assert.deepEqual(Buffer.from(e.save()), saved);
      assert.equal(e.undo(), true);
      assert.deepEqual(Buffer.from(e.save()), source);
      assert.equal(e.redo(), true);
      assert.deepEqual(Buffer.from(e.save()), saved);
      const reopened = await createHwpxEditor(wasm);
      try {
        reopened.open(saved);
        const current = reopened.fieldLabels(2, paragraph);
        assert.equal(current.length, 1);
        assert.equal(current[0].end, target.end + marker.length);
        assert.deepEqual(Buffer.from(reopened.save()), saved);
      } finally {
        reopened.close();
      }
    } finally {
      e.close();
    }
  });
