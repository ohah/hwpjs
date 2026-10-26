import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { clickHwp5BlankCell } from './hwp5-blank-cell-pointer.mjs';
import { clickBrowserTarget } from './click-target.mjs';
import { moveBrowserInputToStart } from './input-origin.mjs';
import { createExperimentalHwp5Editor } from '../../js/hwp5-editor.mjs';
import { inspect, verifyRaw } from '../../tests/hwp5/style-preservation/text-record-oracle.mjs';

// Start after paragraph1's independent roundtrip. Keep all edits in one session.
export async function exerciseHwp5BlankCellSequence(driver, { wasm, bytes, output, marker }) {
  const { command, evaluate } = driver,
    click = (selector) => clickBrowserTarget(driver, selector);
  const expected = new Map([[1, marker]]);
  let path;
  for (const paragraph of [2, 3, 5]) {
    clickHwp5BlankCell(driver, { section: 0, paragraph });
    const prefix = `${marker}-${paragraph}`;
    evaluate('window.__hwpTrustedInput=[]');
    moveBrowserInputToStart(driver);
    command('keyboard', 'inserttext', prefix);
    const hasText = (text) =>
      `window.__hwpCurrentContent?.paragraphs.find(p=>p.section===0&&p.paragraph===${paragraph})?.text===${JSON.stringify(text)}`;
    command('wait', '--fn', hasText(prefix));
    assert.deepEqual(
      evaluate('window.__hwpTrustedInput.filter(row=>row.trusted).map(row=>row.type)'),
      ['beforeinput', 'input'],
    );
    click('#undo');
    command('wait', '--fn', hasText(''));
    click('#redo');
    command('wait', '--fn', hasText(prefix));
    command('scrollintoview', '#canvas-input');
    command('screenshot', join(output, `edited-paragraph-${paragraph}.png`));
    assert.equal(evaluate('document.querySelector("#allow-stale-layout").checked'), true);
    command('scrollintoview', '#download');
    path = join(output, `edited-paragraph-${paragraph}.hwp`);
    command('download', '#download', path);
    const saved = readFileSync(path);
    verifyRaw(bytes, saved, 0, paragraph, 0, 0, prefix);
    assert.throws(
      () => verifyRaw(bytes, saved, 0, paragraph, 0, 0, 'wrong'),
      assert.AssertionError,
    );
    assert.deepEqual(inspect(saved).metadata, inspect(bytes).metadata);
    expected.set(paragraph, prefix);
    const reopened = await createExperimentalHwp5Editor(wasm, saved);
    try {
      for (const [owner, text] of expected) assert.equal(reopened.text(0, owner), text + '\r');
      assert.equal(reopened.tableLayoutSources(0).length, 2);
    } finally {
      reopened.close();
    }
    bytes = saved;
    console.log(
      JSON.stringify({
        kind: 'blank-cell-sequence-step',
        paragraph,
        verifiedParagraphs: [...expected.keys()],
        path,
        trustedInput: true,
        history: true,
        independentSectionStreamsMetadata: true,
      }),
    );
  }
  return { bytes, path, expected };
}
