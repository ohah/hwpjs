// Real save shortcut proof: trusted keys, native requests, then actual Chromium files.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';

const requests = "window.__menuAudit.filter(r=>r.direction==='request'&&r.kind==='save').length";
const replies =
  "window.__menuAudit.filter(r=>r.direction==='reply'&&r.kind==='save'&&!r.error).length";

export function assertSaveShortcutProof(proof, modifier) {
  assert(['Control', 'Meta'].includes(modifier), 'SaveShortcutInvalidModifier');
  assert.equal(typeof proof?.key, 'string', 'SaveShortcutWrongKey');
  assert.equal(proof.key.toLowerCase(), 's', 'SaveShortcutWrongKey');
  assert.equal(proof.trusted, true, 'SaveShortcutNotTrusted');
  assert.equal(proof.consumed, true, 'SaveShortcutNotConsumed');
  assert.equal(proof.ctrl, modifier === 'Control', 'SaveShortcutWrongModifier');
  assert.equal(proof.meta, modifier === 'Meta', 'SaveShortcutWrongModifier');
}

const lastKey = (evaluate) =>
  evaluate("window.__menuKeys.filter(row=>row.key?.toLowerCase()==='s').at(-1)");

export function armSaveShortcutInputHold(evaluate) {
  evaluate('window.__saveShortcutHold={next:true,held:false,release:null}');
}

export function verifyHeldInputSaveShortcut({ command, evaluate }, directory) {
  command('wait', '--fn', 'window.__saveShortcutHold?.held===true');
  assert.equal(evaluate('document.querySelector("#download").disabled'), true);
  const before = evaluate(requests);
  command('press', 'Control+s');
  assertSaveShortcutProof(lastKey(evaluate), 'Control');
  assert.equal(evaluate(requests), before, 'BusyInputIssuedNativeSave');
  assert.deepEqual(readdirSync(directory), [], 'BusyInputStartedDownload');
  evaluate(
    '(() => {const held=window.__saveShortcutHold;delete window.__saveShortcutHold;held.release()})()',
  );
}

export function changedDownloadNames(previous, current) {
  return [...current.keys()].filter((name) => previous.get(name) !== current.get(name));
}

function downloadState(directory) {
  const names = readdirSync(directory),
    files = new Map();
  for (const name of names.filter((name) => /\.hwpx$/i.test(name))) {
    const stat = statSync(join(directory, name), { bigint: true });
    files.set(name, `${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`);
  }
  return { names, files };
}

async function waitForDownload(directory, previous) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const current = downloadState(directory),
      completed = changedDownloadNames(previous, current.files);
    if (completed.length) {
      assert.equal(completed.length, 1, 'SaveShortcutDuplicateDownloads');
      assert.equal(
        current.names.some((name) => name.endsWith('.crdownload')),
        false,
        'SaveShortcutStillDownloading',
      );
      const path = join(directory, completed[0]),
        bytes = readFileSync(path);
      assert(bytes.length > 0, 'SaveShortcutEmptyDownload');
      return { path, bytes, version: current.files.get(completed[0]) };
    }
    await pause(25);
  }
  throw Error('SaveShortcutDownloadTimeout');
}

export async function verifyReadySaveShortcuts({ command, evaluate }, directory) {
  const downloads = [];
  for (const modifier of ['Control', 'Meta']) {
    command('wait', '--fn', '!document.querySelector("#download").disabled');
    command('focus', '#canvas-input');
    const before = evaluate(requests),
      priorReplies = evaluate(replies),
      previous = downloadState(directory).files;
    command('press', `${modifier}+s`);
    assertSaveShortcutProof(lastKey(evaluate), modifier);
    command('wait', '--fn', `${replies}===${priorReplies + 1}`);
    assert.equal(evaluate(requests), before + 1, 'SaveShortcutDuplicateNativeRequests');
    downloads.push({ key: `${modifier}+s`, ...(await waitForDownload(directory, previous)) });
  }
  return downloads;
}
