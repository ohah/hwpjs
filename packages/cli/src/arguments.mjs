export const USAGE = `Usage:
  hwpjs read INPUT [--format text|markdown] [--wasm PATH]
  hwpjs edit INPUT --target s0:p3 --replace OLD --with NEW --expect-sha256 SHA256 --output OUTPUT [--allow-stale-layout] [--wasm PATH]
  hwpjs --help

Read defaults to text. Targets are exact Native IDs printed by read.
Use --with '' to delete. Use --option=VALUE when VALUE starts with --.
Output must be new; existing files are never overwritten.
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
  if (!Array.isArray(argv) || !Array.from(argv).every(string)) fail('InvalidArguments');
  if (argv.length === 1 && argv[0] === '--help') return Object.freeze({ command: 'help' });
  const command = argv[0];
  if (!['read', 'edit'].includes(command)) fail('UnknownCommand');
  if (argv.length === 2 && argv[1] === '--help') return Object.freeze({ command: 'help' });
  const allowed = new Set(
    command === 'read'
      ? ['format', 'wasm']
      : ['target', 'replace', 'with', 'expect-sha256', 'output', 'wasm', 'allow-stale-layout'],
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
  if (positional.length !== 1 || !positional[0] || positional[0] === '-') fail('ExpectedInputFile');
  const input = positional[0],
    wasm = options.get('wasm');
  if (wasm !== undefined && !wasm) fail('InvalidWasmPath');
  if (command === 'read') {
    const format = options.get('format') ?? 'text';
    if (!['text', 'markdown'].includes(format)) fail('InvalidReadFormat');
    return Object.freeze({ command, input, format, ...(wasm === undefined ? {} : { wasm }) });
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
