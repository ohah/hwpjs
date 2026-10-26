import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
// @ts-ignore Existing shared JavaScript helper.
import { characterRangeValues } from "../../../../web/preview/character-range-values.mjs";
// @ts-ignore Existing canonical UTF-16 helper.
import { isUtf16Boundary } from "../../../../web/preview/utf16-boundary.mjs";
const content = (text: string) => ({
  paragraphs: [
    {
      section: 0,
      paragraph: 1,
      text,
      characterRanges: [
        { start: 0, end: 1, charShapeId: 0 },
        { start: 1, end: 2, charShapeId: 1 },
        { start: 2, end: text.length, charShapeId: 0 },
      ],
    },
  ],
});
test("default web policy stays grapheme-safe; explicit scalar accepts supported ranges", () => {
  for (const text of ["A\u0301B", "한X"]) {
    const c = content(text),
      range = { section: 0, paragraph: 1, startUnit: 1, endUnit: 2 };
    assert.equal(
      characterRangeValues(c, [range], () => 0),
      null,
    );
    assert.deepEqual(
      characterRangeValues(c, [range], () => 0, { isBoundary: isUtf16Boundary }),
      [0],
    );
  }
  const c = content("abc"),
    r = { section: 0, paragraph: 1, startUnit: 1, endUnit: 2 };
  assert.deepEqual(
    characterRangeValues(c, [r], () => 0),
    [0],
  );
});
test("scalar SSOT agrees with existing public admission for all positions", () => {
  for (const text of ["", "abc", "A\u0301B", "한X", "a😀b", "👩‍💻X"])
    for (let unit = 0; unit <= text.length; unit++) {
      const previous = text.charCodeAt(unit - 1),
        current = text.charCodeAt(unit);
      const prior = !(
        previous >= 0xd800 &&
        previous <= 0xdbff &&
        current >= 0xdc00 &&
        current <= 0xdfff
      );
      assert.equal(isUtf16Boundary(text, unit), prior);
    }
  for (const unit of [-1, 0.5, NaN, Infinity, 99])
    assert.equal(isUtf16Boundary("abc", unit), false);
});
test("fresh missing Intl/Segmenter leaves scalar color usable, default web capability error explicit", () => {
  for (const missing of ["Intl", "Segmenter"]) {
    const helper = new URL("../../src/state/text-color-state.ts", import.meta.url).href,
      coverage = new URL("../../../../web/preview/character-range-values.mjs", import.meta.url)
        .href;
    const code = `(async()=>{${missing === "Intl" ? "globalThis.Intl=undefined;" : "globalThis.Intl.Segmenter=undefined;"}const assert=(await import('node:assert/strict')).default;const {characterTextColorState}=await import(${JSON.stringify(helper)});const {characterRangeValues}=await import(${JSON.stringify(coverage)});const p={section:0,paragraph:1,text:'A\\u0301B',characterRanges:[{start:0,end:3,charShapeId:0}]};const c={paragraphs:[p],characterTextColorAvailable:true,characterTextColors:[{id:0,color:0}]};assert.equal(characterTextColorState(c,p,1,2),'#000000');assert.throws(()=>characterRangeValues(c,[{section:0,paragraph:1,startUnit:1,endUnit:2}],()=>0),/IntlSegmenterUnavailable/);})().catch(e=>{console.error(e);process.exitCode=1});`;
    const r = spawnSync(process.execPath, ["-e", code], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr || r.stdout);
  }
});
// Existing size read values and default web policy remain unchanged.
test("size default matches r2 web behavior; only explicit scalar admits cluster interiors", async () => {
  // @ts-ignore Existing shared JavaScript size query.
  const { characterSizeState } =
    await import("../../../../web/preview/character-size-selection.mjs");
  const { characterSizeState: baseline } =
    await import("../../../../web/preview/character-size-selection.mjs");
  for (const text of ["abc", "A\u0301B", "한X", "a😀b"]) {
    const p = {
      section: 0,
      paragraph: 1,
      text,
      characterRanges: [{ start: 0, end: text.length, charShapeId: 0 }],
    };
    const c = {
      paragraphs: [p],
      characterPropertiesAvailable: true,
      characterShapes: [{ id: 0, height: 1000 }],
    };
    for (let start = 0; start < text.length; start++)
      for (let end = start + 1; end <= text.length; end++)
        assert.equal(characterSizeState(c, p, start, end), baseline(c, p, start, end));
    if (text === "A\u0301B" || text === "한X") {
      assert.equal(characterSizeState(c, p, 1, 2), null);
      assert.equal(characterSizeState(c, p, 1, 2, { isBoundary: isUtf16Boundary }), 1000);
    }
  }
});
test("fresh noIntl public full formatting projection exposes scalar color and size", () => {
  for (const missing of ["Intl", "Segmenter"]) {
    const url = new URL("../../src/index.ts", import.meta.url).href;
    const code = `(async()=>{${missing === "Intl" ? "globalThis.Intl=undefined;" : "globalThis.Intl.Segmenter=undefined;"}const assert=(await import('node:assert/strict')).default;const {EditorState,getSelectionFormatting}=await import(${JSON.stringify(url)});const token={editorId:'test',documentId:'d',generation:1,operationRevision:1,viewRevision:1};const p={section:0,paragraph:1,text:'A\\u0301B',selectionOwner:'section:0:body',editable:true,characterRanges:[{start:0,end:3,charShapeId:0}]};const state=new EditorState({...token,status:'ready',stateVersion:1,selection:{...token,format:'hwpx',coordinateSpace:'display',owner:p.selectionOwner,section:0,paragraph:1,startUnit:1,endUnit:2,affinity:'forward'},content:{format:'hwpx',paragraphs:[p],characterPropertiesAvailable:true,characterTextColorAvailable:true,characterTextColors:[{id:0,color:0}],characterShapes:[{id:0,height:1000,bold:false,italic:false}]}});const f=getSelectionFormatting(state);assert.equal(f.textColor,'#000000');assert.equal(f.size,1000);assert.equal(f.characterAvailableReason,null);})().catch(e=>{console.error(e);process.exitCode=1});`;
    const r = spawnSync(process.execPath, ["-e", code], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr || r.stdout);
  }
});
