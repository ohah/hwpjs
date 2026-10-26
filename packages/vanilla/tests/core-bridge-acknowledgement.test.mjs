import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const { createControlBridge } = await import(
  process.env.HWPJS_TEST_BRIDGE_MODULE ?? '../src/core-bridge.ts'
);
const gate = () => {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
};
const microtasks = async () => {
  for (let n = 0; n < 30; n++) await Promise.resolve();
};
function fixture({ newDocument = false, reentrant = false, throwUI = true } = {}) {
  let state = {
      status: 'ready',
      documentId: 'one',
      generation: 1,
      operationRevision: 0,
      token: { documentId: 'one', generation: 1 },
    },
    calls = 0;
  const second = gate(),
    acks = [],
    errors = [];
  let bridge;
  const committed = () => ({
    status: 'committed-with-snapshot',
    state,
    reply: { historyRevision: state.operationRevision },
  });
  const lease = {
    isActive: () => true,
    async request() {
      calls++;
      if (calls === 2) await second.promise;
      state = { ...state, operationRevision: state.operationRevision + 1 };
      return committed();
    },
  };
  bridge = createControlBridge({
    state: () => state,
    lease,
    acknowledge(reply) {
      acks.push(reply);
      if (acks.length === 1 && throwUI) {
        if (newDocument)
          state = {
            status: 'ready',
            documentId: 'two',
            generation: 2,
            operationRevision: 0,
            token: { documentId: 'two', generation: 2 },
          };
        if (reentrant) assert.equal(bridge.request({ kind: 'splice', text: 'Y' }), true);
        throw Error('화면 콜백 반례');
      }
    },
    error: (error) => errors.push(error),
  });
  return {
    bridge,
    second,
    acks,
    errors,
    get calls() {
      return calls;
    },
    get state() {
      return state;
    },
  };
}
test('성공 ACK 뒤 UI 예외는 미적용 합성 ACK로 재전달하지 않음', async () => {
  const f = fixture();
  f.bridge.request({ kind: 'splice', text: 'X' });
  await f.bridge.flush();
  assert.equal(f.calls, 1);
  assert.equal(f.acks.length, 1);
  assert.equal(f.acks[0].applied, true);
  assert.equal(f.acks[0].historyRevision, 1);
  assert.equal(f.errors.length, 1);
  assert.equal(f.errors[0].name, 'InputSurfaceAcknowledgementCallbackError');
  assert.equal(f.errors[0].cause.message, '화면 콜백 반례');
  assert.equal(f.state.operationRevision, 1);
  assert.equal(f.bridge.busy(), false);
});
for (const newDocument of [false, true])
  test(
    newDocument
      ? '새 문서의 다음 요청을 이전 UI 예외가 해제하지 않음'
      : '같은 문서의 다음 요청을 이전 UI 예외가 해제하지 않음',
    async (t) => {
      const f = fixture({ newDocument, reentrant: true });
      t.after(async () => {
        f.second.resolve();
        await f.bridge.flush();
      });
      f.bridge.request({ kind: 'splice', text: 'X' });
      await microtasks();
      assert.equal(f.calls, 2);
      assert.equal(f.acks.length, 1);
      assert.equal(f.errors.length, 1);
      assert.equal(f.errors[0].name, 'InputSurfaceAcknowledgementCallbackError');
      assert.equal(f.errors[0].documentId, 'one');
      assert.equal(f.errors[0].generation, 1);
      assert.equal(f.bridge.busy(), true);
      assert.equal(f.bridge.request({ kind: 'splice', text: 'Z' }), false);
      f.second.resolve();
      await f.bridge.flush();
      assert.equal(f.calls, 2);
      assert.equal(f.acks.length, 2);
      assert(f.acks.every((ack) => ack.applied === true));
      assert.equal(f.bridge.busy(), false);
    },
  );
