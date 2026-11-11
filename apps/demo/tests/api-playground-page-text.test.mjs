import assert from 'node:assert/strict';
import test from 'node:test';
import { apiSampleCode, createApiPlayground } from '../src/api-playground.mjs';

function harness(surface) {
  let state = { status: 'idle' };
  const calls = [];
  const editor = {
    read: (read) => read(state),
    load(bytes, options) {
      calls.push(['editor.load', bytes, options]);
      state = { status: 'ready', content: { format: options.format } };
    },
  };
  const api = createApiPlayground({
    editor,
    surface,
    getHistoryAvailability: () => ({}),
    loadFixture(...args) {
      calls.push(['fixture', ...args]);
      return Uint8Array.of(1);
    },
  });
  return { api, calls };
}

test('offers getPageText only with a mounted Surface port', async () => {
  const { api, calls } = harness(undefined);
  assert(!api.operations.includes('getPageText'));
  assert.equal((await api.execute('getPageText', { pageIndex: 0 })).error, 'UnknownApiSample');
  assert.deepEqual(calls, []);
});

test('passes physical index and typed filters to the same Surface without an editor command', async () => {
  const result = Object.freeze({
    state: 'available',
    pageIndex: 2,
    pageCount: 3,
    section: 0,
    text: '',
    coverage: 'complete',
    issues: [],
  });
  const forwarded = [];
  const surface = {
    getPageText(index, filter) {
      assert.equal(this, surface);
      forwarded.push([index, filter]);
      return result;
    },
  };
  const { api, calls } = harness(surface);
  const record = await api.execute('getPageText', { pageIndex: 2, include: ['body', 'caption'] });
  assert.deepEqual(forwarded, [[2, { include: ['body', 'caption'] }]]);
  assert.equal(record.result, result);
  assert.equal(record.ok, true);
  assert.deepEqual(record.before, record.after);
  assert.deepEqual(calls, []);
  assert.match(
    apiSampleCode('getPageText', record.args),
    /surface\.getPageText\(2, \{"include":\["body","caption"\]\}\)/,
  );
});

test('preserves partial coverage and unavailable reasons, including empty filters', async () => {
  const partial = Object.freeze({
    state: 'available',
    pageIndex: 0,
    pageCount: 1,
    section: 0,
    text: 'visible',
    coverage: 'partial',
    issues: [{ code: 'clipped-text', kind: 'body' }],
  });
  const unavailable = { state: 'unavailable', reason: 'page-out-of-range' };
  const { api } = harness({
    getPageText(index, filter) {
      if (index === 0) {
        assert.equal(filter, undefined);
        return partial;
      }
      assert.deepEqual(filter, { include: [] });
      return unavailable;
    },
  });
  const first = await api.execute('getPageText', { pageIndex: 0 });
  assert.equal(first.ok, true);
  assert.equal(first.result, partial);
  const second = await api.execute('getPageText', { pageIndex: 5, include: [] });
  assert.equal(second.ok, false);
  assert.equal(second.result, unavailable);
  assert.equal(second.error, 'page-out-of-range');
  assert.equal(
    (await api.execute('getPageText', { pageIndex: 0, generation: 3 })).error,
    'InvalidArgument:generation',
  );
});

test('loads only named samples and keeps the fixture selector out of editor.load options', async () => {
  const { api, calls } = harness();
  assert.equal(
    (await api.execute('load', { format: 'hwp5', fixture: 'textbox', editable: false })).ok,
    true,
  );
  assert.deepEqual(calls, [
    ['fixture', 'hwp5', 'textbox'],
    ['editor.load', Uint8Array.of(1), { format: 'hwp5', editable: false }],
  ]);
  assert.match(
    apiSampleCode('load', { format: 'hwp5', fixture: 'textbox' }),
    /editor\.load\(bytes, \{"format":"hwp5","editable":true\}\)/,
  );
  assert.equal(
    (await api.execute('load', { format: 'hwpx', fixture: '../other' })).error,
    'InvalidArgument:fixture',
  );
  assert.equal(calls.length, 2);
  await api.execute('load', { format: 'hwpx' });
  assert.deepEqual(calls[2], ['fixture', 'hwpx']);
});
