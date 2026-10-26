import test from 'node:test';
import './save-failure-guidance.test.mjs';
import assert from 'node:assert/strict';
import { saveDocument } from '../../web/preview/document-save.mjs';
import { downloadDocument } from '../../web/preview/document-download.mjs';
import { guardGeneration } from '../../web/preview/worker-generation.mjs';
import { readFileSync } from 'node:fs';
import { createExperimentalHwp5Editor } from '../../js/hwp5-editor.mjs';
import { createHwpxEditor } from '../../js/hwpx-editor.mjs';
import { failureMessage } from '../../web/preview/failure-message.mjs';
import { updateDownloadSessionStatus } from '../../web/preview/download-session-status.mjs';

test('successful enable replaces initial download guidance without claiming unsettled input is save-ready', () => {
  const node = { textContent: '편집 세션을 연 뒤 다운로드할 수 있습니다.' };
  for (const format of ['hwp5', 'hwpx']) {
    const message = { kind: 'enable', content: { format } },
      before = structuredClone(message);
    assert.equal(updateDownloadSessionStatus(node, message), true);
    assert.match(node.textContent, /편집 세션이 열렸습니다/);
    assert.match(node.textContent, /입력 처리가 끝나면/);
    assert.match(node.textContent, /조판과의 동일성은 확인되지/);
    assert.deepEqual(message, before);
  }
  for (const message of [
    { kind: 'load', content: {} },
    { kind: 'enable', error: 'NativeRefused', applied: true, content: {} },
    { kind: 'enable' },
    { kind: 'save', content: {} },
    { kind: 'splice', content: {} },
    null,
  ]) {
    node.textContent = '저장 실패: PreserveThisFailure';
    assert.equal(updateDownloadSessionStatus(node, message), false);
    assert.equal(node.textContent, '저장 실패: PreserveThisFailure');
  }
});

test('enable download guidance retains distribution password and normalization warnings', () => {
  const node = {};
  updateDownloadSessionStatus(node, {
    kind: 'enable',
    content: {
      primarySource: 'distribution_viewtext',
      passwordProtectionRemoved: true,
      normalizationInfo: { normalized: true },
    },
  });
  for (const warning of ['배포 플래그', '비밀번호 보호는 유지되지', '실행 취소 기준도 보정본'])
    assert(node.textContent.includes(warning));
});

