import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from '../../tools/oracle-process.mjs';
import { partitionPageAreaOwnership } from '../../web/preview/page-area-ownership.mjs';
import { layoutPageAreas } from '../../web/preview/page-area-flow.mjs';

test(
  'actual nested page-area declarations retain independent XML owners and never select a duplicate footer arbitrarily',
  { skip: !process.env.HWPJS_TEST_WASM },
  async (t) => {
    const path = 'reference/rhwp/samples/issue6298/copay_cap_tac_table_leading.hwpx';
    const expected = JSON.parse(
      execFileSync(
        'python3',
        [
          '-B',
          '-c',
          `
import json,sys,zipfile,xml.etree.ElementTree as E
p="{http://www.hancom.co.kr/hwpml/2011/paragraph}"
root=E.fromstring(zipfile.ZipFile(sys.argv[1]).read("Contents/section0.xml"))
nodes=list(root.iter()); index={n:i for i,n in enumerate(nodes)}
parent={c:n for n in nodes for c in n}
paragraph={n:i for i,n in enumerate(root.iter(p+"p"))}
rows=[]
for n in nodes:
 if n.tag not in (p+"header",p+"footer"): continue
 host=n
 while host in parent and host not in paragraph: host=parent[host]
 lists=[x for x in n if x.tag==p+"subList"]
 if len(lists)!=1: raise ValueError("Expected one direct area list")
 rows.append(dict(host=n.tag.split("}")[-1],owner=index[n],list=index[lists[0]],
  declarationParagraph=paragraph[host],paragraphs=[paragraph[x] for x in lists[0] if x.tag==p+"p"],
  pictures=[index[x] for x in n.iter(p+"pic")],apply=n.get("applyPageType").lower()))
print(json.dumps(rows))
`,
          path,
        ],
        { encoding: 'utf8', timeout: 30000 },
      ),
    );
    assert.equal(expected.length, 3);
    assert.equal(expected.filter((row) => row.host === 'footer').length, 2);
    assert.deepEqual(
      expected.map((row) => row.declarationParagraph),
      [17, 955, 962],
    );
    const previousSelf = globalThis.self,
      previousFetch = globalThis.fetch,
      replies = [];
    globalThis.self = { postMessage: (reply) => replies.push(reply) };
    const wasm = readFileSync(process.env.HWPJS_TEST_WASM);
    globalThis.fetch = async () => new Response(wasm);
    t.after(() => {
      globalThis.self = previousSelf;
      globalThis.fetch = previousFetch;
    });
    await import('../../web/preview/reader-worker.mjs?page-area-source=' + Date.now());
    try {
      await self.onmessage({ data: { kind: 'load', format: 'hwpx', bytes: readFileSync(path) } });
      assert.equal(replies.length, 1);
      const reply = replies.shift();
      assert.equal(reply.error, undefined);
      const before = JSON.stringify(reply.content),
        partition = partitionPageAreaOwnership(reply.content);
      assert.equal(partition.state, 'partitioned', partition.error);
      assert.equal(partition.areas.length, expected.length);
      for (const source of expected) {
        const area = partition.areas.find((area) => area.area.owner_node === source.owner);
        assert.ok(area);
        assert.equal(area.host, source.host);
        assert.equal(area.area.list_node, source.list);
        assert.equal(area.area.apply, source.apply);
        assert.deepEqual(
          area.paragraphs.map((row) => row.paragraph),
          source.paragraphs,
        );
        assert.deepEqual(
          area.pictures.map((row) => row.pictureNode),
          source.pictures,
        );
        for (const picture of source.pictures)
          assert.ok(!partition.body.pictures.some((row) => row.pictureNode === picture));
      }
      const box = { x: 0, y: 0, width: 1000, height: 1000 };
      const repeated = layoutPageAreas(
        reply.content,
        [{ number: 1, ordinal: 0, header: box, footer: box }],
        (text) => ({ width: text.length * 8, height: 16 }),
      );
      assert.equal(repeated.error, 'AmbiguousPageAreaOwner');
      assert.equal(JSON.stringify(reply.content), before);
    } finally {
      await self.onmessage({ data: { kind: 'load', format: 'close-audit', bytes: [] } });
      assert.equal(replies.shift()?.error, 'UnknownDocumentFormat');
    }
  },
);
