import { execFileSync } from 'node:child_process';
import { verifyRaw } from '../tests/hwp5/style-preservation/text-record-oracle.mjs';
import { nativePasteKey } from './browser/native-paste-key.mjs';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { setTimeout as pause } from 'node:timers/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  inspectBrowserCli,
  createBoundedCliRunner,
  decodeCliRecord,
} from './browser/bounded-cli-runner.mjs';
import { closeOwnedBrowser } from './browser/session-close.mjs';
const origin = new URL(process.argv[2] ?? 'http://127.0.0.1:49008').origin;
const framework = process.argv[3] ?? 'vanilla',
  format = process.argv[4] ?? 'hwpx';
assert(['vanilla', 'react', 'svelte'].includes(framework));
assert(['hwp', 'hwpx'].includes(format));
const dir = resolve(
  'zig-out/verification/clipboard-public-ui',
  `native-paste-${framework}-${format}-` + new Date().toISOString().replace(/[:.]/g, '-'),
);
mkdirSync(dir, { recursive: true });
const downloads = resolve(dir, 'downloads');
mkdirSync(downloads, { recursive: true });
const session = 'native-paste-candidate-' + randomUUID(),
  runner = createBoundedCliRunner(inspectBrowserCli(), {
    timeoutMs: 45000,
    onRecord: () =>
      writeFileSync(resolve(dir, 'commands.json'), JSON.stringify(runner.records, null, 2)),
  });
const cmd = async (...args) =>
  decodeCliRecord(
    await runner.run([
      '--session',
      session,
      '--init-script',
      resolve('tools/browser/demo-edit-observer.js'),
      '--download-path',
      downloads,
      '--json',
      ...args,
    ]),
  );
const ev = async (s) => (await cmd('eval', s)).result,
  wait = (s) => cmd('wait', '--fn', s),
  click = (s) => cmd('click', s);
