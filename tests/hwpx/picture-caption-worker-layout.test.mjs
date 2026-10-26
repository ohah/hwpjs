import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { layoutPictureBodyContent } from '../../web/preview/picture-body-content-layout.mjs';
import { createTextStyle } from '../../web/preview/text-style.mjs';
import { layoutDrawingBodyContent } from '../../web/preview/drawing-body-content-layout.mjs';
import { layoutPageContent } from '../../web/preview/page-content-layout.mjs';
import { pageParagraphCoverage } from '../../web/preview/page-paragraph-coverage.mjs';

const wasmPath = process.env.HWPJS_TEST_WASM ?? 'zig-out/bin/hwpjs.wasm';
const wasm = readFileSync(wasmPath);
const exports = WebAssembly.Module.exports(new WebAssembly.Module(wasm));
const available = ['hwpx_edit_picture_caption', 'hwpx_edit_picture_caption_bindings'].every(
  (name) => exports.some((e) => e.name === name && e.kind === 'function'),
);
const reference = 'reference/rhwp/samples/issue5543_carried_anchor_ladder.hwpx';

test(
  'actual Worker preserves caption handoff and full reference page layout',
  { skip: !available || !existsSync(reference) },
  async (t) => {
    const previousSelf = globalThis.self,
      previousFetch = globalThis.fetch,
      replies = [];
    globalThis.self = { postMessage: (value) => replies.push(value) };
    globalThis.fetch = async () => new Response(wasm);
    t.after(() => {
      globalThis.self = previousSelf;
      globalThis.fetch = previousFetch;
    });
    await import(`../../web/preview/reader-worker.mjs?picture-caption-api=${Date.now()}`);
    const input = readFileSync(reference),
      before = Buffer.from(input);
    await self.onmessage({ data: { kind: 'load', format: 'hwpx', bytes: input } });
    assert.equal(replies.length, 1);
    const reply = replies.shift();
    assert.equal(reply.error, undefined);
    assert.equal(reply.content.pictureCaptionAvailable, true);
    assert.deepEqual(reply.content.pictureCaptionErrors, []);
    const picture = reply.content.pictures.find((p) => p.pictureNode === 350);
    const paragraph = reply.content.paragraphs.find((p) => p.section === 0 && p.paragraph === 31);
    assert.deepEqual(paragraph.drawingCaption, {
      drawingNode: 350,
      captionNode: picture.caption.caption_node,
      listNode: picture.caption.list_node,
    });
    assert.equal(paragraph.text, ' < 열풍건초 생산 시스템 >');
    assert.ok(!reply.content.drawings.some((d) => d.drawingNode === 350));
    const beforeLayout = JSON.stringify(reply.content);
    let observed = 0;
    const inspected = layoutDrawingBodyContent(
      reply.content,
      () => ({ width: 8, height: 20 }),
      20000,
      (body) => {
        observed++;
        assert.ok(body.pictures.some((p) => p.pictureNode === 350 && p.caption));
        assert.ok(
          body.paragraphs.some((p) => p.paragraph === 31 && p.drawingCaption?.drawingNode === 350),
        );
        assert.ok(body.paragraphFlows.some((f) => f.paragraph === 31));
        assert.ok(!body.pictures.some((p) => [615, 639].includes(p.pictureNode)));
        return { state: 'unavailable', error: 'ObservedCaptionBodyHandoff' };
      },
    );
    assert.equal(observed, 1);
    assert.equal(inspected.error, 'ObservedCaptionBodyHandoff');
    const scene = {
      ...reply.content,
      pictures: [picture],
      tables: [],
      drawings: [],
      lines: [],
      paragraphs: reply.content.paragraphs.filter(
        (p) => p.section === 0 && [30, 31].includes(p.paragraph),
      ),
      paragraphFlows: reply.content.paragraphFlows.filter(
        (p) => p.section === 0 && [30, 31].includes(p.paragraph),
      ),
    };
    const style = createTextStyle(scene, '16px sans-serif');
    const layout = layoutPictureBodyContent(
      scene,
      (text, p, unit, kind) => ({
        width: text.length * 8,
        height: style.textHeight(p, unit, kind),
      }),
      100,
    );
    assert.equal(layout.state, 'paginated', layout.error);
    assert.equal(layout.flowPictures.length, 1);
    assert.equal(layout.flowPictures[0].rectangle.height, picture.geometry.height / 75);
    assert.ok(
      layout.flowPictures[0].flowRectangle.height > layout.flowPictures[0].rectangle.height,
    );
    assert.equal(
      layout.rows
        .filter((r) => r.paragraph === 31)
        .map((r) => r.text)
        .join(''),
      paragraph.text,
    );
    const completeStyle = createTextStyle(reply.content, '16px sans-serif');
    const complete = layoutPageContent(reply.content, (text, p, unit, kind) => ({
      width: text.length * 8,
      height: completeStyle.textHeight(p, unit, kind),
    }));
    assert.equal(complete.state, 'paginated', JSON.stringify(complete));
    assert.equal(complete.limited, false);
    const owners = reply.content.paragraphs.filter(
      (p) => p.section === 0 && [30, 31].includes(p.paragraph),
    );
    const members = complete.rows.filter((r) => r.section === 0 && [30, 31].includes(r.paragraph));
    assert.equal(pageParagraphCoverage(owners, members).state, 'complete');
    for (const owner of owners)
      assert.equal(
        members
          .filter((r) => r.paragraph === owner.paragraph)
          .map((r) => r.text)
          .join(''),
        owner.text,
      );
    const images = complete.flowPictures.filter((p) => p.section === 0 && p.pictureNode === 350);
    assert.equal(images.length, 1);
    assert.equal(images[0].rectangle.height, picture.geometry.height / 75);
    assert.ok(images[0].flowRectangle.height > images[0].rectangle.height);
    const imagePage = complete.pages.find((p) => p.ordinal === images[0].pageOrdinal);
    const frame = images[0].flowRectangle;
    assert.ok(
      frame.x >= imagePage.paper.x &&
        frame.y >= imagePage.paper.y &&
        frame.x + frame.width <= imagePage.paper.x + imagePage.paper.width &&
        frame.y + frame.height <= imagePage.paper.y + imagePage.paper.height,
      JSON.stringify({ frame, paper: imagePage.paper }),
    );
    assert.equal(complete.tableCollisionFootprintErrors.length, 0);
    t.diagnostic(
      JSON.stringify({ reference, pages: complete.pages.length, rows: complete.rows.length }),
    );
    assert.equal(JSON.stringify(reply.content), beforeLayout);
    assert.deepEqual(input, before);
    await self.onmessage({ data: { kind: 'load', format: 'close-audit', bytes: [] } });
  },
);
