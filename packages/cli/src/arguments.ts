import type { CLIOptions, ExtendedCommandName, NativeTarget } from './types/commands.ts';
import { BATCH_READ_LIMITS } from './batch-read.ts';
import { parseObjectReference, canonicalImageId } from './object-reference.ts';
import { parseNativeTarget } from './native-target.ts';
import {
  EXTENDED_OPTIONS,
  EXTENDED_USAGE,
  interpretExtendedArguments,
} from './extended-arguments.ts';

export const USAGE = `Usage:
  hwpjs read INPUT [--format text|markdown] [--view content|structure] [--wasm PATH]
  hwpjs read-many INPUT... [--format text|markdown] [--view content|structure] [--concurrency 1|2] [--max-output-bytes N] [--wasm PATH]
  hwpjs edit INPUT --target s0:p3 --replace OLD --with NEW --expect-sha256 SHA256 --output OUTPUT [--allow-stale-layout] [--wasm PATH]
  hwpjs info INPUT [--expect-sha256 SHA256] [--wasm PATH]
  hwpjs images INPUT [--expect-sha256 SHA256] [--wasm PATH]
  hwpjs object INPUT --ref REFERENCE [--format text|markdown] [--wasm PATH]
  hwpjs extract-images INPUT --output NEWDIR [--ref REFERENCE | --id ID --expect-sha256 SHA256] [--wasm PATH]
${EXTENDED_USAGE}
  hwpjs --help

Read defaults to text. 기본 보기는 문서 내용(content)입니다.
편집용 Native ID와 SHA는 read --view structure로 확인합니다.
Use --with '' to delete. Use --option=VALUE when VALUE starts with --.
extract-images --output is a NEW DIRECTORY, never a single image file.
Selecting --id requires the SHA from images; all images use one opened snapshot.
본문의 개체 참조는 object --ref로 조회합니다. 이미지 참조는 extract-images --ref로 추출할 수 있습니다.
참조는 네트워크 주소가 아닙니다. --ref는 --id/--expect-sha256와 함께 사용할 수 없습니다.
Output must be new; existing files are never overwritten.
read-many는 명시 파일 1~128개만 읽습니다. 기본 동시성은 1, 최대 2이며 일부 실패도 보고합니다.
출력 예산은 기본 4MiB, 최대 16MiB입니다. 폴더 탐색·일괄 편집·문서 JSON 출력은 제공하지 않습니다.
export-html은 의미 구조를 HTML로 변환하며 원본 서식·페이지 배치를 재현하지 않습니다.
insert-image의 width/height는 HWPUNIT(1/7200인치), unit은 Native UTF-16 좌표입니다.
`;

export class ArgumentsError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = 'CLIArgumentsError';
    this.code = code;
  }
}
const fail = (code: string): never => {
  throw new ArgumentsError(code);
};
const string = (value: unknown): value is string =>
  typeof value === 'string' && value.isWellFormed();
