import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createReaderRuntime } from '../../web/preview/reader-runtime.mjs';
import { createExperimentalHwp5Editor } from '../../js/hwp5-editor.mjs';
import { sourceTextChange } from '../../web/preview/text-offsets.mjs';
import { layoutHwp5PageContent } from '../../web/preview/hwp5-page-layout.mjs';
const wasmPath = process.env.HWPJS_TEST_WASM;
test(
  'actual Native long plain footnote keeps complete layout and exact undo/redo/save reopen',
  { skip: !wasmPath },
  async () => {
    const original = await readFile(
      new URL(
        '../../legacy/rust/crates/hwp-core/tests/fixtures/footnote-endnote.hwp',
        import.meta.url,
      ),
    );
    assert.equal(
      createHash('sha256').update(original).digest('hex'),
      '360c6dc2c679e03e48396b11d7f31823a577d64e96a9ec75e074390385b865a9',
    );
    const module = await WebAssembly.compile(await readFile(wasmPath)),
      runtime = createReaderRuntime({ wasmModule: module, allowReload: true });
    let native;
    const load = async (bytes) => {
      const reply = await runtime.request({ kind: 'load', format: 'hwp5', bytes });
      assert.equal(reply.kind, 'load', reply.error);
      return reply.content;
    };
    try {
      const before = await load(original),
        foot = before.hwp5Notes.find((n) => n.kind === 'footnote'),
        paragraph = foot.paragraphs[0];
      const row = before.paragraphs.find(
          (p) => p.section === foot.section && p.paragraph === paragraph,
        ),
        measure = (text) => Array.from(text).length * 8;
      assert.equal(layoutHwp5PageContent(before, measure).state, 'paginated');
      native = await createExperimentalHwp5Editor(module, original);
      native.enableHistoryDefault();
      const addition = ' continued-note-0123456789'.repeat(700),
        mapped = sourceTextChange(
          { startUnit: row.text.length, endUnit: row.text.length, text: addition },
          row.sourceOffsets,
        );
      native.splice({ section: foot.section, paragraph, ...mapped });
      const edited = native.save({ allowStaleLayout: true }).bytes;
      assert(native.undo());
      assert.equal(
        Buffer.compare(Buffer.from(native.save({ allowStaleLayout: true }).bytes), original),
        0,
      );
      assert(native.redo());
      assert.deepEqual(native.save({ allowStaleLayout: true }).bytes, edited);
      native.close();
      native = undefined;
      const after = await load(edited),
        changed = after.paragraphs.find(
          (p) => p.section === foot.section && p.paragraph === paragraph,
        );
      assert.equal(changed.text, row.text + addition);
      for (const p of before.paragraphs)
        if (p.section !== foot.section || p.paragraph !== paragraph)
          assert.equal(
            after.paragraphs.find((q) => q.section === p.section && q.paragraph === p.paragraph)
              .text,
            p.text,
          );
      const layout = layoutHwp5PageContent(after, measure);
      assert.equal(layout.state, 'paginated', layout.error);
      const rows = layout.rows
        .filter((r) => r.kind === 'text' && r.section === foot.section && r.paragraph === paragraph)
        .toSorted((a, b) => a.startUnit - b.startUnit);
      let end = 0;
      for (const r of rows) {
        assert.equal(r.startUnit, end);
        end = r.endUnit;
      }
      assert.equal(end, changed.text.length);
      assert(new Set(rows.map((r) => r.pageOrdinal)).size > 1);
      const reopened = await load(edited);
      assert.equal(layoutHwp5PageContent(reopened, measure).state, 'paginated');
    } finally {
      native?.close();
      await runtime.dispose();
    }
  },
);
