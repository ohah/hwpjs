import type { CLIHostDependencies } from './types/host.ts';
import type { ExtendedCommandOptions } from './types/commands.ts';
import type { ImageDirectory, OutputTarget, OutputReceipt } from './files.ts';
import type { OpenedDocument } from './types/native-document.ts';
import type { Writable } from 'node:stream';
import type { createDocumentImages } from './document-images.ts';
import { parseArguments, ArgumentsError, USAGE } from './arguments.ts';
import * as defaultFiles from './files.ts';
import { join } from 'node:path';
import { readDocuments } from './batch-read.ts';
import { parseObjectReference } from './object-reference.ts';
import { EXTENDED_OPTIONS } from './extended-arguments.ts';
import { line, warningLines, observationLines, OBSERVATION_CHAR_LIMIT } from './host-output.ts';
import {
  readDocumentOperation,
  renderBatchReadReport,
  renderReadResponse,
} from './read-operation.ts';

const errorFields = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
const errorCode = (value: unknown): string =>
  String(errorFields(value).code ?? errorFields(value).message ?? value);
const engineFormat = (value: unknown): void => {
  if (value !== 'hwp5' && value !== 'hwpx') throw Error('InvalidEngineFormat');
};
const imageScopeDiagnostic = line(
  'scopeDiagnostic',
  'Section picture sites only; excludes master-page images, image brushes and unreferenced resources. Not a legacy Rust full-image extraction compatibility claim.',
);
// Reserve the complete planned path/SHA/count ledger before any file commit.
// Payload extension is not known yet; .jpeg is the longest admitted suffix.
function preflightImageReceipts(
  selected: readonly { id: string }[],
  directory: ImageDirectory | undefined,
  singleTarget: OutputTarget | undefined,
) {
  if (!singleTarget && !directory) throw Error('MissingImageOutputDirectory');
  const planned = selected.map((image, index) => ({
    id: image.id,
    published: true,
    path:
      singleTarget?.path ??
      join(directory!.path, `image-${String(index + 1).padStart(4, '0')}.jpeg`),
    sha256: '0'.repeat(64),
    bytes: 32 * 1024 * 1024,
    warnings: [],
  }));
  try {
    // Leave space for coverage, errors and publication diagnostics. Unexpected
    // cleanup-warning growth is handled by the bounded postcommit fallback.
    if (observationLines(planned, 'publishedImages').length > OBSERVATION_CHAR_LIMIT - 256 * 1024)
      throw Error('ObservationOutputLimit');
  } catch (cause) {
    throw Error('ImageReceiptBudgetExceeded', { cause });
  }
}
// Used only if full diagnostics cannot be constructed or written. Omissions are
// explicit; directory + count remain truthful even after committed file writes.
function fallbackLine(key: string, value: unknown) {
  const text = String(value);
  const bounded =
    text.length > 4096 ? text.slice(0, 4096) + `[omitted ${text.length - 4096} UTF16 units]` : text;
  return line(key, bounded);
}
function imageSnapshot(
  list: Awaited<ReturnType<Awaited<ReturnType<typeof createDocumentImages>>['list']>>,
  document: OpenedDocument,
  sha: string,
) {
  if (
    list?.version !== 1 ||
    list.format !== document.format ||
    list.sourceSha256 !== sha ||
    !Array.isArray(list.images) ||
    list.images.length > 4096
  )
    throw Error('InvalidImageListing');
  const ids = new Set();
  for (const image of list.images) {
    if (typeof image.id !== 'string' || ids.has(image.id)) throw Error('InvalidImageListing');
    ids.add(image.id);
  }
  return list;
}
// Await the actual Node write callback, including pipe errors, rather than the
// boolean backpressure return value. Failed writes may emit error after callback.
const writeStream = (stream: Writable, text: string): Promise<void> =>
  new Promise<void>((accept, reject) => {
    const onError = (cause: Error) => reject(cause);
    stream.once('error', onError);
    try {
      stream.write(text, (cause) => {
        if (cause) reject(cause);
        else {
          stream.off('error', onError);
          accept();
        }
      });
    } catch (cause) {
      stream.off('error', onError);
      reject(cause);
    }
  });