test('failure text handles null and throwing message access without blocking the following acknowledgement', () => {
  for (const value of [
    null,
    undefined,
    false,
    0,
    {},
    { message: null },
    { message: '' },
    {
      get message() {
        throw new Error('MessageAccessFailure');
      },
    },
  ]) {
    let acknowledged = false,
      text;
    try {
      throw value;
    } catch (error) {
      text = failureMessage(error);
    }
    acknowledged = true;
    assert.equal(text, '알 수 없는 오류');
    assert.equal(acknowledged, true);
  }
  assert.equal(failureMessage(new Error('BlockedDownload')), 'BlockedDownload');
  assert.equal(failureMessage(new DOMException('Denied', 'SecurityError')), 'Denied');
  assert.equal(failureMessage('NativeRejected'), 'NativeRejected');
  const source = readFileSync('web/preview/app.mjs', 'utf8');
  assert.match(source, /다운로드 실패: \$\{failureMessage\(error\)\}/);
  assert.doesNotMatch(source, /catch \(error\) \{[^\n]*error\.message/);
});

test('actual edited HWP and HWPX download Blobs retain saved bytes after native close and reopen', async () => {
  const wasm = readFileSync(process.env.HWPJS_TEST_WASM ?? 'zig-out/bin/hwpjs.wasm');
  for (const format of ['hwp5', 'hwpx']) {
    const extension = format === 'hwp5' ? 'hwp' : 'hwpx',
      input = readFileSync(`legacy/rust/crates/hwp-core/tests/fixtures/parashape.${extension}`);
    const open = async (bytes) => {
      if (format === 'hwp5') return createExperimentalHwp5Editor(wasm, bytes);
      const editor = await createHwpxEditor(wasm);
      editor.open(bytes);
      return editor;
    };
    const editor = await open(input),
      paragraph = format === 'hwp5' ? 5 : 6;
    let blob,
      cleanup,
      revoked = 0;
    const link = { click() {}, remove() {} };
    const browser = {
      Blob,
      document: { createElement: () => link, body: { append() {} } },
      URL: {
        createObjectURL(value) {
          blob = value;
          return 'blob:saved';
        },
        revokeObjectURL() {
          revoked++;
        },
      },
      setTimeout(fn) {
        cleanup = fn;
      },
    };
    let expected, outlines;
    try {
      editor.setCharacterOutline({
        section: 0,
        paragraph,
        startUnit: 0,
        endUnit: 1,
        kind: 'solid',
      });
      const snapshot = saveDocument(editor, format, true);
      expected = Buffer.from(snapshot.bytes);
      outlines = editor.characterOutlines();
      assert.notDeepEqual(expected, input);
      downloadDocument(snapshot, `실제 문서.${extension}`, browser);
      snapshot.bytes.fill(0);
    } finally {
      editor.close();
    }
    const exported = Buffer.from(await blob.arrayBuffer());
    assert.deepEqual(exported, expected);
    assert.equal(link.download, `실제 문서.edited.${extension}`);
    const reopened = await open(exported);
    try {
      assert.deepEqual(reopened.characterOutlines(), outlines);
    } finally {
      reopened.close();
    }
    assert.equal(revoked, 0);
    cleanup();
    assert.equal(revoked, 1);
  }
});
test('download cleanup failures cannot suppress URL cleanup or overwrite the original thrown value', () => {
  for (const actionFailure of [false, true])
    for (const original of [new Error('ClickFailure'), null, undefined])
      for (const timerFailure of [false, true]) {
        let cleanup,
          removed = 0,
          revoked = 0;
        const removeFailure = new Error('RemoveFailure'),
          scheduleFailure = new Error('TimerFailure');
        const link = {
          click() {
            if (actionFailure) throw original;
          },
          remove() {
            removed++;
            throw removeFailure;
          },
        };
        const browser = {
          Blob,
          document: { createElement: () => link, body: { append() {} } },
          URL: {
            createObjectURL: () => 'blob:test',
            revokeObjectURL(url) {
              assert.equal(url, 'blob:test');
              revoked++;
            },
          },
          setTimeout(fn) {
            if (timerFailure) throw scheduleFailure;
            cleanup = fn;
          },
        };
        let threw = false,
          received;
        try {
          downloadDocument({ bytes: new Uint8Array([1]), format: 'hwp5' }, 'file.hwp', browser);
        } catch (error) {
          threw = true;
          received = error;
        }
        assert.equal(threw, true);
        assert.equal(received, actionFailure ? original : removeFailure);
        assert.equal(removed, 1);
        if (timerFailure) assert.equal(cleanup, undefined);
        else {
          assert.equal(revoked, 0);
          cleanup();
        }
        assert.equal(revoked, 1);
      }
});

test('file generation rejects late successful downloads and worker failures equally', () => {
  let generation = 1,
    ready = true,
    downloads = 0;
  const oldError = guardGeneration(
    () => generation,
    1,
    () => {
      ready = false;
    },
  );
  const oldSave = guardGeneration(
    () => generation,
    1,
    () => {
      downloads++;
    },
  );
  generation = 2;
  oldError({ message: 'OldWorkerFailed' });
  oldSave({ bytes: new Uint8Array([1]) });
  assert.equal(ready, true);
  assert.equal(downloads, 0);
  guardGeneration(
    () => generation,
    2,
    () => {
      downloads++;
    },
  )({});
  assert.equal(downloads, 1);
  guardGeneration(
    () => generation,
    2,
    () => {
      ready = false;
    },
  )({});
  assert.equal(ready, false);
});

test('document save delegates only to native snapshot with explicit stale layout permission', () => {
  const calls = [],
    bytes = new Uint8Array([1, 2]);
  const editor = {
    save(options) {
      calls.push(options);
      return { bytes, layoutRequiresReflow: true };
    },
  };
  assert.deepEqual(saveDocument(editor, 'hwp5'), {
    bytes,
    format: 'hwp5',
    layoutRequiresReflow: true,
  });
  assert.deepEqual(calls, [{ allowStaleLayout: false }]);
  saveDocument(editor, 'hwp5', true);
  assert.deepEqual(calls[1], { allowStaleLayout: true });
  assert.throws(() => saveDocument(editor, 'hwp5', 'true'), /InvalidStaleLayoutPolicy/);
  assert.throws(() => saveDocument(editor, 'unknown'), /UnknownDocumentFormat/);
  assert.equal(calls.length, 2);
  assert.throws(() => saveDocument(null, 'hwpx'), /EditorNotOpen/);
  assert.deepEqual(saveDocument({ save: () => bytes }, 'hwpx'), {
    bytes,
    format: 'hwpx',
    layoutRequiresReflow: true,
  });
  assert.throws(
    () =>
      saveDocument(
        {
          save() {
            throw new Error('SaveFailed');
          },
        },
        'hwpx',
      ),
    /SaveFailed/,
  );
});

test('download copies native snapshot to a sanitized name and cleans URLs on click failure', () => {
  for (const failure of [false, true]) {
    const calls = [],
      link = {
        click() {
          calls.push('click');
          if (failure) throw new Error('BlockedDownload');
        },
        remove() {
          calls.push('remove');
        },
      };
    let cleanup;
    const browser = {
      Blob,
      document: { createElement: () => link, body: { append: () => calls.push('append') } },
      URL: {
        createObjectURL: (blob) => {
          assert.equal(blob.size, 2);
          return 'blob:test';
        },
        revokeObjectURL: (url) => calls.push(url),
      },
      setTimeout(fn, delay) {
        assert.equal(delay, 1000);
        cleanup = fn;
      },
    };
    const action = () =>
      downloadDocument(
        { bytes: new Uint8Array([1, 2]), format: 'hwpx' },
        '../bad\u0000.HWPX',
        browser,
      );
    if (failure) assert.throws(action, /BlockedDownload/);
    else action();
    assert.equal(link.download, 'bad.edited.hwpx');
    assert.equal(link.href, 'blob:test');
    assert.deepEqual(calls, ['append', 'click', 'remove']);
    cleanup();
    assert.equal(calls.at(-1), 'blob:test');
  }
  for (const snapshot of [
    { bytes: new Uint8Array(), format: 'hwp5' },
    { bytes: [1], format: 'hwpx' },
    { bytes: new Uint8Array([1]), format: 'other' },
  ])
    assert.throws(() => downloadDocument(snapshot, 'file'));
});
