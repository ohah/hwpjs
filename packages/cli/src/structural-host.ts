import { detectDocumentFormat } from '../../../js/document-format.mjs';
import { copyPictureInput } from '../../../js/picture-replacement-input.mjs';
import { MAX_DOCUMENT_BYTES } from './files.ts';
import { parseObjectReference } from './object-reference.ts';
import { line, warningLines } from './host-output.ts';
import type { ExtendedCommandOptions } from './types/commands.ts';
import type { ExtendedHostContext } from './types/host.ts';

type Options = Extract<
  ExtendedCommandOptions,
  { command: 'delete-table' | 'insert-image' | 'export-html' }
>;
const encoder = new TextEncoder();
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** 파일 호스트만 경로를 읽고 게시합니다. 공통 서비스에는 소유 바이트만 전달합니다. */
export async function runStructuralCommand(
  options: Options,
  { files, io, loadWasm, dependencies = {}, onPublished }: ExtendedHostContext,
): Promise<number> {
  if (options.command !== 'export-html' && !options.allowStaleLayout)
    throw new Error('LayoutRequiresReflow: pass --allow-stale-layout');
  const source = await files.readInputSnapshot(options.input, { maxBytes: MAX_DOCUMENT_BYTES });
  const format = detectDocumentFormat(source.bytes);
  if (options.command === 'insert-image' && options.expectSha256 !== source.sha256)
    throw new Error('SourceSHA256Mismatch');
  if (options.command === 'delete-table') {
    const reference = parseObjectReference(options.reference, {
      sourceSha256: source.sha256,
      format,
    });
    if (reference.kind !== 'table') throw new Error('ExpectedTableReference');
  }
  const image =
    options.command === 'insert-image'
      ? await files.readInputSnapshot(options.imagePath, { maxBytes: 8 * 1024 * 1024 })
      : undefined;
  const target = await files.assertNewOutput({
    input: source,
    outputPath: options.output,
    kind: options.command === 'export-html' ? 'html' : 'document',
  });
  if (options.command === 'export-html') files.assertHTMLFormat(target);
  else files.assertOutputFormat(target, format);
  const wasm = await loadWasm();
  if (options.command === 'export-html') {
    const convert =
      dependencies.exportDocumentHTML ?? (await import('./export-html.ts')).exportDocumentHTML;
    const result: unknown = await convert({
      bytes: source.bytes,
      wasm,
      embedImages: options.embedImages,
    });
    if (!record(result)) throw new Error('InvalidHTMLConversionResult');
    const { html, sourceSha256, semanticOnly, warnings } = result;
    const warningCount: unknown = Array.isArray(warnings) ? warnings.length : undefined;
    if (
      result.format !== format ||
      sourceSha256 !== source.sha256 ||
      semanticOnly !== true ||
      typeof html !== 'string' ||
      !html.isWellFormed() ||
      html.length === 0 ||
      html.length > 32 * 1024 * 1024 ||
      !Array.isArray(warnings) ||
      typeof warningCount !== 'number' ||
      !Number.isInteger(warningCount) ||
      warningCount < 0 ||
      warningCount > 4096
    )
      throw new Error('InvalidHTMLConversionResult');
    const bytes = encoder.encode(html);
    if (bytes.byteLength > MAX_DOCUMENT_BYTES) throw new Error('HTMLOutputLimitExceeded');
    // Construct bounded diagnostics before the irreversible publication point.
    const capturedWarnings: string[] = [];
    for (let index = 0; index < warningCount; index++) {
      const warning: unknown = warnings[index];
      if (typeof warning !== 'string' || warning.length > 4096 || !warning.isWellFormed())
        throw new Error('InvalidHTMLConversionResult');
      capturedWarnings.push(warning);
    }
    const diagnostics = warningLines(capturedWarnings);
    if (diagnostics.length > 4 * 1024 * 1024) throw new Error('HTMLWarningLimitExceeded');
    const receipt = await files.publishNewOutput({ target, bytes });
    onPublished(receipt);
    await io.stdout.write(
      line('output', receipt.path) +
        line('sha256', receipt.sha256) +
        line('format', 'html') +
        line('sourceFormat', format) +
        line('sourceSHA256', sourceSha256) +
        line('semanticOnly', true) +
        diagnostics +
        warningLines(receipt.warnings),
    );
    return 0;
  }
  let value: unknown;
  if (options.command === 'delete-table') {
    const remove =
      dependencies.deleteDocumentTable ?? (await import('./delete-table.ts')).deleteDocumentTable;
    value = await remove({ bytes: source.bytes, wasm, reference: options.reference });
  } else {
    if (!image) throw new Error('MissingInsertionImage');
    const insert =
      dependencies.insertDocumentImage ?? (await import('./insert-image.ts')).insertDocumentImage;
    value = await insert({
      bytes: source.bytes,
      wasm,
      expectedSha256: source.sha256,
      target: options.target,
      unit: options.unit,
      expectedText: options.expectedText,
      imageBytes: image.bytes,
      width: options.width,
      height: options.height,
    });
  }
  if (!record(value)) throw new Error('InvalidFileTransformResult');
  const { bytes, sourceSha256, layoutRequiresReflow, previewStale } = value;
  if (
    value.format !== format ||
    sourceSha256 !== source.sha256 ||
    layoutRequiresReflow !== true ||
    previewStale !== true ||
    !(bytes instanceof Uint8Array) ||
    bytes.byteLength === 0 ||
    bytes.byteLength > MAX_DOCUMENT_BYTES ||
    (typeof SharedArrayBuffer !== 'undefined' && bytes.buffer instanceof SharedArrayBuffer) ||
    (image !== undefined && value.imageSha256 !== image.sha256)
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
      (image ? line('imageSHA256', image.sha256) : '') +
      line('layoutRequiresReflow', true) +
      line('previewStale', true) +
      warningLines(receipt.warnings),
  );
  return 0;
}
