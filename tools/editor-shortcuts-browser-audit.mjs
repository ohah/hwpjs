import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { setTimeout as pause } from 'node:timers/promises';
import { closeOwnedBrowser } from './browser/session-close.mjs';
const dir = resolve(
    process.env.HWPJS_SHORTCUT_OUTPUT ??
      'zig-out/verification/editor-shortcuts-browser/' +
        new Date().toISOString().replace(/[:.]/g, '-'),
  ),
  downloads = resolve(dir, 'downloads');
mkdirSync(downloads, { recursive: true });
writeFileSync(
  resolve(dir, 'run-metadata.json'),
  JSON.stringify({
    origin: process.argv[2] ?? process.env.DEMO_ORIGIN ?? 'http://127.0.0.1:49008',
    started: new Date().toISOString(),
    downloadRequirement:
      'new file or independently changed filesystem write timestamp for each save; bytes match observed successful Worker save',
  }),
);
writeFileSync(
  resolve(dir, 'custom.json'),
  JSON.stringify({
    version: 1,
    bindings: [
      { id: 'find', command: 'find', code: 'KeyK', modifiers: ['Mod'], labelKey: 'command.find' },
      {
        id: 'custom-statistics',
        command: 'word-count',
        code: 'F9',
        modifiers: [],
        labelKey: 'custom.statistics',
      },
      { id: 'bold', command: 'bold', code: 'KeyB', modifiers: ['Mod'], enabled: false },
    ],
    messages: {
      ko: { 'custom.statistics': '내 문서 통계' },
      en: { 'custom.statistics': 'My Statistics' },
    },
  }),
);
writeFileSync(
  resolve(dir, 'conflict.json'),
  JSON.stringify({
    version: 1,
    bindings: [{ id: 'copy', command: 'copy', code: 'KeyZ', modifiers: ['Mod'] }],
  }),
);
writeFileSync(
  resolve(dir, 'unknown.json'),
  JSON.stringify({
    version: 1,
    bindings: [{ id: 'custom-missing', command: 'missing', code: 'F8', modifiers: [] }],
  }),
);
const session = execFileSync(
  'agent-browser',
  ['session', 'id', '--scope', 'worktree', '--prefix', 'keymap-ui'],
  { encoding: 'utf8' },
).trim();
const cmd = (...args) => {
  let out = execFileSync(
    'agent-browser',
    [
      '--session',
      session,
      '--init-script',
      resolve('tools/browser/demo-edit-observer.js'),
      '--download-path',
      downloads,
      '--json',
      ...args,
    ],
    { encoding: 'utf8', timeout: 45000, maxBuffer: 5e6 },
  );
  const r = JSON.parse(out);
  assert.equal(r.success, true, JSON.stringify(r));
  return r.data;
};
const ev = (s) => cmd('eval', s).result,
  wait = (s) => cmd('wait', '--fn', s),
  click = (s) => cmd('click', s);
