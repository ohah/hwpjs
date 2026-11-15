import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorState } from '../../src/state/editor-state.ts';
import {
  inlineObjectInsertMessage,
  captureInlineObjectInsertPayload,
  getInlineObjectInsertAvailability,
} from '../../src/commands/inline-object-insert.ts';
import { profiles, optionsFor } from '../../../../tests/chart-kinds-fixtures.mjs';

const target = {
  editorId: 'e',
  documentId: 'd',
  generation: 1,
  operationRevision: 2,
  viewRevision: 3,
  coordinateSpace: 'display',
  format: 'hwpx',
  owner: 'section:0:body',
  section: 0,
  paragraph: 0,
  startUnit: 1,
  endUnit: 1,
  affinity: 'forward',
} as const;
function state(...versions: unknown[]) {
  const version = versions.length ? versions[0] : 1;
  return new EditorState({
    ...target,
    status: 'ready',
    stateVersion: 7,
    selection: target,
    content: {
      format: 'hwpx',
      chartCreationAvailable: true,
      chartCreateProfileVersion: version,
      paragraphs: [
        {
          section: 0,
          paragraph: 0,
          text: 'a😀b',
          selectionOwner: 'section:0:body',
          editable: true,
          plainEditable: true,
        },
      ],
    },
    nativeHistoryRevision: 4,
    nativeHistoryStats: { protocolVersion: 2 },
  } as any);
}
test('Core creates all sixteen exact profile wire messages with explicit matrices and roles', () => {
  for (const profile of profiles) {
    const options = optionsFor(profile);
    const captured = captureInlineObjectInsertPayload(
      { target, selectionVersion: 7, options },
      'chart',
    );
    options.series[0].values[0] = 900;
    const message = inlineObjectInsertMessage(captured, state(), 'chart') as any;
    assert.equal(message.kind, 'create-chart');
    assert.deepEqual(message.request.chart, profile);
    assert.equal(message.request.target.expected_text, 'a😀b');
    assert.equal(message.request.target.paragraph, 1);
    assert.notEqual(message.request.data.series[0].values[0], '900');
    if (profile.kind === 'bubbleChart') {
      assert.deepEqual(message.request.data.series[0].x_values, ['8', '13']);
      assert.deepEqual(message.request.data.series[0].bubble_sizes, ['0', '4']);
    }
    if (profile.kind === 'stockChart')
      assert.deepEqual(
        message.request.data.series.map((s: any) => s.stock_role),
        ['high', 'low', 'close'],
      );
  }
});
test('Core profile capability projection fails closed independently of legacy creation availability', () => {
  const profile = { kind: 'bubbleChart' } as const;
  for (const version of [undefined, null, 0, 2, '1', true]) {
    const s = state(version);
    assert.equal(getInlineObjectInsertAvailability(s, 'chart').enabled, true);
    assert.equal(getInlineObjectInsertAvailability(s, 'chart', profile).enabled, false);
    assert.throws(
      () =>
        inlineObjectInsertMessage(
          { target, selectionVersion: 7, options: optionsFor(profile) },
          s,
          'chart',
        ),
      /ChartCreateProfileUnavailable/,
    );
    const legacy = inlineObjectInsertMessage(
      {
        target,
        selectionVersion: 7,
        options: { width: 1, height: 1, categories: ['A'], series: [{ name: 'S', values: [-0] }] },
      },
      s,
      'chart',
    ) as any;
    assert.equal(Object.hasOwn(legacy.request, 'chart'), false);
    assert.equal(legacy.request.data.series[0].values[0], '0');
  }
});
test('Core rechecks source selection and profile capability at dispatch after capture', () => {
  const captured = captureInlineObjectInsertPayload(
    {
      target,
      selectionVersion: 7,
      options: optionsFor({ kind: 'scatterChart', scatter_style: 'marker' }),
    },
    'chart',
  );
  assert.throws(() => inlineObjectInsertMessage(captured, state(0), 'chart'), /Unavailable/);
  assert.throws(
    () => inlineObjectInsertMessage({ ...captured, selectionVersion: 6 }, state(), 'chart'),
    /Stale/,
  );
});
