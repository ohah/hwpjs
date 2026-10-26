import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { layoutPageContent } from "../../web/preview/page-content-layout.mjs";
import { createTextStyle } from "../../web/preview/text-style.mjs";

const wasm = readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm");
const names = WebAssembly.Module.exports(new WebAssembly.Module(wasm));
const available = ["hwpx_edit_picture_caption", "hwpx_edit_picture_caption_bindings"].every(
  (name) => names.some((e) => e.name === name),
);
const reference = "reference/rhwp/samples/issue5543_carried_anchor_ladder.hwpx";

test(
  "real captioned picture document preserves full XML and drawing ownership through body edit history and reopen",
  { skip: !available || !existsSync(reference) },
  async (t) => {
    const priorSelf = globalThis.self,
      priorFetch = globalThis.fetch,
      replies = [];
    globalThis.self = { postMessage: (value) => replies.push(value) };
    globalThis.fetch = async () => new Response(wasm);
    t.after(async () => {
      try {
        if (typeof globalThis.self?.onmessage === "function")
          await self.onmessage({ data: { kind: "load", format: "close-audit", bytes: [] } });
      } finally {
        globalThis.self = priorSelf;
        globalThis.fetch = priorFetch;
      }
    });
    await import(`../../web/preview/reader-worker.mjs?captioned-roundtrip=${Date.now()}`);
    const send = async (data) => {
      await self.onmessage({ data });
      assert.equal(replies.length, 1);
      const reply = replies.shift();
      assert.equal(reply.error, undefined, JSON.stringify(reply));
      return reply;
    };
    const bytes = readFileSync(reference),
      original = await send({ kind: "load", format: "hwpx", bytes });
    const target = original.content.paragraphs.find((p) => p.section === 0 && p.paragraph === 30);
    const originalCaption = original.content.paragraphs.find(
      (p) => p.section === 0 && p.paragraph === 31,
    ).text;
    assert.equal(target.editable, true);
    const marker = "왕복검증😀";
    await send({ kind: "enable" });
    const edited = await send({
      kind: "splice",
      section: 0,
      paragraph: 30,
      startUnit: target.text.length,
      endUnit: target.text.length,
      text: marker,
    });
    const measureLayout = (content) => {
      const style = createTextStyle(content, "16px sans-serif");
      const result = layoutPageContent(content, (text, p, unit, kind) => ({
        width: text.length * 8,
        height: style.textHeight(p, unit, kind),
      }));
      assert.equal(result.state, "paginated", JSON.stringify(result));
      assert.equal(result.limited, false);
      const body = result.rows.filter((row) => row.section === 0 && row.paragraph === 30);
      assert.equal(body.map((row) => row.text).join(""), target.text + marker);
      const caption = content.paragraphs.find((p) => p.section === 0 && p.paragraph === 31);
      assert.equal(caption.text, originalCaption);
      assert.equal(
        result.rows
          .filter((row) => row.section === 0 && row.paragraph === 31)
          .map((row) => row.text)
          .join(""),
        caption.text,
      );
      assert.equal(
        result.flowPictures.filter(
          (p) => p.section === 0 && p.pictureNode === caption.drawingCaption.drawingNode,
        ).length,
        1,
      );
      assert.equal(result.tableCollisionFootprintErrors.length, 0);
      assert.equal(content.tables.length, original.content.tables.length);
      for (const row of result.rows.filter(
        (row) => row.kind === "text" && row.listNode !== undefined,
      )) {
        const owner = content.paragraphs.find(
          (p) => p.section === row.section && p.paragraph === row.paragraph,
        )?.tableCell;
        if (owner) {
          assert.equal(row.tableNode, owner.tableNode);
          assert.equal(row.listNode, owner.listNode);
        }
      }
      return result;
    };
    const editedLayout = measureLayout(edited.content);
    const saved = (await send({ kind: "save", allowStaleLayout: true })).bytes;
    execFileSync(
      "python3",
      [
        "-c",
        `
import io,sys,zipfile,xml.etree.ElementTree as E
old=zipfile.ZipFile(sys.argv[1]); new=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()))
assert old.namelist()==new.namelist() and old.comment==new.comment
assert old.testzip() is None and new.testzip() is None
part='Contents/section0.xml'; ns='{http://www.hancom.co.kr/hwpml/2011/paragraph}'
for name in old.namelist():
 if name!=part: assert old.read(name)==new.read(name),name
parser=lambda:E.XMLParser(target=E.TreeBuilder(insert_comments=True,insert_pis=True))
a=E.fromstring(old.read(part),parser=parser()); b=E.fromstring(new.read(part),parser=parser())
pa=list(a.iter(ns+'p'))[30]; pb=list(b.iter(ns+'p'))[30]; marker='왕복검증😀'
assert ''.join(b.itertext()).count(marker)==1
assert marker in ''.join(pb.itertext())
for node in pb.iter():
 if node.text: node.text=node.text.replace(marker,'')
 if node.tail: node.tail=node.tail.replace(marker,'')
for p in [pa,pb]:
 for node in list(p):
  if node.tag==ns+'linesegarray': p.remove(node)
def signature(node):
 return (node.tag,sorted(node.attrib.items()),node.text,node.tail,[signature(child) for child in node])
assert signature(a)==signature(b),'non-target XML or object ownership changed'
`,
        reference,
      ],
      { input: saved, timeout: 30000 },
    );
    await send({ kind: "undo" });
    assert.deepEqual(Buffer.from((await send({ kind: "save" })).bytes), bytes);
    const redone = await send({ kind: "redo" });
    measureLayout(redone.content);
    assert.deepEqual(
      Buffer.from((await send({ kind: "save", allowStaleLayout: true })).bytes),
      Buffer.from(saved),
    );
    const reopened = await send({ kind: "load", format: "hwpx", bytes: saved });
    const reopenedLayout = measureLayout(reopened.content);
    assert.equal(reopenedLayout.pages.length, editedLayout.pages.length);
    t.diagnostic(
      JSON.stringify({
        reference,
        pages: reopenedLayout.pages.length,
        rows: reopenedLayout.rows.length,
      }),
    );
  },
);