test('응답 전 요청 실패는 원래 오류 ACK를 한 번 전달하며 자동 재시도하지 않음', async () => {
  const f = fixture({ throwUI: false });
  let calls = 0;
  const acks = [],
    errors = [];
  const bridge = createControlBridge({
    state: () => f.state,
    lease: {
      isActive: () => true,
      async request() {
        calls++;
        throw Error('요청 실패');
      },
    },
    acknowledge: (r) => acks.push(r),
    error: (e) => errors.push(e),
  });
  bridge.request({ kind: 'splice', text: 'X' });
  await bridge.flush();
  assert.equal(calls, 1);
  assert.equal(acks.length, 1);
  assert.equal(acks[0].applied, false);
  assert.match(acks[0].error, /요청 실패/);
  assert.equal(errors.length, 1);
  assert.equal(bridge.busy(), false);
});
test('정상 연속 성공은 요청·ACK·이력 revision을 각각 한 번 유지', async () => {
  const f = fixture({ throwUI: false });
  f.bridge.request({ kind: 'splice', text: 'X' });
  await f.bridge.flush();
  f.second.resolve();
  f.bridge.request({ kind: 'splice', text: 'Y' });
  await f.bridge.flush();
  assert.equal(f.calls, 2);
  assert.deepEqual(
    f.acks.map((a) => a.historyRevision),
    [1, 2],
  );
  assert.equal(f.errors.length, 0);
});
test('닫힌 표면의 늦은 응답은 새 UI 콜백을 만들지 않음', async () => {
  const f = fixture({ throwUI: false }),
    pending = gate(),
    acks = [];
  const bridge = createControlBridge({
    state: () => f.state,
    lease: { isActive: () => true, request: () => pending.promise },
    acknowledge: (r) => acks.push(r),
    error: (e) => {
      throw e;
    },
  });
  bridge.request({ kind: 'splice', text: 'X' });
  await microtasks();
  bridge.close();
  pending.resolve({
    status: 'committed-with-snapshot',
    state: f.state,
    reply: { historyRevision: 1 },
  });
  await bridge.flush();
  assert.equal(acks.length, 0);
  assert.equal(bridge.ready(), false);
});
for (const format of ['hwp5', 'hwpx'])
  test(
    '실제 Native ' + format + ' 성공 텍스트·이력·저장·undo 바이트를 UI 예외가 바꾸지 않음',
    {
      skip:
        !process.env.HWPJS_TEST_WASM &&
        '명시 HWPJS_TEST_WASM이 없어 실제 Native 검증은 실행하지 않음',
    },
    async (t) => {
      const root = process.cwd(),
        coreRoot = process.env.HWPJS_TEST_CORE_ROOT ?? resolve(root, 'packages/core/src');
      const { createEditor } = await import(pathToFileURL(resolve(coreRoot, 'index.ts')).href);
      const { createReaderRuntimeFactory } = await import(
        pathToFileURL(resolve(coreRoot, 'runtime.ts')).href
      );
      const wasm = await readFile(process.env.HWPJS_TEST_WASM);
      const wasmSHA256 = createHash('sha256').update(wasm).digest('hex');
      const editor = createEditor({
        runtimeFactory: createReaderRuntimeFactory({ wasmModule: await WebAssembly.compile(wasm) }),
      });
      t.after(() => editor.dispose());
      const ext = format === 'hwp5' ? 'hwp' : 'hwpx',
        original = await readFile(
          resolve(root, 'legacy/rust/crates/hwp-core/tests/fixtures/charshape.' + ext),
        );
      await editor.load(original, { format, editable: true });
      const before = editor.getEditorState(),
        row = before.content.paragraphs.find((p) => p.text === '기울임진하게');
      assert(row?.editable);
      const lease = editor.acquireInputSurface({
        commitComposition: async () => 'unchanged',
        cancelComposition() {},
      });
      t.after(() => lease.release());
      const acks = [],
        errors = [];
      let requests = 0;
      const bridge = createControlBridge({
        state: () => editor.getEditorState(),
        lease: {
          isActive: () => lease.isActive(),
          request: (...args) => {
            requests++;
            return lease.request(...args);
          },
        },
        acknowledge: (r) => {
          acks.push(r);
          if (r.applied === true) throw Error('실제 응답 후 UI 반례');
        },
        error: (e) => errors.push(e),
      });
      t.after(() => bridge.close());
      assert.equal(
        bridge.request({
          kind: 'splice',
          origin: 'canvas',
          section: row.section,
          paragraph: row.paragraph,
          ...(row.currentReference ? { reference: row.currentReference } : {}),
          startUnit: row.text.length,
          endUnit: row.text.length,
          text: 'X',
        }),
        true,
      );
      await bridge.flush();
      const edited = editor.getEditorState();
      assert.equal(
        edited.content.paragraphs.find(
          (p) => p.section === row.section && p.paragraph === row.paragraph,
        ).text,
        row.text + 'X',
      );
      assert.equal(edited.nativeHistoryRevision, 1);
      if (process.env.HWPJS_TEST_BRIDGE_EVIDENCE === '1')
        console.log(
          JSON.stringify({
            scope: '실제 Native 성공 응답',
            wasmSHA256,
            format,
            text: edited.content.paragraphs.find(
              (p) => p.section === row.section && p.paragraph === row.paragraph,
            ).text,
            revision: edited.nativeHistoryRevision,
            requests,
            acks: acks.map((r) => ({ applied: r.applied, error: r.error ?? null })),
            errors: errors.map((e) => e.name),
          }),
        );
      assert.equal(requests, 1);
      assert.equal(acks.length, 1);
      assert.equal(acks[0].applied, true);
      assert.equal(errors.length, 1);
      assert.equal(errors[0].name, 'InputSurfaceAcknowledgementCallbackError');
      const saved = await editor.save({ allowStaleLayout: true });
      if (format === 'hwp5') {
        const { verifyRaw } = await import(
          pathToFileURL(resolve(root, 'tests/hwp5/style-preservation/text-record-oracle.mjs')).href
        );
        verifyRaw(original, Buffer.from(saved.bytes), 0, 1, row.text.length, row.text.length, 'X');
        assert.throws(() =>
          verifyRaw(
            original,
            Buffer.from(saved.bytes),
            0,
            1,
            row.text.length,
            row.text.length,
            'wrong',
          ),
        );
      } else {
        const payload = {
          before: original.toString('base64'),
          after: Buffer.from(saved.bytes).toString('base64'),
          part: 'Contents/section0.xml',
          index: 1,
          start: row.text.length,
          end: row.text.length,
          text: 'X',
        };
        for (const flags of [[], ['-O']]) {
          const good = spawnSync('python3', [...flags, 'tools/hwpx-plain-splice-oracle.py'], {
            input: JSON.stringify(payload),
            encoding: 'utf8',
          });
          assert.equal(good.status, 0, good.stderr);
          const bad = spawnSync('python3', [...flags, 'tools/hwpx-plain-splice-oracle.py'], {
            input: JSON.stringify({ ...payload, text: 'wrong' }),
            encoding: 'utf8',
          });
          assert.notEqual(bad.status, 0);
        }
      }
      const undo = await editor.undo();
      assert.equal(undo.error, undefined);
      assert.equal(editor.getEditorState().nativeHistoryRevision, 0);
      assert.equal(
        editor
          .getEditorState()
          .content.paragraphs.find(
            (p) => p.section === row.section && p.paragraph === row.paragraph,
          ).text,
        row.text,
      );
      const undone = await editor.save({ allowStaleLayout: true });
      assert.deepEqual(Buffer.from(undone.bytes), original);
      const redo = await editor.redo();
      assert.equal(redo.error, undefined);
      assert.equal(editor.getEditorState().nativeHistoryRevision, 1);
      const redone = await editor.save({ allowStaleLayout: true });
      assert.deepEqual(Buffer.from(redone.bytes), Buffer.from(saved.bytes));
      await editor.load(saved.bytes, { format, editable: true });
      assert(editor.getEditorState().content.paragraphs.some((p) => p.text === row.text + 'X'));
    },
  );
