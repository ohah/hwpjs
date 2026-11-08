import { BATCH_READ_LIMITS } from './batch-read.mjs';

export const USAGE = `Usage:
  hwpjs read INPUT [--format text|markdown] [--view content|structure] [--wasm PATH]
  hwpjs read-many INPUT... [--format text|markdown] [--view content|structure] [--concurrency 1|2] [--max-output-bytes N] [--wasm PATH]
  hwpjs edit INPUT --target s0:p3 --replace OLD --with NEW --expect-sha256 SHA256 --output OUTPUT [--allow-stale-layout] [--wasm PATH]
  hwpjs info INPUT [--expect-sha256 SHA256] [--wasm PATH]
  hwpjs images INPUT [--expect-sha256 SHA256] [--wasm PATH]
  hwpjs extract-images INPUT --output NEWDIR [--id ID --expect-sha256 SHA256] [--wasm PATH]
  hwpjs --help

Read defaults to text. 기본 보기는 문서 내용(content)입니다.
편집용 Native ID와 SHA는 read --view structure로 확인합니다.
Use --with '' to delete. Use --option=VALUE when VALUE starts with --.
extract-images --output is a NEW DIRECTORY, never a single image file.
Selecting --id requires the SHA from images; all images use one opened snapshot.
Output must be new; existing files are never overwritten.
read-many는 명시 파일 1~128개만 읽습니다. 기본 동시성은 1, 최대 2이며 일부 실패도 보고합니다.
출력 예산은 기본 4MiB, 최대 16MiB입니다. 폴더 탐색·일괄 편집·HTML·문서 JSON 출력은 제공하지 않습니다.
`;

export class ArgumentsError extends Error {
  constructor(code) {
    super(code);
    this.name = 'CLIArgumentsError';
    this.code = code;
  }
}
const fail = (code) => {
  throw new ArgumentsError(code);
};
const string = (value) => typeof value === 'string' && value.isWellFormed();
const uint = (value) => Number.isSafeInteger(value) && value >= 0 && value <= 0xffffffff;
export function parseArguments(argv) {
  const argc = Array.isArray(argv) ? argv.length : -1;
  if (!Number.isInteger(argc) || argc < 0 || argc > 256) fail('InvalidArguments');
  const captured = [];
  for (let index = 0; index < argc; index++) {
    const value = argv[index];
    if (!string(value)) fail('InvalidArguments');
    captured.push(value);
  }
  argv = captured;
  if (argv.length === 1 && argv[0] === '--help') return Object.freeze({ command: 'help' });
  const command = argv[0];
  if (!['read', 'read-many', 'edit', 'info', 'images', 'extract-images'].includes(command))
    fail('UnknownCommand');
  if (argv.length === 2 && argv[1] === '--help') return Object.freeze({ command: 'help' });
  const allowed = new Set(
    {
      read: ['format', 'view', 'wasm'],
      'read-many': ['format', 'view', 'wasm', 'concurrency', 'max-output-bytes'],
      edit: ['target', 'replace', 'with', 'expect-sha256', 'output', 'wasm', 'allow-stale-layout'],
      info: ['wasm', 'expect-sha256'],
      images: ['wasm', 'expect-sha256'],
      'extract-images': ['wasm', 'expect-sha256', 'output', 'id'],
    }[command],
  );
  const options = new Map(),
    positional = [];
  let literal = false;
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (!literal && arg === '--') {
      literal = true;
      continue;
    }
    if (!literal && arg.startsWith('-')) {
      const match = /^--([a-z][a-z0-9-]*)(?:=(.*))?$/s.exec(arg);
      if (!match || !allowed.has(match[1])) fail('UnknownOption');
      const name = match[1];
      if (options.has(name)) fail('DuplicateOption');
      if (name === 'allow-stale-layout') {
        if (match[2] !== undefined) fail('UnexpectedOptionValue');
        options.set(name, true);
        continue;
      }
      const value = match[2] ?? argv[++i];
      if (value === undefined || (match[2] === undefined && value.startsWith('--')))
        fail('MissingOptionValue');
      options.set(name, value);
    } else positional.push(arg);
  }
  const wasm = options.get('wasm');
  if (wasm !== undefined && !wasm) fail('InvalidWasmPath');
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
    if (!['content', 'structure'].includes(view)) fail('InvalidReadView');
    const format = options.get('format') ?? 'text';
    if (!['text', 'markdown'].includes(format)) fail('InvalidReadFormat');
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
  if (['info', 'images', 'extract-images'].includes(command)) {
    const expected = options.get('expect-sha256');
    if (expected !== undefined && !/^[0-9a-f]{64}$/i.test(expected)) fail('InvalidExpectedSHA256');
    const id = options.get('id');
    if (id !== undefined && (!id || id.length > 128)) fail('InvalidImageID');
    if (id !== undefined && expected === undefined) fail('ImageIDRequiresSHA256');
    const output = options.get('output');
    if (command === 'extract-images' && (!output || output === '-'))
      fail('ExpectedOutputDirectory');
    return Object.freeze({
      command,
      input,
      ...(expected === undefined ? {} : { expectSha256: expected.toLowerCase() }),
      ...(wasm === undefined ? {} : { wasm }),
      ...(id === undefined ? {} : { id }),
      ...(output === undefined ? {} : { output }),
    });
  }
  if (command === 'read') {
    const view = options.get('view') ?? 'content';
    if (!['content', 'structure'].includes(view)) fail('InvalidReadView');
    const format = options.get('format') ?? 'text';
    if (!['text', 'markdown'].includes(format)) fail('InvalidReadFormat');
    return Object.freeze({ command, input, format, view, ...(wasm === undefined ? {} : { wasm }) });
  }
  for (const key of ['target', 'replace', 'with', 'expect-sha256', 'output'])
    if (!options.has(key)) fail('MissingRequiredOption:' + key);
  const address = /^s(0|[1-9]\d*):p(0|[1-9]\d*)$/.exec(options.get('target'));
  if (!address || !uint(Number(address[1])) || !uint(Number(address[2]))) fail('InvalidTarget');
  if (!options.get('replace')) fail('EmptySearch');
  const expected = options.get('expect-sha256');
  if (!/^[0-9a-f]{64}$/i.test(expected)) fail('InvalidExpectedSHA256');
  const output = options.get('output');
  if (!output || output === '-') fail('ExpectedOutputFile');
  return Object.freeze({
    command,
    input,
    target: Object.freeze({ section: Number(address[1]), paragraph: Number(address[2]) }),
    replace: options.get('replace'),
    with: options.get('with'),
    output,
    expectSha256: expected.toLowerCase(),
    allowStaleLayout: options.get('allow-stale-layout') === true,
    ...(wasm === undefined ? {} : { wasm }),
  });
}