/** Pure host module: importing it never reads argv, files or Native artifacts. */
export async function runCLI(
  argv: unknown,
  dependencies: CLIHostDependencies = {},
): Promise<number> {
  const io = dependencies.io ?? {
    stdout: { write: (text) => writeStream(process.stdout, text) },
    stderr: { write: (text) => writeStream(process.stderr, text) },
  };
  const files = dependencies.files ?? defaultFiles;
  let published: OutputReceipt | undefined;
  const imagePublished: (OutputReceipt & { id: string })[] = [];
  let outputDirectory: ImageDirectory | undefined;
  try {
    const options = parseArguments(argv);
    if (options.command === 'help') {
      await io.stdout.write(USAGE);
      return 0;
    }
    const loadWasm = async () => {
      const wasmPath = files.resolveWasmPath(options.wasm, dependencies.mainModuleURL);
      try {
        return (await files.readInputSnapshot(wasmPath, { maxBytes: defaultFiles.MAX_WASM_BYTES }))
          .bytes;
      } catch (cause) {
        if (options.wasm === undefined && errorFields(cause).code === 'ENOENT')
          throw Error('ExplicitWasmRequired: pass --wasm PATH', { cause });
        throw cause;
      }
    };
    if (options.command === 'read-many') {
      // Markdown 들여쓰기·파일별 제목 등 보고서 장식은 내부 JSON 예산과 별도로 예약합니다.
      const reportOverhead = 1024 + 512 * options.inputPaths.length;
      if (options.maxOutputBytes <= reportOverhead)
        throw Object.assign(new Error('파일별 결과를 보고하기에 출력 예산이 부족합니다.'), {
          code: 'OutputBudgetTooSmall',
        });
      const engine = dependencies.engine ?? (await import('./engine.ts'));
      const renderDocument =
        dependencies.renderDocument ?? (await import('./render.ts')).renderDocument;
      let wasmPromise: Promise<Uint8Array> | undefined;
      // Promise를 공유하므로 동시 작업도 WASM 파일은 최대 한 번만 읽습니다.
      const loadOnce = () => (wasmPromise ??= loadWasm());
      const batch = await readDocuments({
        inputPaths: options.inputPaths,
        concurrency: options.concurrency,
        maxOutputBytes: options.maxOutputBytes - reportOverhead,
        readOne: ({ inputPath }: { inputPath: string }) =>
          readDocumentOperation(
            { inputPath, format: options.format, view: options.view },
            { files, engine, renderDocument, loadWasm: loadOnce },
          ),
      });
      try {
        const text = renderBatchReadReport(batch, options);
        await io.stdout.write(text);
      } catch (cause) {
        // 출력 전달은 이미 일부 진행됐을 수 있습니다. 자동 재시도하거나 읽기를 취소했다고 하지 않습니다.
        throw Object.assign(
          new Error(String(errorFields(cause).message ?? 'ReadManyOutputFailed'), { cause }),
          {
            batchSummary: batch.summary,
          },
        );
      }
      return batch.summary.failed ? 1 : 0;
    }
    if (Object.hasOwn(EXTENDED_OPTIONS, options.command)) {
      const { runExtendedCommand } = await import('./extended-host.ts');
      return await runExtendedCommand(options as ExtendedCommandOptions, {
        files,
        io,
        loadWasm,
        dependencies,
        onPublished: (receipt) => {
          published = receipt;
        },
      });
    }
    if (
      options.command === 'create' ||
      options.command === 'apply' ||
      options.command === 'convert' ||
      options.command === 'ocr' ||
      options.command === 'paragraph' ||
      options.command === 'edit-table-grid' ||
      options.command === 'delete-table' ||
      options.command === 'insert-image' ||
      options.command === 'export-html' ||
      options.command === 'replace-image'
    )
      throw Error('UnknownExtendedCommand');
    const input = await files.readInputSnapshot(options.input, {
      maxBytes: defaultFiles.MAX_DOCUMENT_BYTES,
    });
    if (
      'expectSha256' in options &&
      options.expectSha256 !== undefined &&
      input.sha256 !== options.expectSha256
    )
      throw Error('SourceSHA256Mismatch');
    const target =
      options.command === 'edit'
        ? await files.assertNewOutput({ input, outputPath: options.output })
        : undefined;
    const wasm = { bytes: await loadWasm() };
    if (options.command === 'object') {
      const inspect =
        dependencies.inspectDocumentObject ??
        (await import('./document-objects.ts')).inspectDocumentObject;
      const result = await inspect({
        bytes: input.bytes,
        wasm: wasm.bytes,
        reference: options.reference,
        format: options.format,
      });
      const expected = parseObjectReference(options.reference);
      if (!result || typeof result !== 'object' || Array.isArray(result))
        throw Error('InvalidObjectInspection');
      const { schemaVersion, sourceSha256, format, reference, kind, status, text } = result;
      if (
        schemaVersion !== 1 ||
        sourceSha256 !== input.sha256 ||
        format !== expected.format ||
        reference !== options.reference ||
        kind !== expected.kind ||
        !['available', 'unavailable'].includes(status) ||
        typeof text !== 'string' ||
        !text.isWellFormed() ||
        text.length > OBSERVATION_CHAR_LIMIT
      )
        throw Error('InvalidObjectInspection');
      await io.stdout.write(text);
      return 0;
    }
    if (options.command === 'info') {
      const inspect =
        dependencies.inspectDocument ?? (await import('./inspect-document.ts')).inspectDocument;
      const result = await inspect({
        bytes: input.bytes,
        wasm: wasm.bytes,
        expectedSha256: options.expectSha256,
      });
      if (!result) throw Error('InvalidDocumentInspection');
      engineFormat(result.format);
      if (
        result.schemaVersion !== 1 ||
        result.sourceSha256 !== input.sha256 ||
        result.sourceByteLength !== input.bytes.length
      )
        throw Error('InvalidDocumentInspection');
      await io.stdout.write(line('documentSHA256', input.sha256) + observationLines(result));
      return 0;
    }
    const engine = dependencies.engine ?? (await import('./engine.ts'));
    if (options.command === 'images' || options.command === 'extract-images') {
      const document = await engine.openDocument({
        bytes: input.bytes,
        wasm: wasm.bytes,
        expectedSha256: input.sha256,
      });
      let images: Awaited<ReturnType<typeof createDocumentImages>> | undefined;
      try {
        engineFormat(document.format);
        if (document.sourceSha256 !== input.sha256) throw Error('SourceSHA256Mismatch');
        if ('reference' in options && options.reference !== undefined)
          parseObjectReference(options.reference, {
            sourceSha256: input.sha256,
            format: document.format,
          });
        const create =
          dependencies.createDocumentImages ??
          (await import('./document-images.ts')).createDocumentImages;
        images = await create({
          sdk: document.sdk,
          format: document.format,
          sourceSha256: input.sha256,
          sectionCount: document.sectionCount,
        });
        const snapshot = imageSnapshot(await images.list(), document, input.sha256);
        const selected =
          !('id' in options) || options.id === undefined
            ? snapshot.images
            : snapshot.images.filter((image) => image.id === options.id);
        if ('id' in options && options.id !== undefined && selected.length !== 1)
          throw Error('UnknownImageId');
        if (options.command === 'images') {
          // Read payload metadata under collector budgets; failures stay in list.
          for (const image of selected) {
            try {
              await images.read(image.id, { sourceSha256: input.sha256 });
            } catch {
              /* status/reason owned by collector */
            }
          }
          await io.stdout.write(
            line('documentSHA256', input.sha256) +
              imageScopeDiagnostic +
              observationLines(imageSnapshot(await images.list(), document, input.sha256)),
          );
          return 0;
        }
        const singleFile = dependencies.imageOutputMode === 'file';
        if (singleFile && options.id === undefined) throw Error('ImageFileRequiresID');
        const singleTarget = singleFile
          ? await files.assertNewOutput({ input, outputPath: options.output, kind: 'image' })
          : undefined;
        if (!singleFile)
          outputDirectory = await files.createImageDirectory({ input, outputPath: options.output });
        preflightImageReceipts(selected, outputDirectory, singleTarget);
        let totalBytes = 0;
        const failures = [];
        for (const [index, image] of selected.entries()) {
          try {
            const result = await images.read(image.id, { sourceSha256: input.sha256 });
            if (
              result.id !== image.id ||
              result.sourceSha256 !== input.sha256 ||
              result.status !== 'ready' ||
              !(result.bytes instanceof Uint8Array)
            )
              throw Error('InvalidImageResult');
            totalBytes += result.bytes.length;
            if (totalBytes > 32 * 1024 * 1024) throw Error('ExtractedBytesLimitExceeded');
            // Source names/IDs never become filesystem components.
            const extensions = [
              '.png',
              '.jpg',
              '.jpeg',
              '.gif',
              '.bmp',
              '.webp',
              '.tif',
              '.tiff',
              '.bin',
            ];
            const extension = result.extension;
            if (typeof extension !== 'string' || !extensions.includes(extension))
              throw Error('InvalidImageExtension');
            const path = singleFile
              ? options.output
              : join(
                  outputDirectory!.path,
                  `image-${String(index + 1).padStart(4, '0')}${extension}`,
                );
            const target =
              singleTarget ??
              (await files.assertNewOutput({
                input,
                outputPath: path,
                kind: 'image',
                directory: outputDirectory,
              }));
            files.assertImageFormat(target, extension);
            const receipt = await files.publishNewOutput({ target, bytes: result.bytes });
            imagePublished.push({ id: image.id, ...receipt }); // Before any further await/output.
          } catch (cause) {
            failures.push({ id: image.id, error: errorCode(cause) });
          }
        }
        const finalList = imageSnapshot(await images.list(), document, input.sha256);
        await io.stdout.write(
          line('documentSHA256', input.sha256) +
            line('format', document.format) +
            imageScopeDiagnostic +
            (outputDirectory ? line('outputDirectory', outputDirectory.path) : '') +
            observationLines(finalList.coverage, 'coverage') +
            observationLines(imagePublished, 'publishedImages') +
            observationLines(failures, 'failures') +
            line('completeWithinListedScope', failures.length === 0),
        );
        if (failures.length) throw Error('IncompleteImageExtraction');
        return 0;
      } finally {
        try {
          await images?.close();
        } finally {
          await document.close();
        }
      }
    }
    if (options.command === 'read') {
      const renderDocument =
        dependencies.renderDocument ?? (await import('./render.ts')).renderDocument;
      const result = await readDocumentOperation(
        { inputSnapshot: input, wasm: wasm.bytes, format: options.format, view: options.view },
        { files, engine, renderDocument, loadWasm },
      );
      await io.stdout.write(renderReadResponse(result, { view: options.view }));
      return 0;
    }
    const result = await engine.edit({
      bytes: input.bytes,
      wasm: wasm.bytes,
      target: options.target,
      replace: options.replace,
      with: options.with,
      allowStaleLayout: options.allowStaleLayout,
    });
    engineFormat(result.format);
    if (typeof result.changed !== 'boolean' || typeof result.layoutRequiresReflow !== 'boolean')
      throw Error('InvalidEngineResult');
    if (!target) throw Error('MissingDocumentOutputTarget');
    files.assertOutputFormat(target, result.format);
    published = await files.publishNewOutput({ target, bytes: result.bytes });
    await io.stdout.write(
      line('output', published.path) +
        line('format', result.format) +
        line('sha256', published.sha256) +
        line('changed', result.changed) +
        line('layoutRequiresReflow', result.layoutRequiresReflow) +
        warningLines(published.warnings),
    );
    return 0;
  } catch (cause) {
    const details = errorFields(cause);
    const primary = String(details.code ?? (cause instanceof Error ? cause.message : cause));
    const directory =
      outputDirectory?.path ??
      (typeof details.createdDirectory === 'string' ? details.createdDirectory : undefined);
    const summary = errorFields(details.batchSummary);
    try {
      const diagnostic =
        line('error', primary) +
        (typeof details.operationReport === 'string' &&
        details.operationReport.length <= OBSERVATION_CHAR_LIMIT
          ? details.operationReport
          : '') +
        (details.batchSummary
          ? line('batchReadSucceeded', summary.readSucceeded) +
            line('batchReadFailed', summary.readFailed) +
            line('batchDelivery', 'failed-or-partial')
          : '') +
        line('published', Boolean(published) || imagePublished.length > 0) +
        (directory || imagePublished.length
          ? line('publishedImageCount', imagePublished.length)
          : '') +
        (directory ? line('outputDirectory', directory) : '') +
        observationLines(imagePublished, 'publishedImages') +
        (published ? line('output', published.path) + line('sha256', published.sha256) : '') +
        warningLines(Array.isArray(details.cleanupWarnings) ? details.cleanupWarnings : undefined);
      await io.stderr.write(diagnostic);
    } catch (diagnosticFailure) {
      try {
        await io.stderr.write(
          fallbackLine('error', primary) +
            line('published', Boolean(published) || imagePublished.length > 0) +
            (directory || imagePublished.length
              ? line('publishedImageCount', imagePublished.length)
              : '') +
            (directory ? fallbackLine('outputDirectory', directory) : '') +
            (published
              ? fallbackLine('output', published.path) + fallbackLine('sha256', published.sha256)
              : '') +
            // Single-file MCP has no output directory; retain its exact location.
            (!directory && imagePublished.length
              ? fallbackLine('output', imagePublished[0].path)
              : '') +
            line('receiptDetailsOmitted', imagePublished.length) +
            fallbackLine('diagnosticFailure', errorCode(diagnosticFailure)),
        );
      } catch {
        /* Even a broken diagnostic stream cannot undo publication or replace the primary exit. */
      }
    }
    return cause instanceof ArgumentsError ? 2 : 1;
  }
}
