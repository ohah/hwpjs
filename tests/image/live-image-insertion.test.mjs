import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createLiveImageInsertApi,
  checkedImageInsertOptions,
} from '../../js/live-image-insertion.mjs';
import {
  captureImageInsertPayload,
  imageInsertMessage,
} from '../../packages/core/src/commands/image-insert.ts';
const bytes = new Uint8Array([1, 2, 3]); // Transport only: Native owns image validation.
const owner = { kind: 'body', binding: { session: 's1', revision: 0, serial: '1' } };
const target = { section: 0, paragraph: 1, unit: 2, expected_text: '\ufffc\ufffc', owner };
function fixture(h5 = false, code = 1, cleanup = 0) {
  let serial = 0;
  const buffers = new Map(),
    calls = [];
  const memory = {
    withBytes(b, run) {
      const id = ++serial;
      buffers.set(id, b.slice());
      const result = run(id, b.length);
      if (id === cleanup) throw Error('cleanup');
      return result;
    },
    error: () => ({ message: 'NativeRejected' }),
  };
  const commit = (...args) => {
    calls.push(args);
    return code;
  };
  const wasm = h5
    ? {
        hwp5_edit_image_insert_version() {
          return 1;
        },
        hwp5_edit_insert_image_current(a, b, c, d, e, f) {
          return commit(a, b, c, d, e, f);
        },
      }
    : {
        hwpx_edit_image_insert_version() {
          return 1;
        },
        hwpx_edit_insert_image(a, b, c, d) {
          return commit(a, b, c, d);
        },
      };
  const api = createLiveImageInsertApi({
    wasm,
    memory,
    check() {},
    ...(h5
      ? {
          encode(ref) {
            assert.equal(ref.kind, 'original');
            return new Uint8Array([9]);
          },
        }
      : {}),
  });
  const request = {
    ...(h5 ? { reference: { kind: 'original' }, start: 16 } : { target }),
    imageBytes: bytes,
    width: 7200,
    height: 3600,
  };
  return { api, request, calls, buffers, wasm };
}
test('image transport HWPX metadata and owned bytes remain separate', () => {
  const f = fixture();
  assert.equal(f.api.supportsImageInsertionAbi(), true);
  assert.equal(f.api.insertImage(f.request).application, 'applied');
  const [meta, n, image, imn] = f.calls[0];
  assert.deepEqual(JSON.parse(new TextDecoder().decode(f.buffers.get(meta))), {
    target,
    width: 7200,
    height: 3600,
  });
  assert.equal(n, f.buffers.get(meta).length);
  assert.equal(imn, 3);
  assert.deepEqual(f.buffers.get(image), bytes);
});
test('image transport HWP5 preserves scoped reference and exact raw unit', () => {
  const f = fixture(true);
  assert.equal(f.api.insertImage(f.request).changed, true);
  const [r, rn, m, , i] = f.calls[0];
  assert.deepEqual(f.buffers.get(r), new Uint8Array([9]));
  assert.equal(rn, 1);
  assert.deepEqual(JSON.parse(new TextDecoder().decode(f.buffers.get(m))), {
    start: 16,
    width: 7200,
    height: 3600,
  });
  assert.deepEqual(f.buffers.get(i), bytes);
});
test('image transport missing or wrong version leaves old artifacts inactive', () => {
  const f = fixture();
  delete f.wasm.hwpx_edit_insert_image;
  assert.equal(f.api.supportsImageInsertionAbi(), false);
  assert.throws(() => f.api.insertImage(f.request), /Unavailable/);
  assert.equal(f.calls.length, 0);
});
test('image options reject getters shared buffers invalid size and extra fields', () => {
  assert.throws(
    () =>
      checkedImageInsertOptions({
        get imageBytes() {
          throw Error('accessor executed');
        },
        width: 1,
        height: 1,
      }),
    /InvalidInlineObjectRequest/,
  );
  assert.throws(
    () =>
      checkedImageInsertOptions({
        imageBytes: new Uint8Array(new SharedArrayBuffer(1)),
        width: 1,
        height: 1,
      }),
    /InvalidImageBytes/,
  );
  for (const width of [0, -1, 1.5, 2147483648, NaN])
    assert.throws(
      () => checkedImageInsertOptions({ imageBytes: bytes, width, height: 1 }),
      /InvalidPictureInsertionSize/,
    );
  assert.throws(
    () => checkedImageInsertOptions({ imageBytes: bytes, width: 1, height: 1, stale: true }),
    /InvalidInlineObjectRequest/,
  );
});
test('image transport rejects cell owners and invalid HWP5 unit before commit', () => {
  const f = fixture();
  f.request.target = {
    ...target,
    owner: { kind: 'sourceCell', binding: owner.binding, table_node: 1, list_node: 2 },
  };
  assert.throws(() => f.api.insertImage(f.request), /UnsupportedPictureInsertionHost/);
  assert.equal(f.calls.length, 0);
  const g = fixture(true);
  g.request.start = -0;
  assert.throws(() => g.api.insertImage(g.request), /InvalidImageInsertUnit/);
  assert.equal(g.calls.length, 0);
});
for (const code of [0, 1, 3])
  test(`image transport code ${code} survives outer image cleanup failure`, () => {
    const f = fixture(false, code, 1),
      out = f.api.insertImage(f.request);
    assert.equal(out.application, code === 1 ? 'applied' : code === 3 ? 'unknown' : 'unapplied');
    assert.equal(out.cleanupError, 'cleanup');
    assert.equal(out.refreshRequired, true);
    assert.equal(f.calls.length, 1);
  });
