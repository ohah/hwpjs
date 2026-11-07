import { read, edit } from '../../../packages/cli/src/engine.mjs';
import { renderDocument } from '../../../packages/cli/src/render.mjs';

const MAX_BYTES = 64 * 1024 * 1024;
const snapshots = new WeakMap();
const sha256 = async (bytes) => {
  if (!globalThis.crypto?.subtle) throw Error('WebCryptoUnavailable');
  const hash = await globalThis.crypto.subtle.digest('SHA-256', Uint8Array.from(bytes));
  return Array.from(new Uint8Array(hash), (n) => n.toString(16).padStart(2, '0')).join('');
};
function copy(bytes, limit = MAX_BYTES) {
  if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length > limit)
    throw Error('InvalidSimulationBytes');
  return Uint8Array.from(bytes);
}
function inputPath(value) {
  if (
    typeof value !== 'string' ||
    !value ||
    value.length > 255 ||
    !value.isWellFormed() ||
    [...value].some((c) => c.codePointAt(0) < 32 || c.codePointAt(0) === 127)
  )
    throw Error('InvalidSimulationFilename');
  return value;
}
function quote(value) {
  return "'" + value.replaceAll("'", "'\\''") + "'";
}
export function simulationCommand(request) {
  const a = request.params.arguments;
  if (request.params.name === 'read_document')
    return `npx --no-install hwpjs read ${quote(a.inputPath)} --format ${a.format}`;
  return [
    'npx --no-install hwpjs edit',
    quote(a.inputPath),
    quote('--target=' + a.target),
    quote('--replace=' + a.findText),
    quote('--with=' + a.replacement),
    quote('--expect-sha256=' + a.expectedSha256),
    quote('--output=' + a.outputPath),
    ...(a.allowStaleLayout ? ['--allow-stale-layout'] : []),
  ].join(' ');
}
export function simulationRequest(name, args) {
  return {
    jsonrpc: '2.0',
    id: name === 'read_document' ? 1 : 2,
    method: 'tools/call',
    params: { name, arguments: args },
  };
}
export function simulationError(request, error) {
  return {
    jsonrpc: '2.0',
    id: request.id,
    result: { content: [{ type: 'text', text: String(error?.message ?? error) }], isError: true },
  };
}
function response(request, text) {
  return { jsonrpc: '2.0', id: request.id, result: { content: [{ type: 'text', text }] } };
}
function paragraphs(model) {
  const result = [],
    stack = [];
  const push = (blocks) => {
    for (let i = blocks.length - 1; i >= 0; i--) stack.push(blocks[i]);
  };
  for (let i = model.unplaced.length - 1; i >= 0; i--) stack.push(model.unplaced[i].block);
  for (let i = model.sections.length - 1; i >= 0; i--) {
    const section = model.sections[i];
    for (let j = section.footer.definitions.length - 1; j >= 0; j--)
      push(section.footer.definitions[j].blocks);
    push(section.body);
    for (let j = section.header.definitions.length - 1; j >= 0; j--)
      push(section.header.definitions[j].blocks);
  }
  let count = 0;
  while (stack.length) {
    if (++count > 200_000) throw Error('SimulationModelLimitExceeded');
    const block = stack.pop();
    if (block.type === 'paragraph') {
      if (block.id !== `s${block.source.section}:p${block.source.paragraph}`)
        throw Error('InvalidSimulationTargetIdentity');
      result.push(
        Object.freeze({
          id: block.id,
          section: block.source.section,
          paragraph: block.source.paragraph,
          displayText: block.displayText,
          editability: block.editability,
        }),
      );
    } else if (block.type === 'table')
      for (let i = block.cells.length - 1; i >= 0; i--) push(block.cells[i].blocks);
  }
  return Object.freeze(result);
}
function draftArguments(snapshot, draft) {
  const state = snapshots.get(snapshot);
  if (!state) throw Error('UnknownSimulationSnapshot');
  const target = snapshot.paragraphs.find((p) => p.id === draft.targetId);
  if (!target || target.editability !== 'range-check-required')
    throw Error('InvalidSimulationTarget');
  if (draft.expectedSha256 !== snapshot.sourceSha256) throw Error('SourceSHA256Mismatch');
  if (
    typeof draft.findText !== 'string' ||
    typeof draft.replacement !== 'string' ||
    typeof draft.allowStaleLayout !== 'boolean'
  )
    throw Error('InvalidSimulationDraft');
  const output = inputPath(draft.outputName);
  const extension = snapshot.format === 'hwp5' ? '.hwp' : '.hwpx';
  if (
    output.includes('/') ||
    output.includes('\\') ||
    !output.endsWith(extension) ||
    './' + output === snapshot.inputPath
  )
    throw Error('NewOutputFilenameRequired');
  return {
    inputPath: snapshot.inputPath,
    outputPath: './' + output,
    target: target.id,
    expectedSha256: draft.expectedSha256,
    findText: draft.findText,
    replacement: draft.replacement,
    allowStaleLayout: draft.allowStaleLayout,
  };
}
export function simulationEditRequest(snapshot, draft) {
  return simulationRequest('edit_document', draftArguments(snapshot, draft));
}
/** Browser transport only. Native parsing, target validation, editing and lifetime
 * stay in the same portable CLI engine. This never invokes Node or MCP stdio.
 * Injection is for pure tests; the exported default uses the real shared engine.
 */
