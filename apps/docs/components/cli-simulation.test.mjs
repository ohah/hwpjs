import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  createSimulation,
  simulationEditRequest,
  simulationCommand,
  simulationError,
} from './cli-simulation.mjs';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const area = () => ({
  declarations: 'known',
  definitions: [],
  inheritance: { state: 'unresolved' },
});
function makeModel(bytes, format = 'hwp5', ordinal = 2) {
  return {
    version: 1,
    format,
    sourceSha256: hash(bytes),
    sections: [
      {
        id: 's0',
        source: { section: 0 },
        header: area(),
        footer: area(),
        body: [
          {
            id: 's0:t10',
            type: 'table',
            rows: 1,
            columns: 1,
            cells: [
              {
                id: 's0:t10:c12',
                row: 0,
                column: 0,
                rowSpan: 1,
                columnSpan: 1,
                geometryKnown: true,
                contentState: 'observed',
                blocks: [
                  {
                    id: `s0:p${ordinal}`,
                    type: 'paragraph',
                    displayText: '보도일시',
                    editability: 'range-check-required',
                    source: { section: 0, paragraph: ordinal, node: 14 },
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    unplaced: [],
    warnings: [],
    coverage: { inventoryComplete: true },
  };
}
function setup({ format = 'hwp5', ordinal = 2, failEdit = false } = {}) {
  const calls = [],
    output = Uint8Array.of(7, 8, 9);
  const simulation = createSimulation({
    async read(options) {
      calls.push({ operation: 'read', ...options });
      return { format, model: makeModel(options.bytes, format, ordinal) };
    },
    async edit(options) {
      calls.push({ operation: 'edit', ...options });
      if (failEdit && !options.allowStaleLayout) throw Error('StaleLayout');
      return { format, bytes: output, changed: true, layoutRequiresReflow: format === 'hwp5' };
    },
  });
  const input = {
    bytes: Uint8Array.of(1, 2, 3),
    wasm: Uint8Array.of(0, 97, 115, 109),
    filename: format === 'hwp5' ? 'noori.hwp' : 'noori.hwpx',
  };
  return { simulation, calls, input, output };
}
const draft = (snapshot, extra = {}) => ({
  targetId: snapshot.paragraphs[0].id,
  expectedSha256: snapshot.sourceSha256,
  findText: '보도일시',
  replacement: '수정',
  outputName: snapshot.format === 'hwp5' ? 'new.hwp' : 'new.hwpx',
  allowStaleLayout: false,
  ...extra,
});

test('read calls shared engine, displays actual returned model, and emits no document JSON tree', async () => {
  const { simulation, input, calls } = setup();
  const snapshot = await simulation.read(input);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].operation, 'read');
  assert.equal(snapshot.sourceSha256, hash(input.bytes));
  assert.ok(snapshot.body.includes('Paragraph s0:p2 (native paragraph=2): 보도일시'));
  assert.ok(snapshot.body.includes('Table s0:t10'));
  assert.equal(snapshot.model, undefined);
  assert.equal(snapshot.bytes, undefined);
  assert.equal(snapshot.response.result.content[0].text.split('documentSHA256: ').length - 1, 1);
  assert.equal(snapshot.request.params.name, 'read_document');
  assert.ok(snapshot.command.startsWith('npx --no-install hwpjs read '));
  assert.deepEqual(snapshot.request.params.arguments, { inputPath: './noori.hwp', format: 'text' });
  assert.ok(Object.isFrozen(snapshot) && Object.isFrozen(snapshot.paragraphs[0]));
});

test('read captures original input and WASM before hashing awaits', async () => {
  const { simulation, input, calls } = setup();
  const original = Uint8Array.from(input.bytes);
  const pending = simulation.read(input);
  input.bytes.fill(99);
  input.wasm.fill(99);
  const snapshot = await pending;
  assert.equal(snapshot.sourceSha256, hash(original));
  assert.deepEqual(calls[0].bytes, original);
  assert.deepEqual(calls[0].wasm, Uint8Array.of(0, 97, 115, 109));
});

test('edit uses exact document-wide HWPX Native ordinal, source SHA and real engine output', async () => {
  const { simulation, input, calls, output } = setup({ format: 'hwpx', ordinal: 91 });
  const snapshot = await simulation.read(input),
    result = await simulation.edit(snapshot, draft(snapshot));
  assert.deepEqual(calls[1].target, { section: 0, paragraph: 91 });
  assert.equal(calls[1].replace, '보도일시');
  assert.equal(calls[1].with, '수정');
  assert.equal(result.sha256, hash(output));
  assert.equal(result.filename, 'new.hwpx');
  assert.equal(result.response.result.content[0].text.includes('sha256: ' + hash(output)), true);
  assert.equal(result.request.params.name, 'edit_document');
  assert.equal(result.request.params.arguments.target, 's0:p91');
  assert.equal(result.layoutRequiresReflow, false);
  output.fill(0);
  assert.deepEqual(result.bytes, Uint8Array.of(7, 8, 9));
});

test('HWP5 stale layout is never auto-allowed and Native refusal propagates', async () => {
  const { simulation, input, calls } = setup({ failEdit: true });
  const snapshot = await simulation.read(input);
  await assert.rejects(simulation.edit(snapshot, draft(snapshot)), /StaleLayout/);
  assert.equal(calls[1].allowStaleLayout, false);
  const result = await simulation.edit(snapshot, draft(snapshot, { allowStaleLayout: true }));
  assert.equal(result.layoutRequiresReflow, true);
  assert.equal(calls[2].allowStaleLayout, true);
  assert.ok(result.command.endsWith('--allow-stale-layout'));
});

test('forged snapshot, stale SHA and unobserved target fail before engine edit', async () => {
  const { simulation, input, calls } = setup();
  const snapshot = await simulation.read(input);
  await assert.rejects(
    simulation.edit({ ...snapshot }, draft(snapshot)),
    /UnknownSimulationSnapshot/,
  );
  await assert.rejects(
    simulation.edit(snapshot, draft(snapshot, { expectedSha256: '0'.repeat(64) })),
    /SourceSHA256Mismatch/,
  );
  await assert.rejects(
    simulation.edit(snapshot, draft(snapshot, { targetId: 's0:p999' })),
    /InvalidSimulationTarget/,
  );
  assert.equal(calls.length, 1);
});

test('browser download names stay new and in actual detected format', async () => {
  const { simulation, input, calls } = setup();
  const snapshot = await simulation.read(input);
  for (const outputName of ['noori.hwp', '../new.hwp', 'folder/new.hwp', 'new.hwpx', 'new\n.hwp'])
    await assert.rejects(simulation.edit(snapshot, draft(snapshot, { outputName })));
  assert.equal(calls.length, 1);
});

test('shell quoting preserves leading option values, apostrophes and empty deletion', async () => {
  const { simulation, input } = setup();
  const snapshot = await simulation.read(input);
  const request = simulationEditRequest(
    snapshot,
    draft(snapshot, { findText: "--it's", replacement: '' }),
  );
  const command = simulationCommand(request);
  assert.ok(command.startsWith('npx --no-install hwpjs edit '));
  assert.ok(command.includes("'--replace=--it'\\''s'"));
  assert.ok(command.includes("'--with='"));
  assert.equal(request.params.arguments.findText, "--it's");
  assert.equal(request.params.arguments.replacement, '');
});

test('error envelope is explicit simulation content and never a fake saved document', () => {
  const request = { id: 2 };
  const result = simulationError(request, Error('NativeRefusal'));
  assert.equal(result.result.isError, true);
  assert.equal(result.result.content[0].text, 'NativeRefusal');
  assert.equal(result.result.content[0].text.includes('published: true'), false);
});

test('missing or wrong engine model SHA cannot become a success snapshot', async () => {
  const bad = createSimulation({
    read: async () => ({ format: 'hwp5', model: { sourceSha256: '0'.repeat(64) } }),
  });
  await assert.rejects(bad.read(setup().input), /InvalidSimulationReadResult/);
});

test('paragraph dropdown never substitutes display position for source identity', async () => {
  const broken = createSimulation({
    read: async ({ bytes }) => {
      const model = makeModel(bytes);
      model.sections[0].body[0].cells[0].blocks[0].id = 's0:p999';
      return { format: 'hwp5', model };
    },
  });
  await assert.rejects(broken.read(setup().input), /TargetIdentity/);
});

test('read-only paragraphs cannot be submitted, and unknown display does not become raw text', async () => {
  const api = createSimulation({
    read: async ({ bytes }) => {
      const model = makeModel(bytes),
        p = model.sections[0].body[0].cells[0].blocks[0];
      p.editability = 'read-only';
      p.displayText = null;
      p.text = 'RAW-NATIVE-PAYLOAD';
      return { format: 'hwp5', model };
    },
  });
  const snapshot = await api.read(setup().input);
  assert.equal(snapshot.body.includes('RAW-NATIVE-PAYLOAD'), false);
  assert.equal(snapshot.paragraphs[0].displayText, null);
  await assert.rejects(api.edit(snapshot, draft(snapshot)), /InvalidSimulationTarget/);
});

test('empty output and wrong actual format cannot become downloads', async () => {
  for (const saved of [
    { format: 'hwp5', bytes: new Uint8Array(), changed: true, layoutRequiresReflow: false },
    { format: 'hwpx', bytes: Uint8Array.of(1), changed: true, layoutRequiresReflow: false },
  ]) {
    const api = createSimulation({
      read: async ({ bytes }) => ({ format: 'hwp5', model: makeModel(bytes) }),
      edit: async () => saved,
    });
    const snapshot = await api.read(setup().input);
    await assert.rejects(api.edit(snapshot, draft(snapshot)));
  }
});

test('unknown editability is never promoted by the browser bridge', async () => {
  let edits = 0;
  const api = createSimulation({
    read: async ({ bytes }) => {
      const model = makeModel(bytes);
      model.sections[0].body[0].cells[0].blocks[0].editability = 'unknown';
      return { format: 'hwp5', model };
    },
    edit: async () => {
      edits++;
      throw Error('MustNotEdit');
    },
  });
  const snapshot = await api.read(setup().input);
  await assert.rejects(api.edit(snapshot, draft(snapshot)), /InvalidSimulationTarget/);
  assert.equal(edits, 0);
});

test('edit captures the exact user draft before awaiting the SHA fence', async () => {
  const { simulation, input, calls } = setup();
  const snapshot = await simulation.read(input);
  const value = draft(snapshot),
    pending = simulation.edit(snapshot, value);
  value.targetId = 's0:p999';
  value.findText = 'changed';
  value.replacement = 'changed';
  value.outputName = 'changed.hwp';
  value.allowStaleLayout = true;
  const saved = await pending;
  assert.deepEqual(calls[1].target, { section: 0, paragraph: 2 });
  assert.equal(calls[1].replace, '보도일시');
  assert.equal(calls[1].with, '수정');
  assert.equal(calls[1].allowStaleLayout, false);
  assert.equal(saved.filename, 'new.hwp');
});
