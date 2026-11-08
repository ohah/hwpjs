import type {
  ExtendedCommandName,
  ExtendedCommandOptions,
  ReadFormat,
  DocumentFormat,
} from './types/commands.ts';
import { parseObjectReference } from './object-reference.ts';
import { parseNativeTarget } from './native-target.ts';

export const EXTENDED_OPTIONS = Object.freeze({
  apply: ['patch', 'operations', 'expect-sha256', 'output', 'wasm', 'allow-stale-layout'],
  create: ['format', 'output', 'text-file', 'wasm', 'allow-stale-layout'],
  convert: ['to', 'output', 'expect-sha256', 'loss-policy', 'wasm', 'allow-stale-layout'],
  ocr: ['ref', 'provider', 'languages', 'executable', 'format', 'expect-sha256', 'wasm'],
  paragraph: ['target', 'format', 'expect-sha256', 'wasm'],
});

export const EXTENDED_USAGE = `  hwpjs apply INPUT (--patch FILE | --operations JSON) --expect-sha256 SHA256 --output OUTPUT [--allow-stale-layout] [--wasm PATH]
  hwpjs create --format hwp5|hwpx --output OUTPUT [--text-file FILE] [--allow-stale-layout] [--wasm PATH]
  hwpjs convert INPUT --to hwp5|hwpx --output OUTPUT [--loss-policy reject|text-only] [--expect-sha256 SHA256] [--allow-stale-layout] [--wasm PATH]
  hwpjs ocr INPUT [--ref IMAGE_REFERENCE] [--provider tesseract|vision] [--languages kor+eng] [--executable PATH] [--format text|markdown] [--wasm PATH]
  hwpjs paragraph INPUT --target s0:p3 [--expect-sha256 SHA256] [--format text|markdown] [--wasm PATH]`;

type Fail = (code: string) => never;
type Options = ReadonlyMap<string, string>;

export function interpretExtendedArguments(
  command: ExtendedCommandName,
  options: Options,
  positional: readonly string[],
  fail: Fail,
): ExtendedCommandOptions {
  const wasm = options.get('wasm');
  const common = wasm === undefined ? {} : { wasm };
  const required = (name: string, code: string): string => {
    const value = options.get(name);
    if (!value || value === '-') return fail(code);
    return value;
  };
  const outputFormat = (): ReadFormat => {
    const value = options.get('format') ?? 'text';
    if (value !== 'text' && value !== 'markdown') return fail('InvalidReadFormat');
    return value;
  };
  const format = (name: string): DocumentFormat => {
    const value = options.get(name);
    if (value !== 'hwp5' && value !== 'hwpx') return fail('InvalidDocumentFormat');
    return value;
  };
  const save = () => ({
    output: required('output', 'ExpectedOutputFile'),
    allowStaleLayout: options.has('allow-stale-layout'),
  });
  if (command === 'create') {
    if (positional.length) return fail('UnexpectedInputFile');
    return Object.freeze({
      ...common,
      ...save(),
      command,
      format: format('format'),
      ...(options.has('text-file') ? { textFile: required('text-file', 'InvalidTextFile') } : {}),
    });
  }
  if (positional.length !== 1 || !positional[0] || positional[0] === '-')
    return fail('ExpectedInputFile');
  const input = positional[0];
  const expected = options.get('expect-sha256');
  if (expected !== undefined && !/^[a-f0-9]{64}$/iu.test(expected))
    return fail('InvalidExpectedSHA256');
  const source = {
    ...common,
    input,
    ...(expected === undefined ? {} : { expectSha256: expected.toLowerCase() }),
  };
  if (command === 'apply') {
    if (options.has('patch') === options.has('operations'))
      return fail('ExpectedOneOperationSource');
    if (expected === undefined) return fail('MissingRequiredOption:expect-sha256');
    return Object.freeze({
      ...source,
      ...save(),
      command,
      expectSha256: expected.toLowerCase(),
      ...(options.has('patch')
        ? { patch: required('patch', 'ExpectedPatchFile') }
        : { inlineOperations: required('operations', 'ExpectedOperations') }),
    });
  }
  if (command === 'convert') {
    const lossPolicy = options.get('loss-policy') ?? 'reject';
    if (lossPolicy !== 'reject' && lossPolicy !== 'text-only')
      return fail('InvalidConversionLossPolicy');
    return Object.freeze({ ...source, ...save(), command, to: format('to'), lossPolicy });
  }
  if (command === 'paragraph') {
    let target;
    try {
      target = parseNativeTarget(options.get('target'));
    } catch {
      return fail('InvalidTarget');
    }
    return Object.freeze({ ...source, command, target, format: outputFormat() });
  }
  const provider = options.get('provider') ?? 'tesseract';
  if (provider !== 'tesseract' && provider !== 'vision') return fail('InvalidOcrProvider');
  const languages = options.get('languages') ?? 'kor+eng';
  const requested = languages.split('+');
  if (
    languages.length > 128 ||
    !/^[a-zA-Z0-9_]+(?:\+[a-zA-Z0-9_]+)*$/u.test(languages) ||
    requested.length > 8 ||
    new Set(requested).size !== requested.length
  )
    return fail('InvalidOcrLanguages');
  const executable = options.has('executable')
    ? required('executable', 'InvalidOcrExecutable')
    : undefined;
  if (provider === 'vision' && executable !== undefined)
    return fail('VisionExecutableOverrideUnsupported');
  const reference = options.get('ref');
  let expectSha256 = source.expectSha256;
  if (reference !== undefined) {
    if (expected !== undefined) return fail('ConflictingImageReference');
    let parsed;
    try {
      parsed = parseObjectReference(reference);
    } catch {
      return fail('InvalidObjectReference');
    }
    if (parsed.kind !== 'image') return fail('ExpectedImageReference');
    expectSha256 = parsed.sourceSha256;
  }
  return Object.freeze({
    ...source,
    command,
    format: outputFormat(),
    provider,
    languages,
    ...(executable === undefined ? {} : { executable }),
    ...(reference === undefined ? {} : { reference }),
    ...(expectSha256 === undefined ? {} : { expectSha256 }),
  });
}