function verifySavedSplice(before, after, start, end, text) {
  if (format === 'hwp') {
    verifyRaw(before, after, 0, 1, start, end, text);
    assert.throws(() => verifyRaw(before, after, 0, 1, start, end, text + 'wrong'));
  } else {
    const payload = {
      before: before.toString('base64'),
      after: after.toString('base64'),
      part: 'Contents/section0.xml',
      index: 1,
      start,
      end,
      text,
    };
    for (const flags of [[], ['-O']]) {
      execFileSync('python3', [...flags, 'tools/hwpx-plain-splice-oracle.py'], {
        input: JSON.stringify(payload),
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      assert.throws(() =>
        execFileSync('python3', [...flags, 'tools/hwpx-plain-splice-oracle.py'], {
          input: JSON.stringify({ ...payload, text: text + 'wrong' }),
          stdio: ['pipe', 'pipe', 'pipe'],
        }),
      );
    }
  }
}
const stamp = (p) => {
  const s = statSync(p, { bigint: true });
  return `${s.ino}:${s.size}:${s.mtimeNs}:${s.ctimeNs}`;
};
const save = async (modifier, label) => {
  const previous = new Map(readdirSync(downloads).map((n) => [n, stamp(resolve(downloads, n))]));
  const count = await ev('window.__demoEditAudit.saves.length');
  await cmd('press', `${modifier}+s`);
  await wait(`window.__demoEditAudit.saves.length===${count + 1}`);
  const saved = Buffer.from(await ev('window.__demoEditAudit.saves.at(-1).base64'), 'base64');
  let found;
  for (let i = 0; i < 100 && !found; i++) {
    found = readdirSync(downloads)
      .filter(
        (n) =>
          n.endsWith(`.${format}`) &&
          (!previous.has(n) || previous.get(n) !== stamp(resolve(downloads, n))),
      )
      .map((n) => resolve(downloads, n))
      .find((p) => readFileSync(p).equals(saved));
    if (!found) await pause(50);
  }
  assert(found, 'RealBrowserDownloadMissing');
  writeFileSync(resolve(dir, `${label}.${format}`), readFileSync(found));
  return saved;
};
let owned = false,
  stage = 'inactive-proof',
  result;
const stageSet = (s) => {
  stage = s;
  console.log(s);
};
try {
  const info = await cmd('session', 'info');
  writeFileSync(resolve(dir, 'inactive-proof.json'), JSON.stringify(info));
  assert.equal(info.active, false);
  owned = true;
  stageSet('open');
  await cmd('open', `${origin}/demo/${framework}`);
  await wait('document.querySelector("[data-role=file-picker]")?.disabled===false');
  await cmd(
    'upload',
    '[data-role=file-picker]',
    resolve(`legacy/rust/crates/hwp-core/tests/fixtures/charshape.${format}`),
  );
  await wait('window.__demoEditAudit?.content?.paragraphs?.some(r=>r.text==="기울임진하게")');
  if (format === 'hwp') await cmd('check', '[data-role=allow-stale-layout]');
  const select = async (text) => {
    await click('.hwp-demo-tool[data-command=find]');
    await wait('!!document.querySelector("[data-role=search-query]")');
    await cmd('fill', '[data-role=search-query]', text);
    await click('[data-role=search-direction-all]');
    await click('[data-role=find-next]');
    await wait(
      'document.querySelector("dialog[data-role=text-search]")?.innerText.includes("일치하는 내용을 선택했습니다.")',
    );
    await click('[data-role=close-text-tool]');
  };
  stageSet('copy');
  await select('기울임');
  await click('.hwp-demo-tool[data-command=copy]');
  await wait('document.body.innerText.includes("Copied")');
  stageSet('select-and-focus');
  await select('진하게'); // Find dialog closure must restore the public document surface focus.
  const before = await ev(
    '({splices:window.__demoEditAudit.requests.filter(r=>r.kind==="splice"||r.kind==="splice-current").length,paragraphs:window.__demoEditAudit.content.paragraphs.map(r=>({section:r.section,paragraph:r.paragraph,text:r.text})),range:(()=>{const i=document.querySelector("textarea[data-hwpjs-document-input]");return {start:i.selectionStart,end:i.selectionEnd}})(),keys:window.__demoEditAudit.keys.length,focused:document.activeElement?.matches("textarea[data-hwpjs-document-input]")})',
  );
  assert.equal(before.focused, true);
  writeFileSync(resolve(dir, 'before-paste.json'), JSON.stringify(before, null, 2));
  assert.deepEqual(before.range, { start: 3, end: 6 });
  const modifier = await ev('/Mac|iPhone|iPad/.test(navigator.platform)?"Meta":"Control"');
  stageSet('trusted-paste-once');
  await nativePasteKey(cmd, {
    origin,
    framework,
    modifier,
    ownerToken: await ev('window.__demoEditAudit.ownerToken'),
  });
  await wait('window.__demoEditAudit.content.paragraphs.some(r=>r.text==="기울임기울임")');
  assert.equal(before.paragraphs.filter((r) => r.text === '기울임진하게').length, 1);
  const expected = before.paragraphs.map((r) => [
    r.section,
    r.paragraph,
    r.text === '기울임진하게' ? '기울임기울임' : r.text,
  ]);
  const after = await ev(
    `({splices:window.__demoEditAudit.requests.filter(r=>r.kind==="splice"||r.kind==="splice-current").length,paragraphsMatchExpected:JSON.stringify(window.__demoEditAudit.content.paragraphs.map(r=>[r.section,r.paragraph,r.text]))===${JSON.stringify(JSON.stringify([]))},denied:document.body.innerText.includes("ClipboardReadPermissionDenied"),key:window.__demoEditAudit.keys.filter(k=>k.code==="KeyV").at(-1)})`.replace(
      JSON.stringify(JSON.stringify([])),
      JSON.stringify(JSON.stringify(expected)),
    ),
  );
  assert.equal(after.splices, before.splices + 1);
  assert.equal(after.denied, false);
  assert.equal(after.paragraphsMatchExpected, true);
  const pasteEvent = await ev('window.__demoEditAudit.pastes.at(-1)');
  assert.equal(pasteEvent.trusted, true);
  assert(pasteEvent.types.includes('text/plain'));
  assert.equal(after.key.trusted, true);
  assert.equal(modifier === 'Meta' ? after.key.meta : after.key.control, true);
  const caret = await ev(
    '(()=>{const i=document.querySelector("textarea[data-hwpjs-document-input]");return {matchesExpected:i.value==="기울임기울임",start:i.selectionStart,end:i.selectionEnd,focused:document.activeElement===i}})()',
  );
  assert.deepEqual(caret, { matchesExpected: true, start: 6, end: 6, focused: true });
  result = {
    origin: `${origin}/demo/${framework}`,
    fixture: `charshape.${format}`,
    copied: true,
    selection: '진하게',
    publicDocumentInputFocused: true,
    modifier,
    pasteKey: after.key,
    ClipboardReadPermissionDenied: after.denied,
    spliceDelta: after.splices - before.splices,
    actualNativePaste: true,
    trustedPasteEvent: pasteEvent,
    expectedNativeTextStillPresent: after.paragraphsMatchExpected,
    clipboardDirectRead: false,
  };
  const pastedBytes = await save(modifier, 'pasted');
  verifySavedSplice(
    readFileSync(resolve(`legacy/rust/crates/hwp-core/tests/fixtures/charshape.${format}`)),
    pastedBytes,
    3,
    6,
    '기울임',
  );
  await cmd('press', 'x');
  await wait('window.__demoEditAudit.content.paragraphs.some(r=>r.text==="기울임기울임x")');
  const typed = await ev(
    '(()=>{const i=document.querySelector("textarea[data-hwpjs-document-input]");return {matchesExpected:i.value==="기울임기울임x",start:i.selectionStart,end:i.selectionEnd,focused:document.activeElement===i}})()',
  );
  assert.deepEqual(typed, { matchesExpected: true, start: 7, end: 7, focused: true });
  result.typedContinuation = true;
  const typedBytes = await save(modifier, 'typed');
  assert(!typedBytes.equals(pastedBytes));
  verifySavedSplice(pastedBytes, typedBytes, 6, 6, 'x');
  result.independentSavedSplices = true;
  stageSet('keyboard-history');
  const observeCaret = () =>
    ev(
      '(()=>{const i=document.querySelector("textarea[data-hwpjs-document-input]");return {start:i.selectionStart,end:i.selectionEnd,focused:document.activeElement===i}})()',
    );
  for (const [key, text, start, end] of [
    [`${modifier}+z`, '기울임기울임', 6, 6],
    [`${modifier}+z`, '기울임진하게', 3, 6],
    [`${modifier}+Shift+z`, '기울임기울임', 6, 6],
    [`${modifier}+Shift+z`, '기울임기울임x', 7, 7],
  ]) {
    await cmd('press', key);
    await wait(
      `window.__demoEditAudit.content.paragraphs.some(r=>r.text===${JSON.stringify(text)})`,
    );
    assert.deepEqual(await observeCaret(), { start, end, focused: true });
  }
  result.keyboardUndoRedo = true;
  const redoneBytes = await save(modifier, 'redone');
  assert(redoneBytes.equals(typedBytes), 'RedoSavedBytesDiffer');
  await cmd('upload', '[data-role=file-picker]', resolve(dir, `redone.${format}`));
  await wait('window.__demoEditAudit.content.paragraphs.some(r=>r.text==="기울임기울임x")');
  result.downloadAndReopen = true;
  writeFileSync(resolve(dir, 'result.json'), JSON.stringify(result, null, 2));
  await cmd('screenshot', resolve(dir, 'baseline.png'));
  console.log(JSON.stringify(result));
} catch (error) {
  try {
    writeFileSync(
      resolve(dir, 'observed-failure.json'),
      JSON.stringify(
        await ev(
          '({inputEvents:window.__demoEditAudit.inputEvents,pastes:window.__demoEditAudit.pastes,keys:window.__demoEditAudit.keys.slice(-4),requests:window.__demoEditAudit.requests.slice(-8),status:document.querySelector(".hwp-demo-statusbar")?.innerText,input:(()=>{const i=document.querySelector("textarea[data-hwpjs-document-input]");return {original:i.value==="기울임진하게",expected:i.value==="기울임기울임",length:i.value.length,start:i.selectionStart,end:i.selectionEnd,readOnly:i.readOnly}})()})',
        ),
        null,
        2,
      ),
    );
  } catch {}
  writeFileSync(
    resolve(dir, 'failure.json'),
    JSON.stringify({ stage, error: String(error) }, null, 2),
  );
  process.exitCode = 1;
  console.error(String(error));
} finally {
  if (owned) {
    await closeOwnedBrowser(cmd);
    const info = await cmd('session', 'info');
    assert.equal(info.active, false);
    writeFileSync(resolve(dir, 'cleanup.json'), JSON.stringify({ session, inactive: true }));
  }
  console.log(JSON.stringify({ dir, stage, completed: !!result }));
}
