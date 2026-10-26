import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHwpxEditor } from "../../js/hwpx-editor.mjs";
import { dutmalKind } from "../../js/hwpx-dutmal-kind.mjs";
import { execFileSync } from "../../tools/oracle-process.mjs";

test("dutmal public kind discriminator rejects coercion and unknown spellings", () => {
  assert.equal(dutmalKind("mainText"), 0);
  assert.equal(dutmalKind("subText"), 1);
  for (const value of [0, 1, true, null, undefined, "main_text", "mainText ", "subText\0", {}])
    assert.throws(() => dutmalKind(value), /InvalidDutmalTextKind/);
});

test("actual dutmal main sub editing preserves source snapshot and independent undo redo", async () => {
  assert(process.env.HWPJS_TEST_WASM, "explicit dutmal text API candidate required");
  const input = readFileSync(
    "reference/rhwp/samples/hwpx/opengov/36389301_결재문서본문_직장훈련계획_덧말.hwpx",
  );
  const editor = await createHwpxEditor(readFileSync(process.env.HWPJS_TEST_WASM));
  try {
    editor.open(input);
    editor.enableHistory();
    const source = editor.inlineStringSources();
    const node = source.controls.find((row) => row.kind === "dutmal").element_index;
    assert.equal(editor.dutmalText(0, node, "mainText"), "팀단위 훈련");
    assert.equal(editor.dutmalText(0, node, "subText"), "전술훈련 30% + 현지훈련 20%");
    editor.setDutmalText(0, node, "mainText", "본문😀<&");
    assert.equal(editor.dutmalText(0, node, "mainText"), "본문😀<&");
    assert.deepEqual(editor.inlineStringSources(), source);
    const mainSaved = Buffer.from(editor.save());
    editor.setDutmalText(0, node, "subText", "주석😀<&");
    assert.equal(editor.dutmalText(0, node, "subText"), "주석😀<&");
    const bothSaved = Buffer.from(editor.save());
    const request = {
      before: input.toString("base64"),
      after: bothSaved.toString("base64"),
      mainText: "본문😀<&",
      subText: "주석😀<&",
    };
    for (const flags of [[], ["-O"]]) {
      const verify = (value) =>
        execFileSync("python3", [...flags, "tools/hwpx-dutmal-text-oracle.py"], {
          input: JSON.stringify(value),
          timeout: 30000,
        });
      verify(request);
      assert.throws(
        () => verify({ ...request, mainText: "wrong" }),
        (error) => error.status === 1 && /complete XML mismatch/.test(String(error.stderr)),
      );
      assert.throws(
        () => verify({ ...request, subText: "wrong" }),
        (error) => error.status === 1 && /complete XML mismatch/.test(String(error.stderr)),
      );
    }
    assert.equal(editor.undo(), true);
    assert.deepEqual(Buffer.from(editor.save()), mainSaved);
    editor.setDutmalText(0, node, "subText", "전술훈련 30% + 현지훈련 20%");
    assert.throws(() => editor.setDutmalText(0, node, "subText", "bad\0"), /InvalidXmlCharacter/);
    assert.throws(() => editor.setDutmalText(0, node, "main_text", "bad"), /InvalidDutmalTextKind/);
    assert.equal(editor.redo(), true);
    assert.deepEqual(Buffer.from(editor.save()), bothSaved);
    assert.equal(editor.undo(), true);
    assert.equal(editor.undo(), true);
    assert.deepEqual(Buffer.from(editor.save()), input);
    assert.equal(editor.redo(), true);
    assert.equal(editor.redo(), true);
    editor.open(bothSaved);
    const reopenedNode = editor
      .inlineStringSources()
      .controls.find((row) => row.kind === "dutmal").element_index;
    assert.equal(editor.dutmalText(0, reopenedNode, "mainText"), "본문😀<&");
    assert.equal(editor.dutmalText(0, reopenedNode, "subText"), "주석😀<&");
  } finally {
    editor.close();
  }
});

test("reference-derived empty and CDATA dutmal leaves preserve ZIP and redo", async () => {
  assert(process.env.HWPJS_TEST_WASM, "explicit dutmal text API candidate required");
  const original = readFileSync(
    "reference/rhwp/samples/hwpx/opengov/36389301_결재문서본문_직장훈련계획_덧말.hwpx",
  );
  const mutate = `import base64,io,json,sys,zipfile,re
d=json.load(sys.stdin)
source=zipfile.ZipFile(io.BytesIO(base64.b64decode(d['bytes'])))
out=io.BytesIO()
with zipfile.ZipFile(out,'w') as target:
 target.comment=source.comment
 for info in source.infolist():
  content=source.read(info)
  if info.filename=='Contents/section0.xml':
   replacement=b'<hp:mainText/>' if d['mode']=='empty' else '<hp:mainText><![CDATA[본문😀<&]]></hp:mainText>'.encode()
   content,count=re.subn(rb'<hp:mainText>.*?</hp:mainText>',lambda _:replacement,content,flags=re.S)
   if count!=1:raise ValueError('fixture main leaf count')
  target.writestr(info,content)
print(base64.b64encode(out.getvalue()).decode())`;
  for (const mode of ["empty", "cdata"]) {
    const input = Buffer.from(
      execFileSync("python3", ["-c", mutate], {
        input: JSON.stringify({ bytes: original.toString("base64"), mode }),
        encoding: "utf8",
        timeout: 30000,
      }).trim(),
      "base64",
    );
    const editor = await createHwpxEditor(readFileSync(process.env.HWPJS_TEST_WASM));
    try {
      editor.open(input);
      editor.enableHistory();
      const node = editor
        .inlineStringSources()
        .controls.find((row) => row.kind === "dutmal").element_index;
      const baseline = mode === "empty" ? "" : "본문😀<&";
      assert.equal(editor.dutmalText(0, node, "mainText"), baseline);
      editor.setDutmalText(0, node, "mainText", baseline);
      assert.deepEqual(
        Buffer.from(editor.save()),
        input,
        "normalized no-op preserves source representation",
      );
      assert.equal(editor.undo(), false);
      editor.setDutmalText(0, node, "mainText", "새 값😀<&");
      const saved = Buffer.from(editor.save());
      for (const flags of [[], ["-O"]])
        execFileSync("python3", [...flags, "tools/hwpx-dutmal-text-oracle.py"], {
          input: JSON.stringify({
            before: input.toString("base64"),
            after: saved.toString("base64"),
            mainText: "새 값😀<&",
          }),
          timeout: 30000,
        });
      assert.equal(editor.undo(), true);
      assert.deepEqual(Buffer.from(editor.save()), input);
      editor.setDutmalText(0, node, "mainText", baseline);
      assert.equal(editor.redo(), true);
      assert.deepEqual(Buffer.from(editor.save()), saved);
      editor.open(saved);
      const reopened = editor
        .inlineStringSources()
        .controls.find((row) => row.kind === "dutmal").element_index;
      assert.equal(editor.dutmalText(0, reopened, "mainText"), "새 값😀<&");
    } finally {
      editor.close();
    }
  }
});
