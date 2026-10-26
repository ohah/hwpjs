import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { layoutPageContent } from '../../web/preview/page-content-layout.mjs';
import { partitionPageAreaOwnership } from '../../web/preview/page-area-ownership.mjs';
import { createTextStyle } from '../../web/preview/text-style.mjs';

test('real declaration pages select complete text without leaking inactive footer objects', async (t) => {
  const path = 'reference/rhwp/samples/issue6298/copay_cap_tac_table_leading.hwpx';
  if (!existsSync(path)) {
    t.skip('reference fixture unavailable');
    return;
  }
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
  await import('../../web/preview/reader-worker.mjs?area-objects=' + Date.now());
  await self.onmessage({ data: { kind: 'load', format: 'hwpx', bytes: readFileSync(path) } });
  const reply = replies.shift();
  assert.equal(reply.error, undefined);
  const content = reply.content,
    before = structuredClone(content);
  assert.deepEqual(content.pageAreaDeclarationErrors, []);
  const partition = partitionPageAreaOwnership(content);
  assert.equal(partition.state, 'partitioned', partition.error);
  const style = createTextStyle(content, '16px sans-serif');
  const result = layoutPageContent(content, (text, p, u, k) => ({
    width: text.length * 8,
    height: style.textHeight(p, u, k),
  }));
  assert.equal(result.state, 'paginated', result.error);
  assert.equal(result.pageAreaSelectionPolicy, 'rhwp-declaration-start');
  // Compute each activation page from actual body rows, without the production binder/selector.
  const declarations = content.pageAreaDeclarations.map((declaration) => {
    const candidates = result.rows.filter(
      (row) =>
        !row.pageArea &&
        row.kind === 'text' &&
        row.section === declaration.section &&
        row.paragraph === declaration.paragraph &&
        row.startUnit <= declaration.unit &&
        declaration.unit <= row.endUnit,
    );
    const pages = [...new Set(candidates.map((row) => row.pageOrdinal))];
    assert.equal(pages.length, 1);
    const area = partition.areas.find(
      (area) =>
        area.section === declaration.section && area.area.owner_node === declaration.sourceElement,
    );
    assert.ok(area);
    return { ...declaration, area, page: pages[0] };
  });
  let selectedObjects = 0,
    selectedParagraphs = 0;
  for (const page of result.pages)
    for (const host of ['header', 'footer']) {
      const active = declarations.filter(
        (d) => d.section === page.section && d.area.host === host && d.page <= page.ordinal,
      );
      const specific = active
        .filter((d) => d.area.area.apply === (page.number % 2 ? 'odd' : 'even'))
        .at(-1);
      const selected = specific ?? active.filter((d) => d.area.area.apply === 'both').at(-1);
      const hidden =
        host === 'header'
          ? page.hideHeader || page.hideFirstHeader
          : page.hideFooter || page.hideFirstFooter;
      const rows = result.rows.filter(
        (row) => row.pageOrdinal === page.ordinal && row.pageArea === host,
      );
      if (!selected || hidden) {
        assert.equal(rows.length, 0);
        continue;
      }
      const area = selected.area;
      for (const p of area.paragraphs) {
        assert.equal(
          rows
            .filter((row) => row.section === p.section && row.paragraph === p.paragraph)
            .map((row) => row.text)
            .join(''),
          p.text,
          `page ${page.ordinal} paragraph ${p.paragraph}`,
        );
        selectedParagraphs++;
      }
      for (const table of area.tables)
        for (const cell of table.cells) {
          const boxes = result.boxes.filter(
            (box) =>
              box.section === table.section &&
              box.tableNode === table.tableNode &&
              box.listNode === cell.listNode &&
              box.pageOrdinal === page.ordinal &&
              box.pageArea === host,
          );
          assert.equal(boxes.length, 1);
          selectedObjects++;
        }
      for (const drawing of area.drawings) {
        assert.equal(
          result.placedDrawings.filter(
            (d) =>
              d.section === drawing.section &&
              d.drawingNode === drawing.drawingNode &&
              d.pageOrdinal === page.ordinal &&
              d.pageArea === host,
          ).length,
          1,
        );
        selectedObjects++;
      }
      const ids = new Set(area.paragraphs.map((p) => p.paragraph));
      assert.ok(rows.every((row) => row.section === area.section && ids.has(row.paragraph)));
    }
  assert.ok(selectedParagraphs > 0);
  assert.equal(
    selectedObjects,
    0,
    'later same-page footer replaces the picture-owned footer in this fixed metric',
  );
  assert.equal(result.flowPictures.filter((picture) => picture.pageArea === 'footer').length, 0);
  assert.deepEqual(content, before);
  t.diagnostic(
    JSON.stringify({
      pages: result.pages.length,
      selectedObjects,
      scope: 'fixed-metric ownership and declaration composition; not original page equivalence',
    }),
  );
});
