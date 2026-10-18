import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHwpxEditor} from "../../js/hwpx-editor.mjs";
import {execFileSync} from "../../tools/oracle-process.mjs";
test("actual title metadata and BOOKMARK expose only the existing field label", async () => {
  assert(process.env.HWPJS_TEST_WASM, "ExplicitTitleFieldCandidateRequired");
  const input = readFileSync("reference/rhwp/samples/추진일정.hwpx");
  const editor = await createHwpxEditor(readFileSync(process.env.HWPJS_TEST_WASM));
  try {
    editor.open(input); editor.enableHistory();
    assert.equal(editor.canEdit(0,1), false);
    const labels = editor.fieldLabels(0,1);
    assert.equal(labels.length,1);
    assert.equal(labels[0].start,0);
    const marker = "제목책갈피😀<&";
    editor.spliceFieldLabel(0,1,labels[0].beginElement,0,0,marker);
    const saved = Buffer.from(editor.save());
    const request = {before:input.toString("base64"),after:saved.toString("base64"),section:0,paragraph:1,beginId:"1126376209",text:marker};
    for (const flags of [[],["-O"]]) {
      execFileSync("python3",[...flags,"tools/title-field-oracle.py"],{input:JSON.stringify(request),timeout:30000});
      assert.throws(()=>execFileSync("python3",[...flags,"tools/title-field-oracle.py"],{input:JSON.stringify({...request,text:"wrong"}),timeout:30000}),error=>error.status===1&&/Unexpected XML change/.test(String(error.stderr)));
    }
    assert.throws(()=>editor.spliceFieldLabel(0,1,labels[0].beginElement,6,0,"X"),/SplitSurrogatePair/);
    assert.throws(()=>editor.spliceFieldLabel(0,1,labels[0].beginElement,0,0,"\u0000"),/InvalidXmlCharacter/);
    assert.deepEqual(Buffer.from(editor.save()),saved);
    assert.equal(editor.undo(),true);assert.deepEqual(Buffer.from(editor.save()),input);
    editor.spliceFieldLabel(0,1,labels[0].beginElement,0,0,"");
    assert.deepEqual(Buffer.from(editor.save()),input);
    assert.equal(editor.redo(),true);assert.deepEqual(Buffer.from(editor.save()),saved);
    editor.open(saved);
    assert.equal(editor.fieldLabels(0,1)[0].end,labels[0].end+marker.length);
    assert.deepEqual(Buffer.from(editor.save()),saved);
  } finally {editor.close();}
});

test("title field malformed metadata and unknown controls keep pending redo intact", async () => {
  assert(process.env.HWPJS_TEST_WASM, "ExplicitTitleFieldCandidateRequired");
  const input = readFileSync("reference/rhwp/samples/추진일정.hwpx");
  const editor = await createHwpxEditor(readFileSync(process.env.HWPJS_TEST_WASM));
  try {
    editor.open(input);
    const begin = editor.fieldLabels(0,1)[0].beginElement;
    for (const mode of ["unknown-field", "unknown-control", "malformed-title", "unknown-run-control"]) {
      const changed = Buffer.from(execFileSync("python3", ["tools/title-field-mutate.py"], {
        input: JSON.stringify({before:input.toString("base64"),mode}), encoding:"utf8",timeout:30000
      }).trim(), "base64");
      editor.open(changed);editor.enableHistory();
      assert.deepEqual(editor.fieldLabels(0,1),[],mode);
      assert.equal(editor.canEdit(0,1),false,mode);
      let seed;
      for(let p=2;p<20;p++) if(editor.canEdit(0,p)){seed=p;break;}
      assert(seed,"Independent plain paragraph required");
      editor.splice(0,seed,0,0,"seed");const saved=Buffer.from(editor.save());
      assert.equal(editor.undo(),true);
      assert.throws(()=>editor.spliceFieldLabel(0,1,begin,0,0,"bad"),/Unsupported|InvalidFieldElement/,mode);
      assert.deepEqual(Buffer.from(editor.save()),changed,mode);
      assert.equal(editor.redo(),true,mode);
      assert.deepEqual(Buffer.from(editor.save()),saved,mode);
    }
  } finally {editor.close();}
});
