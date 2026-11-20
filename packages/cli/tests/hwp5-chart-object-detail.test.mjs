import { runCLI } from '../src/main.ts';
import { documentTools } from '../src/mcp/tools.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectDocumentObject } from '../src/document-objects.ts';
import { buildObjectReference } from '../src/object-reference.ts';
import { display, candidates } from '../../../tests/hwp5/chart-display-wire-fixture.mjs';
const hash = 'a'.repeat(64);
function fixture() {
  const d = display();
  d.section = 0;
  const owner = d.owner;
  Object.assign(owner, {
    control_node: 9,
    component_node: 10,
    ole_node: 11,
    ole_layout: 'spec24',
    attributes: 1,
  });
  Object.assign(owner.geometry, { control_node: 9, component_node: 10 });
  const packet = candidates();
  packet.candidates[0] = {
    section: 0,
    owner: structuredClone(owner),
    resource: {
      state: 'modern_chart',
      physical_id: d.physical_id,
      resource_sha256: [...d.resource_sha256],
      stream_entry: d.stream_entry,
      legacy_backup_present: d.legacy_backup_present,
      presentation_streams: d.presentation_streams,
      error_name: null,
    },
  };
  const reference = buildObjectReference({
    sourceSha256: hash,
    format: 'hwp5',
    section: 0,
    kind: 'drawing',
    node: 10,
  });
  const block = {
    id: 's0:o10',
    type: 'unknown',
    kind: 'drawing',
    nativeKind: 0x246f6c65,
    source: { section: 0, node: 10 },
    reference,
    diagnostic: { code: 'ObjectDetailsDeferred', message: 'Deferred' },
  };
  const model = {
    version: 1,
    format: 'hwp5',
    sourceSha256: hash,
    sections: [{ body: [block], header: { definitions: [] }, footer: { definitions: [] } }],
    unplaced: [],
  };
  const calls = [];
  const sdk = {
    supportsHwp5ChartDisplayAbi: () => true,
    hwp5ChartCandidates() {
      calls.push(['candidates']);
      return packet;
    },
    hwp5ChartDisplay(...args) {
      calls.push(['display', ...args]);
      return d;
    },
    save() {
      throw Error('MutationForbidden');
    },
    createChart() {
      throw Error('MutationForbidden');
    },
  };
  let closed = 0;
  const doc = {
    format: 'hwp5',
    sourceSha256: hash,
    sectionCount: 1,
    sdk,
    close: async () => {
      closed++;
    },
  };
  const deps = { openDocument: async () => doc, readDocumentModel: async () => model };
  return {
    d,
    packet,
    owner,
    block,
    model,
    sdk,
    doc,
    deps,
    reference,
    calls,
    closed: () => closed,
    inspect: (options = {}) =>
      inspectDocumentObject(
        { bytes: Uint8Array.of(1), wasm: Uint8Array.of(2), reference, ...options },
        deps,
      ),
  };
}
test('H5 object detail routes verified drawing component10 through selected control9 without changing reference', async () => {
  const f = fixture();
  const r = await f.inspect();
  assert.equal(r.status, 'available');
  assert.equal(r.kind, 'drawing');
  assert.equal(r.reference, f.reference);
  assert.match(r.text, /hwp5_chart/);
  assert.match(r.text, /component_node: 10/);
  assert.match(r.text, /control_node: 9/);
  assert.match(r.text, /값 순번: 0/);
  assert.deepEqual(f.calls, [['candidates'], ['display', 0, 9]]);
  assert.equal(f.closed(), 1);
});
test('H5 object detail retains observed26 opaque4 and raw attributes without UI aspect restrictions', async () => {
  const f = fixture();
  for (const owner of [f.owner, f.packet.candidates[0].owner])
    Object.assign(owner, {
      ole_layout: 'observed26',
      opaque_tail_bytes: 4,
      attributes: 0xffffffff,
    });
  assert.equal((await f.inspect()).status, 'available');
});
test('H5 object detail does not route ordinary drawings or unverified inventory to chart methods', async () => {
  for (const mutate of [
    (f) => {
      f.block.nativeKind = 0x246c696e;
    },
    (f) => {
      f.block.diagnostic.code = 'ObjectOwnerUnverified';
    },
    (f) => {
      f.block.detailUnavailable = true;
    },
  ]) {
    const f = fixture();
    mutate(f);
    assert.equal((await f.inspect()).status, 'unavailable');
    assert.deepEqual(f.calls, []);
  }
});
test('H5 object detail preserves stale SHA and inventory reference guards before chart calls', async () => {
  for (const mutate of [
    (f) => {
      f.doc.sourceSha256 = 'b'.repeat(64);
    },
    (f) => {
      f.block.source.node = 9;
    },
    (f) => {
      f.block.kind = 'chart';
    },
  ]) {
    const f = fixture();
    mutate(f);
    await assert.rejects(f.inspect(), /StaleObjectReference|InvalidObjectModel/);
    assert.deepEqual(f.calls, []);
    assert.equal(f.closed(), 1);
  }
  const f = fixture();
  await assert.rejects(
    f.inspect({
      reference: buildObjectReference({
        sourceSha256: hash,
        format: 'hwp5',
        section: 0,
        kind: 'chart',
        node: 10,
      }),
    }),
    /ObjectReferenceNotFound/,
  );
  assert.deepEqual(f.calls, []);
});
test('H5 object detail missing or unsupported optional ABI remains unavailable without read calls', async () => {
  for (const key of ['supportsHwp5ChartDisplayAbi', 'hwp5ChartCandidates', 'hwp5ChartDisplay']) {
    const f = fixture();
    delete f.sdk[key];
    assert.equal((await f.inspect()).status, 'unavailable');
    assert.deepEqual(f.calls, []);
  }
  const f = fixture();
  f.sdk.supportsHwp5ChartDisplayAbi = () => false;
  assert.equal((await f.inspect()).status, 'unavailable');
  assert.deepEqual(f.calls, []);
});
test('H5 object detail cannot promote unresolved OLE or a missing candidate into a chart', async () => {
  for (const mutate of [
    (f) => {
      f.packet.candidates = [];
    },
    (f) => {
      f.packet.candidates[0].section = 1;
    },
    (f) => {
      f.packet.candidates[0].resource = {
        state: 'unresolved_ole',
        physical_id: null,
        resource_sha256: null,
        stream_entry: null,
        legacy_backup_present: null,
        presentation_streams: null,
        error_name: 'MissingOOXMLChartContents',
      };
    },
  ]) {
    const f = fixture();
    mutate(f);
    assert.equal((await f.inspect()).status, 'unavailable');
    assert.deepEqual(f.calls, [['candidates']]);
  }
});
test('H5 object detail duplicate selected control or component is rejected before display', async () => {
  for (const distinctControl of [false, true]) {
    const f = fixture();
    const row = structuredClone(f.packet.candidates[0]);
    if (distinctControl) {
      row.owner.control_node = 8;
      row.owner.geometry.control_node = 8;
    }
    f.packet.candidates.push(row);
    await assert.rejects(f.inspect(), /InvalidObjectDetail/);
    assert.deepEqual(f.calls, [['candidates']]);
    assert.equal(f.closed(), 1);
  }
});
test('H5 object detail binds display to exact epoch history owner section and resource without retry', async () => {
  const changes = [
    (d) => {
      d.source_epoch = '10';
    },
    (d) => {
      d.history_revision = 4;
    },
    (d) => {
      d.section = 1;
    },
    (d) => {
      d.owner.attributes = 2;
    },
    (d) => {
      d.owner.opaque_tail_bytes = 4;
    },
    (d) => {
      d.owner.control_node = 8;
      d.owner.geometry.control_node = 8;
    },
    (d) => {
      d.physical_id = 2;
    },
    (d) => {
      d.resource_sha256[0]++;
    },
    (d) => {
      d.stream_entry = 2;
    },
    (d) => {
      d.presentation_streams = 2;
    },
    (d) => {
      d.legacy_backup_present = true;
    },
  ];
  for (const mutate of changes) {
    const f = fixture();
    mutate(f.d);
    await assert.rejects(f.inspect(), /InvalidObjectDetail/);
    assert.deepEqual(f.calls, [['candidates'], ['display', 0, 9]]);
    assert.equal(f.closed(), 1);
  }
});
test('H5 object detail accepts semantically equal owner with a different object property order', async () => {
  const f = fixture();
  f.d.owner = Object.fromEntries(Object.entries(f.owner).reverse());
  assert.equal((await f.inspect()).status, 'available');
});
test('H5 object detail retains native read failures as unavailable and closes once', async () => {
  for (const method of ['hwp5ChartCandidates', 'hwp5ChartDisplay']) {
    const f = fixture();
    f.sdk[method] = () => {
      throw Error('NativeReadRefused');
    };
    const r = await f.inspect();
    assert.equal(r.status, 'unavailable');
    assert.match(r.text, /NativeReadRefused/);
    assert.equal(f.closed(), 1);
  }
});
test('H5 object detail malformed chart data and HWPX aliases never fall back', async () => {
  for (const mutate of [
    (d) => {
      d.pair = { wrapper_node: 10 };
    },
    (d) => {
      d.data.points[0].point_node = -1;
    },
    (d) => {
      d.owner.geometry.kind_id = 0x24706963;
    },
  ]) {
    const f = fixture();
    mutate(f.d);
    await assert.rejects(f.inspect(), /InvalidObjectDetail/);
    assert.equal(f.closed(), 1);
  }
});
test('H5 object detail uses existing output escaping and byte cap for unavailable data', async () => {
  const f = fixture();
  Object.assign(f.packet.candidates[0], {
    resource: {
      state: 'unavailable',
      physical_id: null,
      resource_sha256: null,
      stream_entry: null,
      legacy_backup_present: null,
      presentation_streams: null,
      error_name: '<img>&\u202e',
    },
  });
  const r = await f.inspect({ format: 'markdown' });
  assert.equal(r.status, 'unavailable');
  assert.ok(!r.text.includes('\u202e'));
  assert.match(r.text, /&amp;/);
  const g = fixture();
  g.packet.candidates[0].resource = {
    ...f.packet.candidates[0].resource,
    error_name: 'x'.repeat(65536),
  };
  await assert.rejects(g.inspect(), /ObjectDetailLimitExceeded/);
  assert.equal(g.closed(), 1);
});

