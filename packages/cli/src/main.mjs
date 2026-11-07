import { parseArguments, ArgumentsError, USAGE } from './arguments.mjs';
import * as defaultFiles from './files.mjs';

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
  try {
    const options = parseArguments(argv);
    if (options.command === 'help') {
      await io.stdout.write(USAGE);
      return 0;
    }
    const input = await files.readInputSnapshot(options.input, {
      maxBytes: defaultFiles.MAX_DOCUMENT_BYTES,
    });
    if (options.command === 'edit' && input.sha256 !== options.expectSha256)
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
    const engine = dependencies.engine ?? (await import('./engine.mjs'));
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
    const diagnostic =
      line('error', cause?.code ?? (cause instanceof Error ? cause.message : String(cause))) +
      line('published', Boolean(published)) +
      (published ? line('output', published.path) + line('sha256', published.sha256) : '') +
      warningLines(cause?.cleanupWarnings);
    try {
      await io.stderr.write(diagnostic);
    } catch {
      /* A broken diagnostic stream cannot undo a published file. */
    }
    return cause instanceof ArgumentsError ? 2 : 1;
  }
}
