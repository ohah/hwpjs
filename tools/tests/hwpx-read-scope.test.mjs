import assert from 'node:assert/strict';
import test from 'node:test';
import { createHwpxReadScopeApi } from '../../js/hwpx-read-scope.mjs';
import { readDocumentModel } from '../../packages/document/src/document-model.ts';

function scope({ beginResult = 17, endResult = 1 } = {}) {
  const calls = [];
  let active = false;
  const cleanupError = new Error('NativeScopeCleanupFailure');
  const api = createHwpxReadScopeApi({
    wasm: {
      hwpx_edit_read_scope_begin(section) {
        calls.push(['begin', section]);
        active = beginResult !== 0;
        return beginResult;
      },
      hwpx_edit_read_scope_end(token) {
        calls.push(['end', token]);
        active = false;
        return endResult;
      },
    },
    ready() {
      calls.push(['ready']);
    },
    uint(value) {
      if (!Number.isInteger(value) || value < 0 || value > 0xffffffff)
        throw new RangeError('InvalidSection');
    },
    error: () => cleanupError,
  });
  return { api, calls, cleanupError, active: () => active };
}

test('old WASM has no read scope and incomplete optional ABI is rejected', () => {
  assert.deepEqual(createHwpxReadScopeApi({ wasm: {} }), {});
  assert.throws(
    () => createHwpxReadScopeApi({ wasm: { hwpx_edit_read_scope_begin() {} } }),
    /InvalidHwpxReadScopeAbi/,
  );
  assert.throws(
    () => createHwpxReadScopeApi({ wasm: { hwpx_edit_read_scope_end() {} } }),
    /InvalidHwpxReadScopeAbi/,
  );
});

test('successful synchronous scope forwards section, return value and exact token once', () => {
  const f = scope();
  const value = {};
  assert.equal(
    f.api.withReadObservations(3, () => {
      assert(f.active());
      return value;
    }),
    value,
  );
  assert.deepEqual(f.calls, [['ready'], ['begin', 3], ['end', 17]]);
  assert.equal(f.active(), false);
});

test('preparation failure uses original queries once without ending another scope', () => {
  const f = scope({ beginResult: 0 });
  let calls = 0;
  assert.equal(
    f.api.withReadObservations(0, () => ++calls),
    1,
  );
  assert.equal(calls, 1);
  assert.deepEqual(f.calls, [['ready'], ['begin', 0]]);
});

test('callback errors including undefined preserve identity and still end the scope', () => {
  for (const cause of [new Error('QueryFailure'), undefined]) {
    const f = scope();
    let caught = false;
    try {
      f.api.withReadObservations(0, () => {
        throw cause;
      });
    } catch (error) {
      caught = true;
      assert.equal(error, cause);
    }
    assert(caught);
    assert.equal(f.active(), false);
    assert.deepEqual(f.calls.at(-1), ['end', 17]);
  }
});

test('cleanup errors are surfaced and preserve both failures when callback also fails', () => {
  const f = scope({ endResult: 0 });
  assert.throws(
    () => f.api.withReadObservations(0, () => 1),
    (error) => error === f.cleanupError,
  );
  const primary = new Error('Primary');
  assert.throws(
    () =>
      f.api.withReadObservations(0, () => {
        throw primary;
      }),
    (error) => {
      assert.deepEqual(error.errors, [primary, f.cleanupError]);
      return true;
    },
  );
});

test('async callbacks, rejected Promises and throwing then accessors cannot retain a scope', async () => {
  for (const value of [
    Promise.resolve(1),
    Promise.reject(new Error('AsyncFailure')),
    // Intentional invalid callback result verifies synchronous borrow rejection.
    // eslint-disable-next-line unicorn/no-thenable
    { then() {} },
  ]) {
    const f = scope();
    assert.throws(
      () => f.api.withReadObservations(0, () => value),
      /AsyncReadObservationScopeUnsupported/,
    );
    assert.equal(f.active(), false);
  }
  const f = scope(),
    cause = new Error('ThenGetterFailure');
  assert.throws(
    () =>
      f.api.withReadObservations(0, () => ({
        // Intentional accessor failure must still release the Native borrow.
        // eslint-disable-next-line unicorn/no-thenable
        get then() {
          throw cause;
        },
      })),
    (error) => error === cause,
  );
  assert.equal(f.active(), false);
  await new Promise((resolve) => setImmediate(resolve));
});

