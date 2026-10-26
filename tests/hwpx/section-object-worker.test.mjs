import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from '../../tools/oracle-process.mjs';
import { layoutPageContent } from '../../web/preview/page-content-layout.mjs';

async function sourceContent(t, name) {
  const previousSelf = globalThis.self,
    previousFetch = globalThis.fetch,
    replies = [];
  globalThis.self = { postMessage: (reply) => replies.push(reply) };
  globalThis.fetch = async () =>
    new Response(readFileSync(process.env.HWPJS_TEST_WASM ?? 'zig-out/bin/hwpjs.wasm'));
  t.after(async () => {
    try {
      await self.onmessage({ data: { kind: 'load', format: 'close-audit', bytes: [] } });
    } finally {
      globalThis.self = previousSelf;
      globalThis.fetch = previousFetch;
    }
  });
  await import('../../web/preview/reader-worker.mjs?section-owner=' + name + Date.now());
  await self.onmessage({
    data: {
      kind: 'load',
      format: 'hwpx',
      bytes: readFileSync(`legacy/rust/crates/hwp-core/tests/fixtures/${name}.hwpx`),
    },
  });
  const reply = replies.shift();
  assert.equal(reply.error, undefined);
  return reply.content;
}

function twoSections(source) {
  const result = structuredClone(source);
  for (const key of [
    'paragraphs',
    'paragraphFlows',
    'tables',
    'drawings',
    'pictures',
    'rectangles',
    'containers',
    'lines',
    'createdTables',
    'pageAreaDeclarations',
    'pageAreaDeclarationErrors',
  ])
    if (Array.isArray(source[key]))
      result[key] = [...source[key], ...source[key].map((row) => ({ ...row, section: 1 }))];
  result.pageSettings = [source.pageSettings[0], { ...source.pageSettings[0], section_ordinal: 1 }];
  return result;
}

test('real table Worker content duplicated into two scopes retains overlapping local cell IDs', async (t) => {
  const source = await sourceContent(t, 'table2'),
    content = twoSections(source),
    before = structuredClone(content);
  const result = layoutPageContent(content, () => ({ width: 8, height: 16 }));
  assert.equal(result.state, 'paginated', result.error);
  for (const section of [0, 1]) {
    assert.ok(result.pages.some((page) => page.section === section));
    for (const table of source.tables)
      for (const cell of table.cells) {
        const boxes = result.boxes.filter(
          (box) =>
            box.section === section &&
            box.tableNode === table.tableNode &&
            box.listNode === cell.listNode,
        );
        assert.equal(boxes.length, 1);
        for (const paragraph of cell.paragraphs) {
          const text = source.paragraphs.find((p) => p.paragraph === paragraph).text;
          assert.equal(
            result.rows
              .filter(
                (row) =>
                  row.section === section && row.paragraph === paragraph && row.kind === 'text',
              )
              .map((row) => row.text)
              .join(''),
            text,
          );
        }
      }
  }
  for (const box of result.boxes)
    assert.deepEqual(box.referenceBoxes.paper, result.pages[box.pageOrdinal].paper);
  assert.deepEqual(content, before);
});

test('real header/footer coordinates in two display scopes bind only to their own section', async (t) => {
  const content = twoSections(await sourceContent(t, 'headerfooter')),
    before = structuredClone(content);
  const result = layoutPageContent(content, () => ({ width: 8, height: 16 }));
  assert.equal(result.state, 'paginated', result.error);
  assert.deepEqual([...new Set(result.pageAreaDeclarationPages.map((d) => d.section))], [0, 1]);
  for (const row of result.rows.filter((row) => row.pageArea)) {
    assert.equal(result.pages[row.pageOrdinal].section, row.section);
    assert.deepEqual(row.referenceBoxes.paper, result.pages[row.pageOrdinal].paper);
  }
  assert.deepEqual(content, before);
});

test('actual two-section file edits section one with independent whole ZIP/XML verification', async (t) => {
  const input = readFileSync('legacy/rust/crates/hwp-core/tests/fixtures/lists.hwpx');
  await sourceContent(t, 'lists');
  const replies = [];
  self.postMessage = (reply) => replies.push(reply);
  const send = async (data) => {
    await self.onmessage({ data });
    assert.equal(replies.length, 1);
    const reply = replies.shift();
    assert.equal(reply.error, undefined);
    return reply;
  };
  const original = (await send({ kind: 'enable' })).content;
  const target = original.paragraphs.find(
    (p) => p.section === 1 && p.plainEditable && p.text.length && !p.text.includes('\ufffc'),
  );
  assert.ok(target);
  assert.equal(original.pageSettings.length, 2);
  const marker = '구역검증😀',
    texts = (content) => content.paragraphs.map((p) => [p.section, p.paragraph, p.text]);
  const inspect = (content) => {
    const layout = layoutPageContent(content, () => ({ width: 8, height: 16 }));
    assert.equal(layout.state, 'paginated', layout.error);
    for (const row of layout.rows) assert.equal(layout.pages[row.pageOrdinal].section, row.section);
  };
  inspect(original);
  const changed = (
    await send({
      kind: 'splice',
      origin: 'canvas',
      section: 1,
      paragraph: target.paragraph,
      startUnit: 0,
      endUnit: 0,
      text: marker,
    })
  ).content;
  inspect(changed);
  const saved = (await send({ kind: 'save' })).bytes;
  const payload = {
    before: input.toString('base64'),
    after: Buffer.from(saved).toString('base64'),
    section: 1,
    paragraph: target.paragraph + 1,
    paragraphScope: 'document',
    text: marker,
    mode: 'direct_text',
  };
  for (const flags of [[], ['-O']]) {
    execFileSync('python3', [...flags, 'tools/hwpx-anchor-prefix-oracle.py'], {
      input: JSON.stringify(payload),
      timeout: 30000,
    });
    assert.throws(
      () =>
        execFileSync('python3', [...flags, 'tools/hwpx-anchor-prefix-oracle.py'], {
          input: JSON.stringify({ ...payload, text: 'wrong' }),
          timeout: 30000,
        }),
      (error) => error.status === 1 && /complete XML mismatch/.test(String(error.stderr)),
    );
  }
  assert.deepEqual(texts((await send({ kind: 'undo' })).content), texts(original));
  assert.deepEqual(texts((await send({ kind: 'redo' })).content), texts(changed));
  await send({ kind: 'load', format: 'hwpx', bytes: saved });
  const reopened = (await send({ kind: 'enable' })).content;
  assert.deepEqual(texts(reopened), texts(changed));
  inspect(reopened);
  assert.deepEqual(readFileSync('legacy/rust/crates/hwp-core/tests/fixtures/lists.hwpx'), input);
});
