import { MAX_DOCUMENT_BYTES } from './files.ts';
import type { InputSnapshot, OutputTarget } from './files.ts';
import type { DocumentFormat, ExtendedCommandOptions } from './types/commands.ts';
import type { ExtendedHostContext } from './types/host.ts';
import type * as OperationService from './document-operations.ts';
import { parseObjectReference } from './object-reference.ts';
import { line, observationLines, warningLines } from './host-output.ts';

const MAX_PATCH_BYTES = 1024 * 1024;
const MAX_TEXT_BYTES = 4 * 1024 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const encoder = new TextEncoder();
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const documentFormat = (value: unknown): value is DocumentFormat =>
  value === 'hwp5' || value === 'hwpx';

function jsonInput(text: unknown): unknown {
  if (
    typeof text !== 'string' ||
    !text.isWellFormed() ||
    text.length > MAX_PATCH_BYTES ||
    encoder.encode(text).length > MAX_PATCH_BYTES
  )
    throw new RangeError('OperationInputLimitExceeded');
  try {
    return JSON.parse(text) as unknown;
  } catch (cause) {
    throw new Error('InvalidOperationJSON', { cause });
  }
}

function savedResult(
  value: unknown,
  expectedFormat?: DocumentFormat,
): { format: DocumentFormat; bytes: Uint8Array; layoutRequiresReflow: boolean } {
  if (!record(value)) throw new Error('InvalidDocumentOperationResult');
  const { format, bytes, layoutRequiresReflow } = value;
  if (
    !documentFormat(format) ||
    (expectedFormat !== undefined && format !== expectedFormat) ||
    !(bytes instanceof Uint8Array) ||
    bytes.byteLength === 0 ||
    bytes.byteLength > MAX_DOCUMENT_BYTES ||
    typeof layoutRequiresReflow !== 'boolean'
  )
    throw new Error('InvalidDocumentOperationResult');
  return { format, bytes: Uint8Array.from(bytes), layoutRequiresReflow };
}

function textResult(
  value: unknown,
  input: InputSnapshot,
): { format: DocumentFormat; sourceSha256: string; text: string } {
  if (!record(value)) throw new Error('InvalidDocumentQueryResult');
  const { schemaVersion, format, sourceSha256, text } = value;
  if (
    schemaVersion !== 1 ||
    !documentFormat(format) ||
    sourceSha256 !== input.sha256 ||
    typeof text !== 'string' ||
    !text.isWellFormed() ||
    text.length > MAX_TEXT_BYTES ||
    encoder.encode(text).length > MAX_TEXT_BYTES
  )
    throw new Error('InvalidDocumentQueryResult');
  return { format, sourceSha256, text };
}