export function createSimulation(engine = { read, edit }) {
  return {
    async read({ bytes, wasm, filename, format = 'text' }) {
      if (!['text', 'markdown'].includes(format)) throw Error('InvalidSimulationFormat');
      const input = copy(bytes),
        runtime = copy(wasm, 32 * 1024 * 1024),
        path = './' + inputPath(filename);
      const sourceSha256 = await sha256(input);
      const result = await engine.read({
        bytes: copy(input),
        wasm: copy(runtime, 32 * 1024 * 1024),
      });
      if (
        !['hwp5', 'hwpx'].includes(result.format) ||
        result.model?.format !== result.format ||
        result.model?.sourceSha256 !== sourceSha256
      )
        throw Error('InvalidSimulationReadResult');
      const body = renderDocument(result.model, { format });
      const request = simulationRequest('read_document', { inputPath: path, format });
      const snapshot = Object.freeze({
        format: result.format,
        sourceSha256,
        inputPath: path,
        body,
        paragraphs: paragraphs(result.model),
        request,
        response: response(
          request,
          `format: ${result.format}\ndocumentSHA256: ${sourceSha256}\n${body}`,
        ),
        command: simulationCommand(request),
      });
      snapshots.set(snapshot, { input, runtime });
      return snapshot;
    },
    async edit(snapshot, draft) {
      const args = draftArguments(snapshot, draft),
        state = snapshots.get(snapshot);
      if ((await sha256(state.input)) !== args.expectedSha256) throw Error('SourceSHA256Mismatch');
      const row = snapshot.paragraphs.find((p) => p.id === args.target);
      const saved = await engine.edit({
        bytes: copy(state.input),
        wasm: copy(state.runtime, 32 * 1024 * 1024),
        target: { section: row.section, paragraph: row.paragraph },
        replace: args.findText,
        with: args.replacement,
        allowStaleLayout: args.allowStaleLayout,
      });
      if (
        saved.format !== snapshot.format ||
        typeof saved.changed !== 'boolean' ||
        typeof saved.layoutRequiresReflow !== 'boolean'
      )
        throw Error('InvalidSimulationSaveResult');
      const bytes = copy(saved.bytes),
        outputSha256 = await sha256(bytes);
      const request = simulationRequest('edit_document', args);
      const receipt = `output: ${args.outputPath}\nformat: ${saved.format}\nsha256: ${outputSha256}\nchanged: ${saved.changed}\nlayoutRequiresReflow: ${saved.layoutRequiresReflow}\n`;
      return {
        bytes,
        filename: args.outputPath.slice(2),
        sha256: outputSha256,
        changed: saved.changed,
        layoutRequiresReflow: saved.layoutRequiresReflow,
        request,
        response: response(request, receipt),
        command: simulationCommand(request),
      };
    },
  };
}
export const browserSimulation = createSimulation();