const reference = (value: unknown) => {
  try {
    return parseObjectReference(value);
  } catch {
    return fail('InvalidObjectReference');
  }
};
export function parseArguments(argv: unknown): CLIOptions {
  if (!Array.isArray(argv)) return fail('InvalidArguments');
  const argc = Array.isArray(argv) ? argv.length : -1;
  if (!Number.isInteger(argc) || argc < 0 || argc > 256) fail('InvalidArguments');
  const captured: string[] = [];
  for (let index = 0; index < argc; index++) {
    const value = argv[index];
    if (!string(value)) fail('InvalidArguments');
    captured.push(value);
  }
  if (captured.length === 1 && captured[0] === '--help') return Object.freeze({ command: 'help' });
  const command = captured[0];
  if (
    !['read', 'read-many', 'edit', 'info', 'images', 'extract-images', 'object'].includes(
      command,
    ) &&
    !Object.hasOwn(EXTENDED_OPTIONS, command)
  )
    fail('UnknownCommand');
  if (captured.length === 2 && captured[1] === '--help') return Object.freeze({ command: 'help' });
  const definitions: Record<string, readonly string[]> = {
    read: ['format', 'view', 'wasm'],
    'read-many': ['format', 'view', 'wasm', 'concurrency', 'max-output-bytes'],
    edit: ['target', 'replace', 'with', 'expect-sha256', 'output', 'wasm', 'allow-stale-layout'],
    info: ['wasm', 'expect-sha256'],
    images: ['wasm', 'expect-sha256'],
    'extract-images': ['wasm', 'expect-sha256', 'output', 'id', 'ref'],
    object: ['wasm', 'ref', 'format'],
    ...EXTENDED_OPTIONS,
  };
  const allowed = new Set(definitions[command]);
  const options = new Map<string, string>(),
    positional: string[] = [];
  let literal = false;
  for (let i = 1; i < captured.length; i++) {
    const arg = captured[i];
    if (!literal && arg === '--') {
      literal = true;
      continue;
    }
    if (!literal && arg.startsWith('-')) {
      const match = /^--([a-z][a-z0-9-]*)(?:=(.*))?$/s.exec(arg);
      if (!match || !allowed.has(match[1])) return fail('UnknownOption');
      const name = match[1];
      if (options.has(name)) fail('DuplicateOption');
      if (name === 'allow-stale-layout') {
        if (match[2] !== undefined) fail('UnexpectedOptionValue');
        options.set(name, 'true');
        continue;
      }
      const value = match[2] ?? captured[++i];
      if (value === undefined || (match[2] === undefined && value.startsWith('--')))
        fail('MissingOptionValue');
      options.set(name, value);
    } else positional.push(arg);
  }
  const wasm = options.get('wasm');
  if (wasm !== undefined && !wasm) fail('InvalidWasmPath');
  if (Object.hasOwn(EXTENDED_OPTIONS, command))
    return interpretExtendedArguments(command as ExtendedCommandName, options, positional, fail);
  if (command === 'read-many') {
    if (positional.length < 1 || positional.length > BATCH_READ_LIMITS.maxInputs)
      fail('InvalidInputPaths');
    const paths = new Map();
    for (const path of positional) {
      if (!path || path === '-' || path.length > BATCH_READ_LIMITS.maxInputPathUnits)
        fail('InvalidInputPath');
      for (let at = 0; at < path.length; at++)
        if (path.charCodeAt(at) < 32 || path.charCodeAt(at) === 127) fail('InvalidInputPath');
      if (paths.has(path)) fail('DuplicateInputPath');
      paths.set(path, true);
    }
    const view = options.get('view') ?? 'content';
    if (view !== 'content' && view !== 'structure') return fail('InvalidReadView');
    const format = options.get('format') ?? 'text';
    if (format !== 'text' && format !== 'markdown') return fail('InvalidReadFormat');
    const concurrency = options.get('concurrency') ?? '1';
    if (!/^[12]$/.test(concurrency)) fail('InvalidConcurrency');
    const budget = options.get('max-output-bytes') ?? String(BATCH_READ_LIMITS.defaultOutputBytes);
    if (
      !/^[1-9]\d*$/.test(budget) ||
      !Number.isSafeInteger(Number(budget)) ||
      Number(budget) > BATCH_READ_LIMITS.maxOutputBytes
    )
      fail('InvalidOutputBudget');
    return Object.freeze({
      command,
      inputPaths: Object.freeze([...positional]),
      format,
      view,
      concurrency: Number(concurrency),
      maxOutputBytes: Number(budget),
      ...(wasm === undefined ? {} : { wasm }),
    });
  }
  if (positional.length !== 1 || !positional[0] || positional[0] === '-') fail('ExpectedInputFile');
  const input = positional[0];
  if (command === 'object') {
    const ref = options.get('ref');
    if (ref === undefined) return fail('InvalidObjectReference');
    const parsed = reference(ref);
    const format = options.get('format') ?? 'text';
    if (format !== 'text' && format !== 'markdown') return fail('InvalidReadFormat');
    return Object.freeze({
      command,
      input,
      reference: ref,
      format,
      expectSha256: parsed.sourceSha256,
      ...(wasm === undefined ? {} : { wasm }),
    });
  }
  if (command === 'info' || command === 'images' || command === 'extract-images') {
    let expected = options.get('expect-sha256');
    if (expected !== undefined && !/^[0-9a-f]{64}$/i.test(expected)) fail('InvalidExpectedSHA256');
    let id = options.get('id');
    if (id !== undefined && (!id || id.length > 128)) fail('InvalidImageID');
    if (id !== undefined && expected === undefined) fail('ImageIDRequiresSHA256');
    const ref = options.get('ref');
    if (ref !== undefined) {
      if (options.has('id') || options.has('expect-sha256')) fail('ConflictingImageReference');
      const parsed = reference(ref);
      if (parsed.kind !== 'image') fail('ExpectedImageReference');
      expected = parsed.sourceSha256;
      id = canonicalImageId(parsed);
    }
    const output = options.get('output');
    const base = {
      input,
      ...(expected === undefined ? {} : { expectSha256: expected.toLowerCase() }),
      ...(wasm === undefined ? {} : { wasm }),
      ...(id === undefined ? {} : { id }),
      ...(output === undefined ? {} : { output }),
      ...(ref === undefined ? {} : { reference: ref }),
    };
    if (command === 'extract-images') {
      if (!output || output === '-') return fail('ExpectedOutputDirectory');
      return Object.freeze({ ...base, command, output });
    }
    return Object.freeze({ ...base, command });
  }
  if (command === 'read') {
    const view = options.get('view') ?? 'content';
    if (view !== 'content' && view !== 'structure') return fail('InvalidReadView');
    const format = options.get('format') ?? 'text';
    if (format !== 'text' && format !== 'markdown') return fail('InvalidReadFormat');
    return Object.freeze({ command, input, format, view, ...(wasm === undefined ? {} : { wasm }) });
  }
  if (command !== 'edit') return fail('UnknownCommand');
  for (const key of ['target', 'replace', 'with', 'expect-sha256', 'output'])
    if (!options.has(key)) fail('MissingRequiredOption:' + key);
  let target: NativeTarget;
  try {
    target = parseNativeTarget(options.get('target'));
  } catch {
    return fail('InvalidTarget');
  }
  const replacement = options.get('replace');
  if (!replacement) return fail('EmptySearch');
  const withText = options.get('with');
  if (withText === undefined) return fail('MissingRequiredOption:with');
  const expected = options.get('expect-sha256');
  if (expected === undefined || !/^[0-9a-f]{64}$/i.test(expected))
    return fail('InvalidExpectedSHA256');
  const output = options.get('output');
  if (!output || output === '-') return fail('ExpectedOutputFile');
  return Object.freeze({
    command,
    input,
    target,
    replace: replacement,
    with: withText,
    output,
    expectSha256: expected.toLowerCase(),
    allowStaleLayout: options.has('allow-stale-layout'),
    ...(wasm === undefined ? {} : { wasm }),
  });
}