test('H5 object detail uses the real shared model inventory without changing drawing refs', async () => {
  const f = fixture();
  Object.assign(f.sdk, {
    paragraphCount: () => 1,
    currentTextPreview: () => ({
      sections: [
        {
          index: 0,
          paragraphs: [
            { nodeIndex: 0, text: 'chart', textPresent: true, declaredUnits: 5, tokens: [] },
          ],
        },
      ],
    }),
    paragraphFlow: () => [
      {
        paragraph: 0,
        source_node: 0,
        template_node: 0,
        generated: false,
        host: 'body',
        top_level: true,
      },
    ],
    text: () => 'chart',
    tableBindings: () => [],
    tablePlacements: () => [],
    tableLayoutSources: () => [],
    cellLayoutSources: () => [],
    pageAreaSources: () => [],
    tableAnchors: () => [],
    pictureSources: () => [],
    drawingSources: () => [f.owner.geometry],
    drawingAnchors: () => [{ component_node: 10, control_node: 9, paragraph: 0, current_unit: 16 }],
    drawingComponentSources: () => [{ component_node: 10, owner_node: 9, kind_id: 0x246f6c65 }],
  });
  delete f.deps.readDocumentModel;
  const r = await f.inspect();
  assert.equal(r.status, 'available');
  assert.equal(r.reference, f.reference);
  assert.deepEqual(f.calls, [['candidates'], ['display', 0, 9]]);
});
function hostFixture() {
  const f = fixture(),
    out = [],
    err = [];
  const deps = {
    files: {
      resolveWasmPath: () => 'native.wasm',
      readInputSnapshot: async (path) => ({
        bytes: Uint8Array.of(1),
        sha256: path === 'native.wasm' ? '0'.repeat(64) : hash,
        path,
      }),
    },
    io: { stdout: { write: (v) => out.push(v) }, stderr: { write: (v) => err.push(v) } },
    inspectDocumentObject: (input) => inspectDocumentObject(input, f.deps),
  };
  return { f, deps, out, err };
}
test('H5 object detail CLI object shares guarded service and preserves canonical kind', async () => {
  const { f, deps, out, err } = hostFixture();
  const code = await runCLI(
    ['object', '--ref=' + f.reference, '--wasm=native.wasm', '--', 'input.hwp'],
    deps,
  );
  assert.equal(code, 0);
  assert.deepEqual(err, []);
  assert.match(out.join(''), /hwp5_chart/);
  assert.deepEqual(f.calls, [['candidates'], ['display', 0, 9]]);
  assert.equal(f.closed(), 1);
});
test('H5 object detail MCP object tool follows the same CLI service without Native or transport mutation', async () => {
  const { f, deps } = hostFixture();
  const tool = documentTools({ wasmPath: 'native.wasm', cliDependencies: deps }).find(
    (t) => t.name === 'get_document_object',
  );
  const r = await tool.invoke({ inputPath: 'input.hwp', reference: f.reference, format: 'text' });
  assert.notEqual(r.isError, true);
  assert.match(r.content.map((x) => x.text).join(''), /hwp5_chart/);
  assert.deepEqual(f.calls, [['candidates'], ['display', 0, 9]]);
  assert.equal(f.closed(), 1);
});
