import { detectDocumentFormat } from '../../../js/document-format.mjs';
import { copyPictureInput } from '../../../js/picture-replacement-input.mjs';
import { MAX_DOCUMENT_BYTES } from './files.ts';
import { parseObjectReference } from './object-reference.ts';
import { line, warningLines } from './host-output.ts';
import type { ExtendedCommandOptions } from './types/commands.ts';
import type { ExtendedHostContext } from './types/host.ts';

type Options = Extract<ExtendedCommandOptions, { command: 'edit-table-grid' }>;
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** CLI and MCP share snapshot guards and new-file publication at this boundary. */
export async function runGridFileCommand(
  options: Options,
  { files, io, loadWasm, dependencies = {}, onPublished }: ExtendedHostContext,
): Promise<number> {
  if (!options.allowStaleLayout) throw new Error('LayoutRequiresReflow: pass --allow-stale-layout');
  const source = await files.readInputSnapshot(options.input, { maxBytes: MAX_DOCUMENT_BYTES });
  const format = detectDocumentFormat(source.bytes);
  const reference = parseObjectReference(options.reference, {
    sourceSha256: source.sha256,
    format,
  });
  if (reference.kind !== 'table') throw new Error('ExpectedTableReference');
  if (format === 'hwpx' && options.layout === 'observed8')
    throw new Error('InvalidTableGridLayout');
  const target = await files.assertNewOutput({
    input: source,
    outputPath: options.output,
    kind: 'document',
  });
  files.assertOutputFormat(target, format);
  const wasm = await loadWasm();
  const edit =
    dependencies.editDocumentTableGrid ??
    (await import('./edit-table-grid.ts')).editDocumentTableGrid;
  const value: unknown = await edit({
    bytes: source.bytes,
    wasm,
    reference: options.reference,
    action: options.action,
    index: options.index,
    expectedRows: options.expectedRows,
    expectedColumns: options.expectedColumns,
    ...(options.layout === undefined ? {} : { layout: options.layout }),
  });
  if (!record(value)) throw new Error('InvalidFileTransformResult');
  const { format: returnedFormat, bytes, sourceSha256, layoutRequiresReflow, previewStale } = value;
  if (
    returnedFormat !== format ||
    sourceSha256 !== source.sha256 ||
    layoutRequiresReflow !== true ||
    previewStale !== true ||
    !(bytes instanceof Uint8Array) ||
    bytes.byteLength === 0 ||
    bytes.byteLength > MAX_DOCUMENT_BYTES ||
    (typeof SharedArrayBuffer !== 'undefined' && bytes.buffer instanceof SharedArrayBuffer)
  )
    throw new Error('InvalidFileTransformResult');
  const output = copyPictureInput(bytes, MAX_DOCUMENT_BYTES, 'Output');
  if (detectDocumentFormat(output) !== format) throw new Error('FileTransformFormatMismatch');
  const receipt = await files.publishNewOutput({ target, bytes: output });
  onPublished(receipt);
  await io.stdout.write(
    line('output', receipt.path) +
      line('format', format) +
      line('sha256', receipt.sha256) +
      line('sourceSHA256', sourceSha256) +
      line('layoutRequiresReflow', true) +
      line('previewStale', true) +
      warningLines(receipt.warnings),
  );
  return 0;
}
