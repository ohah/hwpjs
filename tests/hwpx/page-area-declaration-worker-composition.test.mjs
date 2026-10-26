import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from '../../tools/oracle-process.mjs';
import { layoutPageContent } from '../../web/preview/page-content-layout.mjs';
import { createTextStyle } from '../../web/preview/text-style.mjs';
import { trackedHwpxFiles } from '../../tools/hwpx-corpus-files.mjs';

test(
  'derived real HWPX duplicate footer declarations compose with fresh native coordinates through history',
  { skip: !process.env.HWPJS_TEST_WASM },
  async (t) => {
    const input = execFileSync(
      'python3',
      [
        '-B',
        '-c',
        `
import io,sys,zipfile,xml.etree.ElementTree as E
p="{http://www.hancom.co.kr/hwpml/2011/paragraph}"
source=zipfile.ZipFile(sys.argv[1]); output=io.BytesIO()
with zipfile.ZipFile(output,"w") as target:
 for item in source.infolist():
  data=source.read(item.filename)
  if item.filename=="Contents/section0.xml":
   root=E.fromstring(data); count=0
   for element in root.iter():
    if element.tag in (p+"header",p+"footer"):
     element.tag=p+"footer"; element.set("applyPageType","BOTH"); count+=1
   if count!=2: raise ValueError("Expected two source declarations")
   data=E.tostring(root,encoding="utf-8",xml_declaration=True)
  target.writestr(item,data)
sys.stdout.buffer.write(output.getvalue())
`,
        'legacy/rust/crates/hwp-core/tests/fixtures/headerfooter.hwpx',
      ],
      { timeout: 30000 },
    );
    const original = Buffer.from(input),
      wasm = readFileSync(process.env.HWPJS_TEST_WASM),
      exports = WebAssembly.Module.exports;
    assert.ok(
      exports(new WebAssembly.Module(wasm)).some(
        (row) => row.name === 'hwpx_edit_page_area_declarations',
      ),
    );
    const previousSelf = globalThis.self,
      previousFetch = globalThis.fetch,
      replies = [];
    let legacy = true;
    WebAssembly.Module.exports = (module) =>
      exports(module).filter((row) => !legacy || row.name !== 'hwpx_edit_page_area_declarations');
    globalThis.self = { postMessage: (reply) => replies.push(reply) };
    globalThis.fetch = async () => new Response(wasm);
    t.after(() => {
      WebAssembly.Module.exports = exports;
      globalThis.self = previousSelf;
      globalThis.fetch = previousFetch;
    });
    await import('../../web/preview/reader-worker.mjs?declared-footer-composition=' + Date.now());
    const send = async (data) => {
      await self.onmessage({ data });
      assert.equal(replies.length, 1);
      const reply = replies.shift();
      assert.equal(reply.error, undefined);
      return reply;
    };
    const inspect = (content) => {
      const before = JSON.stringify(content);
      const layout = layoutPageContent(content, (text) => ({ width: text.length * 8, height: 16 }));
      assert.equal(layout.state, 'paginated', layout.error);
      assert.equal(layout.pageAreaSelectionPolicy, 'rhwp-declaration-start');
      const flows = content.paragraphFlows.filter((row) => row.host === 'footer');
      const owners = [...new Set(flows.map((row) => row.page_area.owner_node))];
      assert.equal(owners.length, 2);
      const expected = flows
        .filter((row) => row.page_area.owner_node === owners.at(-1))
        .map((row) => row.paragraph);
      const rendered = [
        ...new Set(
          layout.rows.filter((row) => row.pageArea === 'footer').map((row) => row.paragraph),
        ),
      ];
      assert.deepEqual(rendered, expected);
      assert.equal(JSON.stringify(content), before);
      return layout;
    };
    try {
      const old = await send({ kind: 'load', format: 'hwpx', bytes: input });
      assert.equal(
        layoutPageContent(old.content, () => ({ width: 8, height: 16 })).error,
        'AmbiguousPageAreaOwner',
      );
      legacy = false;
      inspect((await send({ kind: 'load', format: 'hwpx', bytes: input })).content);
      const before = (await send({ kind: 'enable' })).content;
      inspect(before);
      const split = (
        await send({
          kind: 'split',
          origin: 'canvas',
          section: 0,
          paragraph: 1,
          atUnit: 0,
          deletedUnits: 0,
        })
      ).content;
      inspect(split);
      const undone = (await send({ kind: 'undo' })).content;
      inspect(undone);
      assert.deepEqual(undone.pageAreaDeclarations, before.pageAreaDeclarations);
      const redone = (await send({ kind: 'redo' })).content;
      inspect(redone);
      assert.deepEqual(redone.pageAreaDeclarations, split.pageAreaDeclarations);
      const saved = (await send({ kind: 'save' })).bytes;
      inspect((await send({ kind: 'load', format: 'hwpx', bytes: saved })).content);
      assert.deepEqual(input, original);
      let loaded = 0,
        refused = 0;
      for (const path of trackedHwpxFiles()) {
        await self.onmessage({ data: { kind: 'load', format: 'hwpx', bytes: readFileSync(path) } });
        assert.equal(replies.length, 1);
        const reply = replies.shift();
        if (reply.error) {
          assert.equal(reply.error, 'EncryptedDocument', path);
          refused++;
          continue;
        }
        const style = createTextStyle(reply.content, '16px sans-serif');
        const layout = layoutPageContent(reply.content, (text, p, u, k) => ({
          width: text.length * 8,
          height: style.textHeight(p, u, k),
        }));
        assert.equal(layout.state, 'paginated', path + ':' + layout.error);
        loaded++;
      }
      t.diagnostic(
        JSON.stringify({
          loaded,
          refused,
          scope: 'tracked fixed-metric page availability, not all editing or Hancom equality',
        }),
      );
    } finally {
      await self.onmessage({ data: { kind: 'load', format: 'close-audit', bytes: [] } });
    }
  },
);
