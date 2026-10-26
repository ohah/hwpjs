import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { layoutPageContent } from '../../web/preview/page-content-layout.mjs';
import { createTextStyle } from '../../web/preview/text-style.mjs';

test('actual header/footer document retains repeated source owners through body edits and reopen', async (t) => {
  const wasm = readFileSync(process.env.HWPJS_TEST_WASM),
    previousSelf = globalThis.self,
    previousFetch = globalThis.fetch,
    replies = [];
  globalThis.self = { postMessage: (reply) => replies.push(reply) };
  globalThis.fetch = async () => new Response(wasm);
  t.after(() => {
    globalThis.self = previousSelf;
    globalThis.fetch = previousFetch;
  });
  await import('../../web/preview/reader-worker.mjs?page-area-layout=' + Date.now());
  const send = async (data) => {
    await self.onmessage({ data });
    assert.equal(replies.length, 1);
    const reply = replies.shift();
    assert.equal(reply.error, undefined);
    return reply;
  };
  const inspect = (content) => {
    const before = JSON.stringify(content),
      style = createTextStyle(content, '16px sans-serif');
    const layout = layoutPageContent(content, (text, p, unit, kind) => ({
      width: text.length * 8,
      height: style.textHeight(p, unit, kind),
    }));
    assert.equal(layout.state, 'paginated', layout.error);
    assert.equal(layout.limited, false);
    for (const flow of content.paragraphFlows.filter((f) =>
      ['header', 'footer'].includes(f.host),
    )) {
      const source = content.paragraphs.find(
        (p) => p.section === flow.section && p.paragraph === flow.paragraph,
      );
      const rows = layout.rows.filter(
        (row) => row.section === source.section && row.paragraph === source.paragraph,
      );
      assert.ok(rows.length);
      for (const page of layout.pages) {
        const actual = rows.filter((row) => row.pageOrdinal === page.ordinal);
        assert.equal(actual.map((row) => row.text).join(''), source.text);
        assert.ok(
          actual.every((row) => row.pageArea === flow.host && row.pageNumber === page.number),
        );
      }
    }
    assert.equal(JSON.stringify(content), before);
    return layout;
  };
  try {
    await send({
      kind: 'load',
      format: 'hwpx',
      bytes: readFileSync('legacy/rust/crates/hwp-core/tests/fixtures/headerfooter.hwpx'),
    });
    const original = (await send({ kind: 'enable' })).content;
    inspect(original);
    const split = await send({
      kind: 'split',
      origin: 'canvas',
      section: 0,
      paragraph: 1,
      atUnit: 0,
      deletedUnits: 0,
    });
    assert.deepEqual(split.splitTarget, { section: 0, paragraph: 4 });
    inspect(split.content);
    const changed = (
      await send({
        kind: 'splice',
        origin: 'canvas',
        section: 0,
        paragraph: 4,
        startUnit: 0,
        endUnit: 0,
        text: '새본문😀<&',
      })
    ).content;
    const layout = inspect(changed);
    assert.equal(
      layout.rows
        .filter((row) => row.paragraph === 4)
        .map((row) => row.text)
        .join(''),
      '새본문😀<&',
    );
    const saved = (await send({ kind: 'save' })).bytes;
    assert.deepEqual((await send({ kind: 'undo' })).content, split.content);
    assert.deepEqual((await send({ kind: 'redo' })).content, changed);
    await send({ kind: 'load', format: 'hwpx', bytes: saved });
    const restored = (await send({ kind: 'enable' })).content;
    inspect(restored);
    assert.deepEqual(
      restored.paragraphs.map((p) => [p.paragraph, p.text]),
      changed.paragraphs.map((p) => [p.paragraph, p.text]),
    );
    t.diagnostic(
      JSON.stringify({
        pages: layout.pages.length,
        areaRows: layout.rows.filter((row) => row.pageArea).length,
      }),
    );
  } finally {
    await self.onmessage({ data: { kind: 'load', format: 'close-audit', bytes: [] } });
    assert.equal(replies.shift()?.error, 'UnknownDocumentFormat');
    assert.equal(replies.length, 0);
  }
});
