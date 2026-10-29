import { measureNoteBodies } from '../../web/preview/note-body-measurement.mjs';
import { projectHwp5ColumnFlow } from '../../web/preview/hwp5-column-flow.mjs';
import { hwp5PageGeometry } from '../../web/preview/hwp5-page-geometry.mjs';
import { pageReferenceBoxes } from '../../web/preview/page-reference-boxes.mjs';
import { noteSeparatorGeometry } from '../../web/preview/note-separator-geometry.mjs';
import { storedAutomaticNumberText } from '../../web/preview/automatic-number-text.mjs';
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

test(
  'actual Native multiple short footnotes share continuation without changing numbers or history',
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
    const module = await WebAssembly.compile(await readFile(wasmPath));
    const runtime = createReaderRuntime({ wasmModule: module, allowReload: true });
    let native;
    const load = async (bytes) => {
      const reply = await runtime.request({ kind: 'load', format: 'hwp5', bytes });
      assert.equal(reply.kind, 'load', reply.error);
      return reply.content;
    };
    try {
      const before = await load(original);
      const notes = before.hwp5Notes.filter((n) => n.kind === 'footnote');
      assert.equal(notes.length, 2);
      assert.equal(notes[0].hostParagraph, notes[1].hostParagraph);
      const measure = (text) => Array.from(text).length * 8;
      assert.equal(layoutHwp5PageContent(before, measure).state, 'paginated');
      const additions = [' first-note-0123456789'.repeat(90), ' second-note-0123456789'.repeat(90)];
      native = await createExperimentalHwp5Editor(module, original);
      native.enableHistoryDefault();
      let firstSaved;
      for (let i = 0; i < notes.length; i++) {
        const note = notes[i],
          paragraph = note.paragraphs[0];
        const row = before.paragraphs.find(
          (p) => p.section === note.section && p.paragraph === paragraph,
        );
        const mapped = sourceTextChange(
          { startUnit: row.text.length, endUnit: row.text.length, text: additions[i] },
          row.sourceOffsets,
        );
        native.splice({ section: note.section, paragraph, ...mapped });
        if (i === 0) firstSaved = native.save({ allowStaleLayout: true }).bytes;
      }
      const edited = native.save({ allowStaleLayout: true }).bytes;
      assert(native.undo());
      assert.deepEqual(native.save({ allowStaleLayout: true }).bytes, firstSaved);
      assert(native.undo());
      assert.equal(
        Buffer.compare(Buffer.from(native.save({ allowStaleLayout: true }).bytes), original),
        0,
      );
      assert(native.redo());
      assert(native.redo());
      assert.deepEqual(native.save({ allowStaleLayout: true }).bytes, edited);
      native.close();
      native = undefined;
      const after = await load(edited);
      const setting = hwp5PageGeometry(after.pageSources[0]);
      const frame = pageReferenceBoxes(setting, { x: 20, y: 20 });
      assert.equal(frame.state, 'placed');
      const measured = measureNoteBodies(
        {
          ...after,
          pageSettings: [setting],
          paragraphFlows: projectHwp5ColumnFlow(after, { notes: true, pageAreas: true }),
        },
        frame.boxes.page.width,
        measure,
      );
      assert.equal(measured.state, 'measured', measured.error);
      const foots = measured.notes.filter((n) => n.kind === 'footnote');
      const policy = after.hwp5NotePolicies.find((p) => p.kind === 'footnote');
      const separator = noteSeparatorGeometry(policy, frame.boxes.page.width);
      assert.equal(separator.state, 'selected');
      const overhead = policy.aboveLine + separator.height + policy.belowLine;
      assert(foots.every((n) => n.height + overhead < frame.boxes.page.height));
      assert(foots.reduce((sum, n) => sum + n.height, 0) > frame.boxes.page.height);
      for (const p of before.paragraphs) {
        const index = notes.findIndex(
          (n) => n.section === p.section && n.paragraphs.includes(p.paragraph),
        );
        assert.equal(
          after.paragraphs.find((q) => q.section === p.section && q.paragraph === p.paragraph).text,
          p.text + (index >= 0 ? additions[index] : ''),
        );
      }
      const layout = layoutHwp5PageContent(after, measure);
      assert.equal(layout.state, 'paginated', layout.error);
      const allRows = layout.rows
        .filter((r) => r.kind === 'text' && r.noteKind === 'footnote')
        .toSorted((a, b) => a.pageOrdinal - b.pageOrdinal || a.y - b.y);
      for (let i = 0; i < notes.length; i++) {
        const note = notes[i],
          paragraph = note.paragraphs[0];
        const row = after.paragraphs.find(
          (p) => p.section === note.section && p.paragraph === paragraph,
        );
        const selected = allRows
          .filter((r) => r.section === note.section && r.paragraph === paragraph)
          .toSorted((a, b) => a.startUnit - b.startUnit);
        let end = 0;
        for (const r of selected) {
          assert.equal(r.startUnit, end);
          end = r.endUnit;
        }
        assert.equal(end, row.text.length);
        const numbers = row.automaticNumbers.map((n) => ({
          unit: n.unit,
          text: storedAutomaticNumberText(n.source),
        }));
        assert.equal(numbers.length, 1);
        assert.equal(numbers[0].text, i + 1 + ')');
        assert.equal(
          selected.filter((r) => r.startUnit <= numbers[0].unit && numbers[0].unit < r.endUnit)
            .length,
          1,
        );
      }
      const order = allRows
        .map((r) => r.noteNode)
        .filter((n, i, all) => i === 0 || n !== all[i - 1]);
      assert.deepEqual(
        order,
        after.hwp5Notes.filter((n) => n.kind === 'footnote').map((n) => n.controlNode),
      );
      for (const page of layout.pages) {
        const rows = allRows.filter((r) => r.pageOrdinal === page.ordinal);
        if (!rows.length) continue;
        const bottom = layout.rows
          .filter((r) => r.noteKind !== 'footnote' && r.pageOrdinal === page.ordinal)
          .reduce((n, r) => Math.max(n, r.y + r.height), page.page.y);
        const firstY = Math.min(...rows.map((r) => r.y));
        assert(
          rows.every((r) => r.y >= bottom && r.y + r.height <= page.page.y + page.page.height),
        );
        assert.equal(
          layout.noteSeparators.filter(
            (s) => s.pageOrdinal === page.ordinal && s.y >= bottom && s.y + s.height <= firstY,
          ).length,
          1,
        );
      }
      assert.equal(layoutHwp5PageContent(await load(edited), measure).state, 'paginated');
    } finally {
      native?.close();
      await runtime.dispose();
    }
  },
);
