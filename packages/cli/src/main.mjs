import { parseArguments, ArgumentsError, USAGE } from './arguments.mjs';
import * as defaultFiles from './files.mjs';
import { join } from 'node:path';

// Scalar metadata must never inject additional terminal lines or C0 controls.
const scalar = (value) =>
  Array.from(String(value), (character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127 ? '\\u' + code.toString(16).padStart(4, '0') : character;
  }).join('');
const line = (key, value) => `${key}: ${scalar(value)}\n`;
const warningLines = (warnings = []) =>
  warnings
    .map((warning) =>
      line(
        'warning',
        typeof warning === 'string'
          ? warning
          : Object.entries(warning)
              .map(([key, value]) => `${key}=${scalar(value)}`)
              .join(' '),
      ),
    )
    .join('');
const engineFormat = (value) => {
  if (!['hwp5', 'hwpx'].includes(value)) throw Error('InvalidEngineFormat');
};
const OBSERVATION_CHAR_LIMIT = 4 * 1024 * 1024;
// Bounded scalar text only: no raw document JSON or image payload output.
function observationLines(value, prefix = '') {
  const lines = [];
  let size = 0;
  function visit(item, key, depth) {
    if (depth > 12 || lines.length >= 50000) throw Error('ObservationOutputLimit');
    if (item !== null && typeof item === 'object') {
      for (const [name, child] of Object.entries(item))
        visit(child, key ? `${key}.${name}` : name, depth + 1);
    } else {
      const text = line(key, item === null ? 'unknown' : item);
      size += text.length;
      if (size > OBSERVATION_CHAR_LIMIT) throw Error('ObservationOutputLimit');
      lines.push(text);
    }
  }
  visit(value, prefix, 0);
  return lines.join('');
}
const imageScopeDiagnostic = line(
  'scopeDiagnostic',
  'Section picture sites only; excludes master-page images, image brushes and unreferenced resources. Not a legacy Rust full-image extraction compatibility claim.',
);
// Reserve the complete planned path/SHA/count ledger before any file commit.
// Payload extension is not known yet; .jpeg is the longest admitted suffix.
function preflightImageReceipts(selected, directory, singleTarget) {
  const planned = selected.map((image, index) => ({
    id: image.id,
    published: true,
    path:
      singleTarget?.path ??
      join(directory.path, `image-${String(index + 1).padStart(4, '0')}.jpeg`),
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
function fallbackLine(key, value) {
  const text = String(value);
  const bounded =
    text.length > 4096 ? text.slice(0, 4096) + `[omitted ${text.length - 4096} UTF16 units]` : text;
  return line(key, bounded);
}
function imageSnapshot(list, document, sha) {
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
const writeStream = (stream, text) =>
  new Promise((accept, reject) => {
    const onError = (cause) => reject(cause);
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
export async function runCLI(argv, dependencies = {}) {
  const io = dependencies.io ?? {
    stdout: { write: (text) => writeStream(process.stdout, text) },
    stderr: { write: (text) => writeStream(process.stderr, text) },
  };
  const files = dependencies.files ?? defaultFiles;
  let published;
  const imagePublished = [];
  let outputDirectory;
  try {
    const options = parseArguments(argv);
    if (options.command === 'help') {
      await io.stdout.write(USAGE);
      return 0;
    }
    const input = await files.readInputSnapshot(options.input, {
      maxBytes: defaultFiles.MAX_DOCUMENT_BYTES,
    });
    if (options.expectSha256 !== undefined && input.sha256 !== options.expectSha256)
      throw Error('SourceSHA256Mismatch');
    const target =
      options.command === 'edit'
        ? await files.assertNewOutput({ input, outputPath: options.output })
        : undefined;
    const wasmPath = files.resolveWasmPath(options.wasm, dependencies.mainModuleURL);
    let wasm;
    try {
      wasm = await files.readInputSnapshot(wasmPath, { maxBytes: defaultFiles.MAX_WASM_BYTES });
    } catch (cause) {
      if (options.wasm === undefined && cause.code === 'ENOENT')
        throw Error('ExplicitWasmRequired: pass --wasm PATH', { cause });
      throw cause;
    }
    if (options.command === 'info') {
      const inspect =
        dependencies.inspectDocument ?? (await import('./inspect-document.mjs')).inspectDocument;
      const result = await inspect({
        bytes: input.bytes,
        wasm: wasm.bytes,
        expectedSha256: options.expectSha256,
      });
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
    const engine = dependencies.engine ?? (await import('./engine.mjs'));
    if (options.command === 'images' || options.command === 'extract-images') {
      const document = await engine.openDocument({
        bytes: input.bytes,
        wasm: wasm.bytes,
        expectedSha256: input.sha256,
      });
      let images;
      try {
        engineFormat(document.format);
        if (document.sourceSha256 !== input.sha256) throw Error('SourceSHA256Mismatch');
        const create =
          dependencies.createDocumentImages ??
          (await import('./document-images.mjs')).createDocumentImages;
        images = await create({
          sdk: document.sdk,
          format: document.format,
          sourceSha256: input.sha256,
          sectionCount: document.sectionCount,
        });
        const snapshot = imageSnapshot(await images.list(), document, input.sha256);
        const selected =
          options.id === undefined
            ? snapshot.images
            : snapshot.images.filter((image) => image.id === options.id);
        if (options.id !== undefined && selected.length !== 1) throw Error('UnknownImageId');
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
            if (!extensions.includes(result.extension)) throw Error('InvalidImageExtension');
            const path = singleFile
              ? options.output
              : join(
                  outputDirectory.path,
                  `image-${String(index + 1).padStart(4, '0')}${result.extension}`,
                );
            const target =
              singleTarget ??
              (await files.assertNewOutput({
                input,
                outputPath: path,
                kind: 'image',
                directory: outputDirectory,
              }));
            files.assertImageFormat(target, result.extension);
            const receipt = await files.publishNewOutput({ target, bytes: result.bytes });
            imagePublished.push({ id: image.id, ...receipt }); // Before any further await/output.
          } catch (cause) {
            failures.push({ id: image.id, error: cause?.code ?? cause?.message ?? String(cause) });
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
      const result = await engine.read({ bytes: input.bytes, wasm: wasm.bytes });
      engineFormat(result.format);
      if (
        result.model?.version !== 1 ||
        result.model.format !== result.format ||
        result.model.sourceSha256 !== input.sha256
      )
        throw Error('InvalidEngineModel');
      const renderDocument =
        dependencies.renderDocument ?? (await import('./render.mjs')).renderDocument;
      const body = await renderDocument(result.model, { format: options.format });
      if (typeof body !== 'string' || !body.isWellFormed()) throw Error('InvalidRenderedDocument');
      await io.stdout.write(
        `format: ${result.format}\ndocumentSHA256: ${input.sha256}\n${body}${body.endsWith('\n') ? '' : '\n'}`,
      );
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
    const primary = cause?.code ?? (cause instanceof Error ? cause.message : String(cause));
    const directory = outputDirectory?.path ?? cause?.createdDirectory;
    try {
      const diagnostic =
        line('error', primary) +
        line('published', Boolean(published) || imagePublished.length > 0) +
        (directory || imagePublished.length
          ? line('publishedImageCount', imagePublished.length)
          : '') +
        (directory ? line('outputDirectory', directory) : '') +
        observationLines(imagePublished, 'publishedImages') +
        (published ? line('output', published.path) + line('sha256', published.sha256) : '') +
        warningLines(cause?.cleanupWarnings);
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
            fallbackLine(
              'diagnosticFailure',
              diagnosticFailure?.code ?? diagnosticFailure?.message ?? String(diagnosticFailure),
            ),
        );
      } catch {
        /* Even a broken diagnostic stream cannot undo publication or replace the primary exit. */
      }
    }
    return cause instanceof ArgumentsError ? 2 : 1;
  }
}
