import test from 'node:test';
import assert from 'node:assert/strict';
import { selectDocumentTextObservation } from '../src/document-text-selection.ts';

// Admission/publication ports only. Real direct controller/geometry is tested
// separately; these cases make no Native or actual Surface-rendering claim.
function fixture(options: any = {}) {
  const token = {
    editorId: 'editor',
    documentId: 'doc',
    generation: 1,
    operationRevision: 0,
    viewRevision: 0,
  };
  let state: any = {
    ...token,
    token,
    status: 'ready',
    stateVersion: 1,
    nativeHistoryRevision: 7,
    content: { format: 'hwpx' },
    selection: undefined,
  };
  let selection: any = null,
    selected = 0,
    flushed = 0;
  const observation: any = {
    token,
    stateVersion: 1,
    native: {
      schemaVersion: 1,
      scope: 'native-document-text-selection',
      coordinateSpace: 'native-current-text-observation',
      executionAuthority: false,
      format: 'hwpx',
      binding: { session: 'native', revision: 7 },
      expectedOriginal: '😀',
      beforeText: '앞😀뒤',
      target: { kind: 'paragraph', section: 0, paragraph: 91, startUnit: 1, endUnit: 3 },
    },
  };
  const publish = (patch: any = {}) => {
    state = { ...state, ...patch, stateVersion: state.stateVersion + 1 };
    state.token = {
      editorId: state.editorId,
      documentId: state.documentId,
      generation: state.generation,
      operationRevision: state.operationRevision,
      viewRevision: state.viewRevision,
    };
  };
  const port = {
    state: () => state,
    ready: () => !options.notReady,
    admit(range: any) {
      return !options.offscreen && range.expectedText === '앞😀뒤';
    },
    select(range: any) {
      selected++;
      if (options.selectRefused) return false;
      const point = {
        section: range.section,
        ...(range.createdCell
          ? { createdCell: range.createdCell }
          : { paragraph: range.paragraph }),
      };
      selection = {
        anchor: { ...point, unit: range.startUnit },
        focus: { ...point, unit: range.endUnit },
      };
      return true;
    },
    async flush() {
      flushed++;
      await options.duringFlush?.();
      if (!options.failedPublication)
        publish({
          selection:
            observation.native.target.kind === 'created-cell' ? null : observation.native.target,
        });
      if (options.lostSelection) selection = null;
    },
    published: () => state.selection !== undefined,
    selection: () => selection,
  };
  return { observation, port, publish, state: () => state, counts: () => ({ selected, flushed }) };
}
test('Surface selection helper confirms existing direct selection and queued publication before returning state', async () => {
  const f = fixture();
  const result = await selectDocumentTextObservation(f.observation, () => true, f.port);
  assert.equal(result?.state, f.state());
  assert.equal(result?.state.stateVersion, 2);
  assert.deepEqual(f.counts(), { selected: 1, flushed: 1 });
});
test('Surface helper preserves lossless generated-cell locator without manufacturing a paragraph', async () => {
  const f = fixture();
  f.observation.native.target = {
    kind: 'created-cell',
    section: 2,
    identity: '18446744073709551615',
    row: 1,
    column: 0,
    startUnit: 1,
    endUnit: 3,
  };
  const result = await selectDocumentTextObservation(f.observation, () => true, f.port);
  assert.ok(result);
  assert.equal(result.state.selection, null);
  assert.equal((f.port.selection() as any).anchor.paragraph, undefined);
  assert.equal((f.port.selection() as any).anchor.createdCell.identity, '18446744073709551615');
});
test('stale token state version revision and expected text refuse before touching direct input', async () => {
  for (const mutate of [
    (o: any) => {
      o.token = { ...o.token, generation: 2 };
    },
    (o: any) => {
      o.stateVersion = 0;
    },
    (o: any) => {
      o.native.binding.revision = 6;
    },
    (o: any) => {
      o.native.expectedOriginal = '가나';
    },
    (o: any) => {
      o.native.executionAuthority = true;
    },
  ]) {
    const f = fixture();
    mutate(f.observation);
    assert.equal(await selectDocumentTextObservation(f.observation, () => true, f.port), null);
    assert.deepEqual(f.counts(), { selected: 0, flushed: 0 });
  }
});
test('offscreen unready or refused selection cannot be reported as success', async () => {
  for (const options of [{ offscreen: true }, { notReady: true }, { selectRefused: true }]) {
    const f = fixture(options);
    assert.equal(await selectDocumentTextObservation(f.observation, () => true, f.port), null);
    assert.equal(f.counts().flushed, 0);
  }
});
test('Core publication rejection or direct selection lost during publication is not a confirmed receipt', async () => {
  for (const options of [{ failedPublication: true }, { lostSelection: true }]) {
    const f = fixture(options);
    assert.equal(await selectDocumentTextObservation(f.observation, () => true, f.port), null);
    assert.deepEqual(f.counts(), { selected: 1, flushed: 1 });
  }
});
test('async document or view ABA and dialog closure prevent a late confirmed receipt', async () => {
  for (const patch of [
    { generation: 2 },
    { viewRevision: 1 },
    { operationRevision: 1 },
    { nativeHistoryRevision: 8 },
  ]) {
    let f: ReturnType<typeof fixture>;
    f = fixture({ duringFlush: () => f.publish(patch) });
    assert.equal(await selectDocumentTextObservation(f.observation, () => true, f.port), null);
  }
  let active = true;
  const f = fixture({
    duringFlush: () => {
      active = false;
    },
  });
  assert.equal(await selectDocumentTextObservation(f.observation, () => active, f.port), null);
});