test('invalid sections and callbacks never begin a Native scope', () => {
  for (const section of [-1, 1.2, NaN, 0x100000000]) {
    const f = scope();
    assert.throws(() => f.api.withReadObservations(section, () => 1));
    assert.deepEqual(f.calls, [['ready']]);
  }
  const f = scope();
  assert.throws(() => f.api.withReadObservations(0, null), /ExpectedReadObservationCallback/);
  assert.deepEqual(f.calls, [['ready']]);
});

function observations(onQuery, failBorder = false) {
  const query = (name, value) => (section) => {
    onQuery(name, section);
    return value(section);
  };
  const sdk = {
    paragraphFlow: query('paragraphFlow', (s) => [
      { paragraph: s + 1, source_node: s + 1, host: 'body', top_level: true },
    ]),
    paragraphTextSnapshot: query('paragraphTextSnapshot', (s) => [
      { paragraph: s + 1, text: `body ${s}` },
    ]),
    tableBorderSources: query('tableBorderSources', () => {
      if (failBorder) throw new Error('OriginalBorderFailure');
      return { cells: [], styles: [] };
    }),
  };
  for (const name of [
    'tableBindings',
    'tablePlacements',
    'pageAreaDeclarations',
    'pictureSites',
    'pictureOwners',
    'chartSites',
    'equationSites',
    'oleSites',
    'rectangleNodes',
    'lineNodes',
    'connectorNodes',
    'ellipseSources',
    'drawingTextBindings',
  ])
    sdk[name] = query(name, () => []);
  return sdk;
}

test('model rejects scopes that skip, duplicate or replace the observation callback result', async () => {
  const input = { format: 'hwpx', sourceSha256: 'a'.repeat(64), sectionCount: 1 };
  for (const withReadObservations of [
    () => ({}),
    (_section, read) => {
      read();
      return {};
    },
    (_section, read) => {
      read();
      return read();
    },
  ]) {
    const sdk = { ...observations(() => {}), withReadObservations };
    await assert.rejects(readDocumentModel({ ...input, sdk }), /ReadObservation/);
  }
});

test('prototype pollution cannot install a read scope capability', async () => {
  const input = { format: 'hwpx', sourceSha256: 'a'.repeat(64), sectionCount: 1 };
  const sdk = observations(() => {});
  Object.setPrototypeOf(sdk, {
    withReadObservations() {
      throw Error('PrototypeScope');
    },
  });
  const expected = await readDocumentModel({ ...input, sdk: observations(() => {}) });
  assert.deepEqual(await readDocumentModel({ ...input, sdk }), expected);
});

for (const failBorder of [false, true])
  test(`scoped model equals legacy data and diagnostics; query failure=${failBorder}`, async () => {
    const input = { format: 'hwpx', sourceSha256: 'a'.repeat(64), sectionCount: 2 };
    const legacy = await readDocumentModel({ ...input, sdk: observations(() => {}, failBorder) });
    const f = scope(),
      queries = [];
    const sdk = {
      ...observations((name, section) => {
        assert(f.active());
        queries.push([name, section]);
      }, failBorder),
      ...f.api,
    };
    assert.deepEqual(await readDocumentModel({ ...input, sdk }), legacy);
    assert.equal(queries.length, 32);
    assert.deepEqual(f.calls, [
      ['ready'],
      ['begin', 0],
      ['end', 17],
      ['ready'],
      ['begin', 1],
      ['end', 17],
    ]);
    assert.equal(f.active(), false);
  });