// Only the host reads patch/text files and publishes the final new file.
// Services own Native/provider work and never receive filesystem authority.
export async function runExtendedCommand(
  options: ExtendedCommandOptions,
  { files, io, loadWasm, dependencies = {}, onPublished }: ExtendedHostContext,
): Promise<number> {
  if (
    options.command === 'delete-table' ||
    options.command === 'insert-image' ||
    options.command === 'export-html'
  ) {
    const { runStructuralCommand } = await import('./structural-host.ts');
    return runStructuralCommand(options, { files, io, loadWasm, dependencies, onPublished });
  }
  const input =
    options.command === 'create'
      ? undefined
      : await files.readInputSnapshot(options.input, { maxBytes: MAX_DOCUMENT_BYTES });
  if (
    options.command !== 'create' &&
    'expectSha256' in options &&
    options.expectSha256 !== undefined &&
    input?.sha256 !== options.expectSha256
  )
    throw new Error('SourceSHA256Mismatch');
  const requireInput = (): InputSnapshot => {
    if (!input) throw new Error('MissingDocumentInput');
    return input;
  };
  let replacementImage: InputSnapshot | undefined;
  let replacementFormat: DocumentFormat | undefined;
  if (options.command === 'replace-image') {
    const reference = parseObjectReference(options.reference, {
      sourceSha256: requireInput().sha256,
    });
    if (reference.kind !== 'image') throw new Error('InvalidImageReference');
    replacementFormat = reference.format;
    replacementImage = await files.readInputSnapshot(options.imagePath, {
      maxBytes: MAX_IMAGE_BYTES,
    });
  }
  let text = '';
  if (options.command === 'create' && options.textFile !== undefined) {
    const snapshot = await files.readInputSnapshot(options.textFile, { maxBytes: MAX_TEXT_BYTES });
    text = new TextDecoder('utf-8', { fatal: true }).decode(snapshot.bytes);
  }
  if (options.command === 'create' && dependencies.creationText !== undefined) {
    if (options.textFile !== undefined) throw new Error('ConflictingCreationText');
    text = dependencies.creationText;
    if (
      typeof text !== 'string' ||
      !text.isWellFormed() ||
      encoder.encode(text).length > MAX_TEXT_BYTES
    )
      throw new Error('InvalidCreationText');
  }
  let operationService:
    | Pick<typeof OperationService, 'validateDocumentOperations' | 'applyDocumentOperations'>
    | undefined;
  let operations: ReturnType<typeof OperationService.validateDocumentOperations> | undefined;
  if (options.command === 'apply') {
    operationService = dependencies.operationService ?? (await import('./document-operations.ts'));
    let raw: unknown;
    if (options.inlineOperations !== undefined) raw = jsonInput(options.inlineOperations);
    else {
      if (options.patch === undefined) throw new Error('MissingOperationPatch');
      const patch = await files.readInputSnapshot(options.patch, { maxBytes: MAX_PATCH_BYTES });
      const document = jsonInput(new TextDecoder('utf-8', { fatal: true }).decode(patch.bytes));
      if (
        !record(document) ||
        document.version !== 1 ||
        Object.keys(document).length !== 2 ||
        !Object.hasOwn(document, 'operations')
      )
        throw new Error('InvalidOperationPatch');
      raw = document.operations;
    }
    operations = operationService.validateDocumentOperations(raw);
  }
  let target: OutputTarget | undefined;
  if (
    options.command === 'create' ||
    options.command === 'apply' ||
    options.command === 'convert' ||
    options.command === 'replace-image'
  ) {
    target =
      options.command === 'create'
        ? await files.assertNewDocumentOutput({ outputPath: options.output })
        : await files.assertNewOutput({ input: requireInput(), outputPath: options.output });
    const expectedFormat =
      options.command === 'create'
        ? options.format
        : options.command === 'convert'
          ? options.to
          : replacementFormat;
    if (expectedFormat !== undefined) files.assertOutputFormat(target, expectedFormat);
  }
  const wasm = await loadWasm();
  if (options.command === 'replace-image') {
    const source = requireInput();
    if (!replacementImage || !replacementFormat || !target)
      throw new Error('MissingImageReplacementInput');
    const replace =
      dependencies.replaceDocumentImage ??
      (await import('./replace-image.ts')).replaceDocumentImage;
    const value: unknown = await replace({
      bytes: source.bytes,
      wasm,
      reference: options.reference,
      imageBytes: replacementImage.bytes,
    });
    if (!record(value)) throw new Error('InvalidImageReplacementResult');
    const { format, sourceSha256, imageSha256, bytes, previewStale } = value;
    if (
      !documentFormat(format) ||
      format !== replacementFormat ||
      sourceSha256 !== source.sha256 ||
      imageSha256 !== replacementImage.sha256 ||
      previewStale !== true ||
      !(bytes instanceof Uint8Array) ||
      bytes.byteLength === 0 ||
      bytes.byteLength > MAX_DOCUMENT_BYTES
    )
      throw new Error('InvalidImageReplacementResult');
    files.assertOutputFormat(target, format);
    const receipt = await files.publishNewOutput({ target, bytes: Uint8Array.from(bytes) });
    onPublished(receipt);
    await io.stdout.write(
      line('output', receipt.path) +
        line('format', format) +
        line('sha256', receipt.sha256) +
        line('sourceSHA256', sourceSha256) +
        line('imageSHA256', imageSha256) +
        line('previewStale', previewStale) +
        warningLines(receipt.warnings),
    );
    return 0;
  }
  if (options.command === 'paragraph') {
    const source = requireInput();
    const inspect =
      dependencies.inspectDocumentParagraph ??
      (await import('./document-paragraph.ts')).inspectDocumentParagraph;
    const result = await inspect({
      bytes: source.bytes,
      wasm,
      target: options.target,
      expectedSha256: source.sha256,
      format: options.format,
    });
    const output = textResult(result, source);
    const observedTarget = result.target;
    if (
      !record(observedTarget) ||
      observedTarget.section !== options.target.section ||
      observedTarget.paragraph !== options.target.paragraph
    )
      throw new Error('InvalidDocumentQueryTarget');
    await io.stdout.write(output.text);
    return 0;
  }
  if (options.command === 'ocr') {
    const source = requireInput();
    const ocr = dependencies.ocrDocument ?? (await import('./document-ocr.ts')).ocrDocument;
    const result = await ocr({
      bytes: source.bytes,
      wasm,
      reference: options.reference,
      provider: options.provider,
      languages: options.languages,
      executable: options.executable,
      format: options.format,
    });
    const output = textResult(result, source);
    const status = result.status;
    if (status !== 'complete' && status !== 'partial' && status !== 'failed')
      throw new Error('InvalidOcrResult');
    if (options.reference !== undefined)
      parseObjectReference(options.reference, {
        sourceSha256: source.sha256,
        format: output.format,
      });
    await io.stdout.write(output.text);
    if (status !== 'complete') {
      await io.stderr.write(line('error', 'IncompleteDocumentOCR') + line('published', false));
      return 1;
    }
    return 0;
  }
  let result: unknown;
  let extra: string;
  if (options.command === 'apply') {
    const source = requireInput();
    if (!operationService || !operations) throw new Error('MissingOperationService');
    result = await operationService.applyDocumentOperations({
      bytes: source.bytes,
      wasm,
      expectedSha256: source.sha256,
      operations,
      allowStaleLayout: options.allowStaleLayout,
    });
    if (!record(result)) throw new Error('InvalidDocumentOperationResult');
    const { sourceSha256, appliedOperations, changed, operationResults } = result;
    if (
      sourceSha256 !== source.sha256 ||
      appliedOperations !== operations.length ||
      typeof changed !== 'boolean' ||
      !Array.isArray(operationResults)
    )
      throw new Error('InvalidDocumentOperationResult');
    extra =
      line('appliedOperations', appliedOperations) +
      line('changed', changed) +
      observationLines(operationResults, 'operationResults');
  } else if (options.command === 'create') {
    const create =
      dependencies.createDocument ?? (await import('./document-create.ts')).createDocument;
    result = await create({
      format: options.format,
      text,
      wasm,
      allowStaleLayout: options.allowStaleLayout,
    });
    if (!record(result)) throw new Error('InvalidDocumentCreationResult');
    const { schemaVersion, paragraphCount } = result;
    if (
      schemaVersion !== 1 ||
      typeof paragraphCount !== 'number' ||
      !Number.isSafeInteger(paragraphCount) ||
      paragraphCount < 1
    )
      throw new Error('InvalidDocumentCreationResult');
    extra = line('paragraphCount', paragraphCount);
  } else if (options.command === 'convert') {
    const source = requireInput();
    const convert =
      dependencies.convertDocument ?? (await import('./document-convert.ts')).convertDocument;
    try {
      result = await convert({
        bytes: source.bytes,
        wasm,
        expectedSha256: source.sha256,
        to: options.to,
        lossPolicy: options.lossPolicy,
        allowStaleLayout: options.allowStaleLayout,
      });
    } catch (cause) {
      if (record(cause) && record(cause.report)) {
        const { report, message, code } = cause;
        throw Object.assign(new Error(String(message), { cause }), {
          code,
          operationReport: observationLines(report, 'conversion'),
        });
      }
      throw cause;
    }
    if (!record(result)) throw new Error('InvalidDocumentConversionResult');
    const { sourceSha256, lossPolicy, lossless, report } = result;
    if (
      sourceSha256 !== source.sha256 ||
      lossPolicy !== options.lossPolicy ||
      lossless !== false ||
      !record(report)
    )
      throw new Error('InvalidDocumentConversionResult');
    extra =
      line('lossPolicy', lossPolicy) +
      line('lossless', lossless) +
      observationLines(report, 'conversion');
  } else throw new Error('UnknownExtendedCommand');
  const saved = savedResult(
    result,
    options.command === 'apply'
      ? undefined
      : options.command === 'create'
        ? options.format
        : options.to,
  );
  if (!target) throw new Error('MissingDocumentOutputTarget');
  files.assertOutputFormat(target, saved.format);
  if (extra.length > MAX_TEXT_BYTES) throw new Error('OperationReportLimitExceeded');
  const receipt = await files.publishNewOutput({ target, bytes: saved.bytes });
  onPublished(receipt);
  await io.stdout.write(
    line('output', receipt.path) +
      line('format', saved.format) +
      line('sha256', receipt.sha256) +
      line('layoutRequiresReflow', saved.layoutRequiresReflow) +
      extra +
      warningLines(receipt.warnings),
  );
  return 0;
}