test('image Core queue capture owns bytes before caller mutation', () => {
  const t = {
    editorId: 'e',
    documentId: 'd',
    generation: 1,
    operationRevision: 0,
    viewRevision: 0,
    coordinateSpace: 'inline-object',
    format: 'hwpx',
    address: target,
  };
  const input = new Uint8Array([4, 5]);
  const p = captureImageInsertPayload({
    target: t,
    selectionVersion: 1,
    options: { imageBytes: input, width: 1, height: 1 },
  });
  input.fill(0);
  t.address.owner.binding.revision = 99;
  assert.deepEqual(p.options.imageBytes, new Uint8Array([4, 5]));
  assert.equal(p.target.address.owner.binding.revision, 0);
});
test('image Core absent ABI/read-only/history recovery refuse without mutation', () => {
  const payload = {
    target: {},
    selectionVersion: 0,
    options: { imageBytes: bytes, width: 1, height: 1 },
  };
  for (const [state, error] of [
    [{ status: 'loading' }, 'EditorNotReady'],
    [{ status: 'ready', historyRecoveryRequired: true }, 'HistoryRecoveryRequired'],
    [{ status: 'ready', content: { readOnly: true } }, 'ReadOnlyDocument'],
    [{ status: 'ready', content: { limited: true } }, 'ImageInsertionRequiresFullDocument'],
    [
      { status: 'ready', nativeHistoryStats: { protocolVersion: 2 }, nativeHistoryRevision: 0 },
      'ImageInsertionUnavailable',
    ],
  ])
    assert.throws(() => imageInsertMessage(payload, state), new RegExp(error));
});

import { EditorState } from '../../packages/core/src/state/editor-state.ts';
function ownedState(unit = 1, version = 7) {
  const token = {
    editorId: 'e',
    documentId: 'd',
    generation: 1,
    operationRevision: 2,
    viewRevision: 3,
  };
  const address = {
    section: 0,
    paragraph: 1,
    unit,
    expected_text: 'A😀B',
    owner: { kind: 'body', binding: { session: 's1', revision: 4, serial: '2' } },
  };
  const target = { ...token, coordinateSpace: 'inline-object', format: 'hwpx', address };
  const state = new EditorState({
    ...token,
    status: 'ready',
    stateVersion: version,
    nativeHistoryRevision: 4,
    nativeHistoryStats: { protocolVersion: 2 },
    content: {
      format: 'hwpx',
      imageInsertionAvailable: true,
      inlineObjectPlacementVersion: 1,
      paragraphs: [
        {
          section: 0,
          paragraph: 0,
          text: 'A😀B',
          editable: true,
          selectionOwner: 'section:0:body',
        },
      ],
    },
  });
  return {
    state,
    target,
    payload: {
      target,
      selectionVersion: 7,
      options: { imageBytes: bytes, width: 7200, height: 3600 },
    },
  };
}
test('image Core accepts exact Native body owner and UTF16 scalar caret', () => {
  const { state, payload } = ownedState(3);
  const message = imageInsertMessage(payload, state);
  assert.equal(message.kind, 'insert-image');
  assert.deepEqual(message.request.target, payload.target.address);
});
test('image Core rejects scalar interior stale state owner revision and source witness', () => {
  const scalar = ownedState(2);
  assert.throws(() => imageInsertMessage(scalar.payload, scalar.state), /InvalidScalarBoundary/);
  const stale = ownedState(1, 8);
  assert.throws(
    () => imageInsertMessage(stale.payload, stale.state),
    /StaleInlineObjectInsertSelection/,
  );
  const revision = ownedState();
  revision.payload.target.address.owner.binding.revision = 3;
  assert.throws(
    () => imageInsertMessage(revision.payload, revision.state),
    /StaleInlineObjectOwner/,
  );
  const source = ownedState();
  source.payload.target.address.expected_text = 'other';
  assert.throws(() => imageInsertMessage(source.payload, source.state), /InlineObjectTextMismatch/);
});
