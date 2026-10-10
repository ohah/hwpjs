import assert from "node:assert/strict";
import test from "node:test";
import { trackedHwpxFiles } from "../../tools/hwpx-corpus-files.mjs";
import { readFileSync } from "node:fs";

test("actual Worker advertises all HWPX channels and edits every anchor and field candidate with history", async t => {
  const previousSelf = globalThis.self, previousFetch = globalThis.fetch, replies = [];
  globalThis.self = { postMessage(value) { replies.push(value); } };
  globalThis.fetch = async () => new Response(readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm"));
  t.after(() => { globalThis.fetch = previousFetch; if (previousSelf === undefined) delete globalThis.self; else globalThis.self = previousSelf; });
  await import(`../../web/preview/reader-worker.mjs?fixture-channels=${Date.now()}`);
  const paths = trackedHwpxFiles();
  assert(paths.length > 0);
  const totals = { paragraphs: 0, plain: 0, anchor: 0, field: 0, protected: 0, encrypted: 0 };
  let fieldCommands = 0, anchorCommands = 0;
  const send = async data => {
    await self.onmessage({ data }); assert.equal(replies.length, 1);
    const result = replies.shift(); assert.equal(result.error, undefined, JSON.stringify(result)); return result;
  };
  for (const path of paths) {
    const source = readFileSync(path), before = Buffer.from(source);
    await self.onmessage({ data: { kind: "load", format: "hwpx", bytes: source, origin: path } });
    assert.equal(replies.length, 1); const reply = replies.shift();
    assert.equal(reply.origin, path); assert.deepEqual(source, before);
    if (path.endsWith("/password-12345.hwpx")) {
      assert.equal(reply.error, "EncryptedDocument"); assert.equal(reply.passwordRequired, true);
      totals.encrypted++; continue;
    }
    assert.equal(reply.error, undefined, path); assert.equal(reply.content.limited, false, path);
    for (const paragraph of reply.content.paragraphs) {
      totals.paragraphs++;
      assert.equal(paragraph.editable, paragraph.plainEditable || paragraph.anchorEditable || paragraph.fieldLabels.length > 0);
      if (paragraph.plainEditable) totals.plain++;
      else if (paragraph.anchorEditable) totals.anchor++;
      else if (paragraph.fieldLabels.length) totals.field++;
      else {
        totals.protected++; assert(path.endsWith("/chart.hwpx"));
        assert([23, 29, 35, 64, 70, 76, 129, 130, 131, 132, 156, 162, 168].includes(paragraph.paragraph));
      }
    }
    const fields = reply.content.paragraphs.filter(p => !p.plainEditable && !p.anchorEditable && p.fieldLabels.length > 0);
    const anchors = reply.content.paragraphs.filter(p => p.anchorEditable);
    if (fields.length || anchors.length) {
      await send({ kind: "enable" });
      for (const paragraph of fields) {
        const label = paragraph.fieldLabels[0], marker = "Worker필드😀";
        const edited = await send({ kind: "splice", section: paragraph.section, paragraph: paragraph.paragraph, startUnit: label.start, endUnit: label.start, text: marker });
        assert(edited.content.paragraphs.find(p => p.section === paragraph.section && p.paragraph === paragraph.paragraph).text.includes(marker));
        const changed = await send({ kind: "save" }); assert.notDeepEqual(Buffer.from(changed.bytes), source);
        const undo = await send({ kind: "undo" }); assert.equal(undo.changed, true);
        assert.deepEqual(Buffer.from((await send({ kind: "save" })).bytes), source);
        const redo = await send({ kind: "redo" }); assert.equal(redo.changed, true);
        assert.deepEqual((await send({ kind: "save" })).bytes, changed.bytes);
        await send({ kind: "undo" });
        assert.deepEqual(Buffer.from((await send({ kind: "save" })).bytes), source);
        fieldCommands++;
      }
      for (const paragraph of anchors) {
        const marker = "Worker앵커😀", end = paragraph.text.length;
        const edited = await send({ kind: "splice", section: paragraph.section, paragraph: paragraph.paragraph, startUnit: end, endUnit: end, text: marker });
        assert.equal(edited.content.paragraphs.find(p => p.section === paragraph.section && p.paragraph === paragraph.paragraph).text, paragraph.text + marker);
        const changed = await send({ kind: "save" });
        assert.notDeepEqual(Buffer.from(changed.bytes), source);
        assert.equal((await send({ kind: "undo" })).changed, true);
        assert.deepEqual(Buffer.from((await send({ kind: "save" })).bytes), source);
        assert.equal((await send({ kind: "redo" })).changed, true);
        assert.deepEqual((await send({ kind: "save" })).bytes, changed.bytes);
        await send({ kind: "undo" });
        assert.deepEqual(Buffer.from((await send({ kind: "save" })).bytes), source);
        anchorCommands++;
      }
    }
  }
  assert.deepEqual(totals, { paragraphs: 1444, plain: 1278, anchor: 146, field: 7, protected: 13, encrypted: 1 });
  assert.equal(fieldCommands, 7);
  assert.equal(anchorCommands, 146);
});
