import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createExperimentalHwp5Editor } from '../../js/hwp5-editor.mjs';
import { createHwp5Reader } from '../../js/hwp5.mjs';
import { queryHwp5WindowContent } from '../../web/preview/hwp5-window-query-content.mjs';
import { attachHwp5WindowRepeatedAreas } from '../../web/preview/hwp5-window-repeated-content.mjs';
import { layoutHwp5WindowContent } from '../../web/preview/hwp5-window-page-layout.mjs';

test('actual body windows attach all declared repeated lists and refuse removed bodies', async () => {
  const wasm = readFileSync(process.env.HWPJS_TEST_WASM ?? 'zig-out/bin/hwpjs.wasm');
  for (const name of ['headerfooter', 'table-bug']) {
    const input = readFileSync(`legacy/rust/crates/hwp-core/tests/fixtures/${name}.hwp`);
    const editor = await createExperimentalHwp5Editor(wasm, input),
      reader = await createHwp5Reader(wasm);
    try {
      const flow = editor.paragraphFlow(0).findLast((row) => row.host === 'body');
      const content = queryHwp5WindowContent(
        editor,
        reader.readText(input),
        { offset: flow.paragraph, count: 1 },
        true,
      );
      assert.deepEqual(content.pageAreaSourceErrors, []);
      assert.deepEqual(content.masterPageSourceErrors, []);
      assert.equal(content.pageAreaSources.length, name === 'headerfooter' ? 2 : 0);
      assert.equal(content.masterPageSources.length, name === 'table-bug' ? 1 : 0);
      assert.deepEqual(content.automaticNumberErrors, []);
      assert.deepEqual(content.pageControlSourceErrors, []);
      assert.equal(content.documentPropertySourceError, null);
      const layout = layoutHwp5WindowContent(content, () => 8);
      if (name === 'headerfooter') {
        assert.equal(layout.state, 'paginated', layout.error);
        assert(layout.rows.some((row) => row.pageArea === 'header'));
        assert.equal(layout.documentPageNumbersExact, false);
      } else assert.equal(layout.error, 'IncompleteHwp5WindowTables');
      const repeated = content.currentParagraphFlows.filter((row) =>
        ['header', 'footer', 'master_page'].includes(row.host),
      );
      assert(repeated.length > 0);
      assert(
        repeated.every(
          (row) => content.paragraphs.find((p) => p.paragraph === row.paragraph).windowContext,
        ),
      );
      const broken = {
        ...content,
        paragraphs: content.paragraphs.filter(
          (row) => !repeated.some((flow) => flow.paragraph === row.paragraph),
        ),
      };
      assert.throws(
        () => attachHwp5WindowRepeatedAreas(editor, broken),
        /MissingHwp5WindowRepeatedBody/,
      );
      assert.deepEqual(Buffer.from(editor.save().bytes), input);
    } finally {
      editor.close();
      reader.close();
    }
  }
});
