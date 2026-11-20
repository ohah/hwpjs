// MCP schema/host delegation with controlled invoke; no transport or Native SDK.
import test from 'node:test';
import assert from 'node:assert/strict';
import { extendedDocumentTools } from '../src/mcp/extended-tools.ts';
const args = () => ({
  inputPath: '/synthetic/input.hwpx',
  outputPath: '/synthetic/output.hwpx',
  expectedSha256: 'a'.repeat(64),
  operations: [
    {
      kind: 'chart-create',
      coordinates: 'current-transaction',
      selector: { section: 1, paragraph: 4 },
      unit: 0,
      expectedText: '',
      payload: {
        size: { width: 6000, height: 2000 },
        data: { categories: ['A'], series: [{ name: 'S', values: ['1.50'] }] },
      },
    },
  ],
});
function fixture() {
  const calls = [];
  const tool = extendedDocumentTools({
    wasm: ['--wasm=/synthetic/pinned.wasm'],
    invoke: async (argv) => {
      calls.push(argv);
      return { content: [{ type: 'text', text: 'controlled CLI response' }] };
    },
  }).find((x) => x.name === 'apply_document_changes');
  return { tool, calls };
}
test('MCP generated operation schema accepts HWPX creation and delegates unchanged lexical payload to existing apply host', async () => {
  const { tool, calls } = fixture();
  const input = args();
  const parsed = tool.config.inputSchema.parse(input);
  await tool.invoke(parsed, {});
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'apply');
  const passed = JSON.parse(
    calls[0].find((x) => x.startsWith('--operations=')).slice('--operations='.length),
  );
  assert.deepEqual(passed, input.operations);
  assert.equal(passed[0].payload.data.series[0].values[0], '1.50');
  assert(tool.config.description.includes('HWP5'));
});
test('MCP schema uses same owner/ref validation and refuses caller binding or future table reference', () => {
  const { tool } = fixture();
  for (const selector of [
    { section: 1, paragraph: 4, owner: { kind: 'body' } },
    { section: 1, created_cell: { operation: 0, row: 0, column: 0 } },
  ]) {
    const input = args();
    input.operations[0].selector = selector;
    assert.equal(tool.config.inputSchema.safeParse(input).success, false);
  }
});
test('MCP creation payload keeps strict lexical negative-underflow rejection', () => {
  const { tool } = fixture();
  const input = args();
  input.operations[0].payload.chart = { kind: 'pieChart' };
  input.operations[0].payload.data.series[0].values[0] = '-1e-5000';
  assert.equal(tool.config.inputSchema.safeParse(input).success, false);
});
