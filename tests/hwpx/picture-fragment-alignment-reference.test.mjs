import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { layoutPageContent } from '../../web/preview/page-content-layout.mjs';
import { createTextStyle } from '../../web/preview/text-style.mjs';

test(
  'actual picture reservation remeasures fragment alignment without propagating carrier warnings',
  { skip: !process.env.HWPJS_TEST_WASM },
  async (t) => {
    const previousSelf = globalThis.self,
      previousFetch = globalThis.fetch,
      replies = [];
    const wasm = readFileSync(process.env.HWPJS_TEST_WASM);
    globalThis.self = { postMessage: (reply) => replies.push(reply) };
    globalThis.fetch = async () => new Response(wasm);
    t.after(() => {
      globalThis.self = previousSelf;
      globalThis.fetch = previousFetch;
    });
    await import('../../web/preview/reader-worker.mjs?fragment-alignment=' + Date.now());
    try {
      await self.onmessage({
        data: {
          kind: 'load',
          format: 'hwpx',
          bytes: readFileSync('reference/rhwp/samples/issue5543_carried_anchor_ladder.hwpx'),
        },
      });
      const reply = replies.shift();
      assert.equal(reply.error, undefined);
      const content = reply.content,
        before = JSON.stringify(content),
        style = createTextStyle(content, '16px sans-serif');
      const layout = layoutPageContent(content, (text, p, unit, kind) => ({
        width: text.length * 8,
        height: style.textHeight(p, unit, kind),
      }));
      assert.equal(layout.state, 'paginated', layout.error);
      assert.equal(layout.pages.length, 5);
      const unsupported = layout.rows.filter((row) => row.alignmentUnavailable);
      assert.equal(unsupported.length, 1);
      assert.ok(unsupported.every((row) => /[\t\ufffc]/u.test(row.text)));
      const fragments = layout.rows.filter(
        (row) => row.paragraph === 30 && row.kind === 'text' && !/[\t\ufffc]/u.test(row.text),
      );
      assert.ok(fragments.length > 1);
      assert.ok(fragments.every((row) => !row.alignmentUnavailable));
      assert.equal(JSON.stringify(content), before);
      t.diagnostic(
        JSON.stringify({
          pages: layout.pages.length,
          rows: layout.rows.length,
          unsupported: unsupported.length,
        }),
      );
    } finally {
      await self.onmessage({ data: { kind: 'load', format: 'close-audit', bytes: [] } });
    }
  },
);