const results = [];
assert.equal(cmd('session', 'info').active, false);
try {
  for (const framework of ['vanilla', 'react', 'svelte'])
    for (const format of ['hwp', 'hwpx']) {
      cmd(
        'open',
        `${process.argv[2] ?? process.env.DEMO_ORIGIN ?? 'http://127.0.0.1:49008'}/demo/${framework}`,
      );
      wait('document.querySelector("[data-role=file-picker]")?.disabled===false');
      const modifier = /Mac|iPhone|iPad/.test(ev('navigator.platform')) ? 'Meta' : 'Control';
      const source = resolve(`legacy/rust/crates/hwp-core/tests/fixtures/charshape.${format}`);
      cmd('upload', '[data-role=file-picker]', source);
      wait('document.body.innerText.includes("문서를 열었습니다.")');
      const state = () =>
        ev(
          '({undo:document.querySelector(".hwp-demo-formatbar [data-command=undo]").disabled,redo:document.querySelector(".hwp-demo-formatbar [data-command=redo]").disabled})',
        );
      assert.deepEqual(state(), { undo: true, redo: true });
      cmd('focus', 'canvas');
      cmd('press', modifier === 'Meta' ? 'Meta+Shift+h' : 'Control+h');
      wait('!!document.querySelector("[data-role=search-query]")');
      cmd('fill', '[data-role=search-query]', '기울임');
      cmd('fill', '[data-role=search-replacement]', '검증기울임');
      click('[data-role=find-next]');
      wait('document.querySelector("dialog").innerText.includes("일치하는 내용을 선택했습니다.")');
      click('[data-role=replace-selection]');
      wait('window.__demoEditAudit.content.paragraphs.some(r=>r.text==="검증기울임진하게")');
      click('[data-role=close-text-tool]');
      assert.deepEqual(state(), { undo: false, redo: true });
      cmd('focus', 'canvas');
      cmd('press', modifier + '+z');
      wait('window.__demoEditAudit.content.paragraphs.some(r=>r.text==="기울임진하게")');
      assert.deepEqual(state(), { undo: true, redo: false });
      cmd('focus', 'canvas');
      cmd('press', modifier + '+Shift+z');
      wait('window.__demoEditAudit.content.paragraphs.some(r=>r.text==="검증기울임진하게")');
      assert.deepEqual(state(), { undo: false, redo: true });
      if (format === 'hwp') cmd('check', '[data-role=allow-stale-layout]');
      const stamp = (p) => {
        const s = statSync(p, { bigint: true });
        return String(s.mtimeNs) + ':' + String(s.ctimeNs) + ':' + String(s.ino);
      };
      const existingDownloads = new Map(
        readdirSync(downloads).map((n) => [n, stamp(resolve(downloads, n))]),
      );
      const old = ev('window.__demoEditAudit.saves.length');
      const previousSaveRequests = ev(
        'window.__demoEditAudit.requests.filter(r=>r.kind==="save").length',
      );
      cmd('focus', 'canvas');
      cmd('press', modifier + '+s');
      wait(`window.__demoEditAudit.saves.length===${old + 1}`);
      assert.equal(
        ev('window.__demoEditAudit.requests.filter(r=>r.kind==="save").length'),
        previousSaveRequests + 1,
      );
      const saveKey = ev('window.__demoEditAudit.keys.at(-1)');
      assert.equal(saveKey.trusted, true);
      assert.equal(saveKey.code, 'KeyS');
      const saved = Buffer.from(ev('window.__demoEditAudit.saves.at(-1).base64'), 'base64');
      const hash = (b) => createHash('sha256').update(b).digest('hex');
      let path;
      for (let k = 0; k < 50 && !path; k++) {
        path = readdirSync(downloads)
          .filter(
            (n) =>
              !n.endsWith('.crdownload') &&
              (!existingDownloads.has(n) ||
                existingDownloads.get(n) !== stamp(resolve(downloads, n))),
          )
          .map((n) => resolve(downloads, n))
          .find((p) => hash(readFileSync(p)) === hash(saved));
        if (!path) await pause(100);
      }
      assert(path, 'RealBrowserDownloadMissing');
      const target = resolve(dir, `${framework}.${format}`);
      writeFileSync(target, readFileSync(path));
      let independent = false;
      if (format === 'hwpx') {
        const payload = {
          before: readFileSync(source).toString('base64'),
          after: saved.toString('base64'),
          section: 0,
          paragraph: 2,
          text: '검증',
        };
        for (const flags of [[], ['-O']]) {
          execFileSync('python3', [...flags, 'tools/hwpx-anchor-prefix-oracle.py'], {
            input: JSON.stringify(payload),
            encoding: 'utf8',
          });
          assert.throws(() =>
            execFileSync('python3', [...flags, 'tools/hwpx-anchor-prefix-oracle.py'], {
              input: JSON.stringify({ ...payload, text: 'wrong' }),
              stdio: ['pipe', 'pipe', 'pipe'],
            }),
          );
        }
        independent = true;
      }
      const start = ev('window.__demoEditAudit.replies.length');
      cmd('upload', '[data-role=file-picker]', target);
      wait(`window.__demoEditAudit.replies.slice(${start}).some(r=>r.kind==='load'&&!r.error)`);
      wait('window.__demoEditAudit.content.paragraphs.some(r=>r.text==="검증기울임진하게")');
      assert.deepEqual(state(), { undo: true, redo: true });
      click('[data-role=shortcut-settings] summary');
      cmd('upload', '[data-role=shortcut-config]', resolve(dir, 'custom.json'));
      wait('document.body.innerText.includes("단축키 설정을 적용했습니다.")');
      cmd('select', '[data-role=shortcut-locale]', 'en');
      assert(
        ev('document.querySelector("[data-role=shortcut-bindings]").innerText').includes(
          'My Statistics',
        ),
      );
      cmd('focus', 'canvas');
      cmd('press', modifier + '+k');
      wait('!!document.querySelector("dialog[data-role=text-search][open]")');
      cmd('fill', '[data-role=search-query]', '검증');
      click('[data-role=find-next]');
      wait('document.querySelector("dialog").innerText.includes("일치하는 내용을 선택했습니다.")');
      click('[data-role=close-text-tool]');
      cmd('focus', 'textarea[data-hwpjs-document-input]');
      const beforeFormatting = ev(
        'window.__demoEditAudit.requests.filter(r=>r.kind==="character-properties").length',
      );
      cmd('press', modifier + '+b');
      if (format === 'hwp') cmd('check', '[data-role=allow-stale-layout]');
      cmd('focus', 'textarea[data-hwpjs-document-input]');
      const disabledSaveCount = ev('window.__demoEditAudit.saves.length');
      cmd('press', modifier + '+s');
      wait(`window.__demoEditAudit.saves.length===${disabledSaveCount + 1}`);
      assert.equal(
        ev('window.__demoEditAudit.requests.filter(r=>r.kind==="character-properties").length'),
        beforeFormatting,
      );
      assert.deepEqual(
        Buffer.from(ev('window.__demoEditAudit.saves.at(-1).base64'), 'base64'),
        saved,
      );
      cmd('focus', 'canvas');
      cmd('press', 'F9');
      wait('!!document.querySelector("dialog[data-role=document-statistics][open]")');
      click('[data-role=close-text-tool]');
      const configPath = resolve(downloads, 'hwpjs-keymap.json'),
        priorConfig = readdirSync(downloads).includes('hwpjs-keymap.json')
          ? stamp(configPath)
          : null;
      click('[data-role=shortcut-export]');
      let exported = false;
      for (let i = 0; i < 50 && !exported; i++) {
        if (
          readdirSync(downloads).includes('hwpjs-keymap.json') &&
          stamp(configPath) !== priorConfig
        )
          exported = true;
        else await pause(100);
      }
      assert(exported, 'ShortcutExportMissing');
      const exportedConfig = JSON.parse(readFileSync(configPath, 'utf8'));
      assert.equal(exportedConfig.version, 1);
      assert(exportedConfig.bindings.some((b) => b.id === 'custom-statistics' && b.code === 'F9'));
      assert.equal(exportedConfig.bindings.find((b) => b.id === 'bold').enabled, false);
      assert.equal(exportedConfig.messages.en['custom.statistics'], 'My Statistics');
      cmd('upload', '[data-role=shortcut-config]', resolve(dir, 'conflict.json'));
      wait('document.body.innerText.includes("InvalidKeymap")');
      assert(
        ev('document.querySelector("[data-role=shortcut-bindings]").innerText').includes(
          'My Statistics',
        ),
      );
      cmd('upload', '[data-role=shortcut-config]', resolve(dir, 'unknown.json'));
      wait('document.body.innerText.includes("UnknownShortcutCommand")');
      click('[data-role=shortcut-reset]');
      assert(
        !ev('document.querySelector("[data-role=shortcut-bindings]").innerText').includes(
          'My Statistics',
        ),
      );
      assert(
        ev(
          'window.__demoEditAudit.keys.filter(k=>["KeyH","KeyZ","KeyS","KeyK","F9"].includes(k.code)).every(k=>k.trusted)',
        ),
      );
      cmd('screenshot', resolve(dir, framework + '-' + format + '.png'));
      results.push({
        framework,
        format,
        custom: true,
        jsonExport: true,
        disabledDefaultPreservesBytes: true,
        locale: true,
        conflictRejected: true,
        unknownRejected: true,
        reset: true,
        replace: true,
        undo: true,
        redo: true,
        reopen: true,
        download: true,
        browserDownload: path,
        artifact: target,
        independentXML: independent,
        sha256: hash(saved),
      });
      writeFileSync(resolve(dir, 'results.json'), JSON.stringify(results, null, 2));
    }
  console.log(JSON.stringify({ pass: results.length, output: dir }));
} catch (e) {
  try {
    writeFileSync(
      resolve(dir, 'failure.json'),
      JSON.stringify(
        { error: String(e), snapshot: cmd('snapshot'), errors: cmd('errors'), results },
        null,
        2,
      ),
    );
    cmd('screenshot', resolve(dir, 'failure.png'));
  } catch {}
  throw e;
} finally {
  await closeOwnedBrowser(cmd);
  writeFileSync(
    resolve(dir, 'cleanup.json'),
    JSON.stringify({ session, inactive: cmd('session', 'info').active === false }),
  );
}
