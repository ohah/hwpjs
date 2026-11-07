import assert from 'node:assert/strict';
import test from 'node:test';
import { parseArguments as parse } from '../src/arguments.mjs';
const sha = 'a'.repeat(64);
const edit = (...extra) => [
  'edit',
  'input.hwp',
  '--target',
  's0:p3',
  '--replace',
  'old',
  '--with',
  'new',
  '--expect-sha256',
  sha,
  '--output',
  'output.hwp',
  ...extra,
];

test('read defaults text and optional markdown/relative WASM are explicit', () => {
  assert.deepEqual(parse(['read', 'input.hwpx']), {
    command: 'read',
    input: 'input.hwpx',
    format: 'text',
  });
  assert.deepEqual(parse(['read', '--format=markdown', '--wasm', '../native.wasm', 'input.hwpx']), {
    command: 'read',
    input: 'input.hwpx',
    format: 'markdown',
    wasm: '../native.wasm',
  });
});
test('edit owns exact strings, empty replacement and native IDs without display conversion', () => {
  const argv = edit();
  argv[argv.indexOf('--with') + 1] = '';
  const result = parse(argv);
  argv[1] = 'mutated';
  assert.equal(result.with, '');
  assert.equal(result.input, 'input.hwp');
  assert.deepEqual(result.target, { section: 0, paragraph: 3 });
  assert.equal(result.allowStaleLayout, false);
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.target));
  assert.equal(parse(edit('--allow-stale-layout')).allowStaleLayout, true);
});
test('all u32 native addresses are syntax-only, not guessed section membership or numbering', () => {
  for (const id of ['s0:p0', 's0:p1', 's7:p2147483648', 's4294967295:p4294967295']) {
    const argv = edit();
    argv[3] = id;
    assert.equal(parse(argv).target.paragraph, Number(id.split(':p')[1]));
  }
  for (const id of [
    's0:p4294967296',
    's4294967296:p0',
    's01:p2',
    'S0:p2',
    's0:p-1',
    's0:p1.5',
    's0:p9007199254740992',
  ]) {
    const argv = edit();
    argv[3] = id;
    assert.throws(() => parse(argv), /InvalidTarget/);
  }
});
test('SHA is mandatory exact hex and normalized only in the hash field', () => {
  const argv = edit();
  argv[9] = sha.toUpperCase();
  assert.equal(parse(argv).expectSha256, sha);
  for (const value of ['', 'a'.repeat(63), 'z'.repeat(64), ' ' + sha]) {
    const argv = edit();
    argv[9] = value;
    assert.throws(() => parse(argv));
  }
  const absent = edit();
  absent.splice(8, 2);
  assert.throws(() => parse(absent), /MissingRequiredOption/);
});
test('unknown/duplicate options and cross-command options are rejected', () => {
  for (const argv of [
    edit('--force'),
    edit('--output=x.hwp'),
    edit('--target=s0:p2'),
    edit('--format=text'),
    ['read', 'in.hwp', '--output=out.hwp'],
    ['read', 'in.hwp', '--format=html'],
    edit('--allow-stale-layout=false'),
  ])
    assert.throws(() => parse(argv));
});
test('missing values and positionals fail; help is independent of file access', () => {
  for (const argv of [
    [],
    ['read'],
    ['edit'],
    ['read', 'a', 'b'],
    ['read', 'a', '--wasm'],
    ['read', 'a', '--format', '--wasm=x'],
    ['read', '-'],
  ])
    assert.throws(() => parse(argv));
  assert.deepEqual(parse(['--help']), { command: 'help' });
  assert.deepEqual(parse(['edit', '--help']), { command: 'help' });
});
test('literal option-looking text, whitespace and decomposed Unicode stay unchanged', () => {
  const argv = edit();
  argv[5] = ' e\u0301 ';
  argv.splice(6, 2, '--with=--target');
  const result = parse(argv);
  assert.equal(result.replace, ' e\u0301 ');
  assert.equal(result.with, '--target');
  assert.equal(parse(['read', '--', '--literal.hwp']).input, '--literal.hwp');
  const bad = edit();
  bad[5] = '';
  assert.throws(() => parse(bad), /EmptySearch/);
  const surrogate = edit();
  surrogate[7] = '\ud800';
  assert.throws(() => parse(surrogate), /InvalidArguments/);
});

test('info/images retain optional snapshot SHA and reject unrelated editing options', () => {
  for (const command of ['info', 'images']) {
    assert.deepEqual(parse([command, 'input']), { command, input: 'input' });
    assert.equal(
      parse([command, 'input', '--expect-sha256=' + sha.toUpperCase()]).expectSha256,
      sha,
    );
    assert.throws(() => parse([command, 'input', '--format=json']), /UnknownOption/);
  }
});
test('extract-images names a new directory; selecting an ID requires exact snapshot SHA', () => {
  assert.deepEqual(parse(['extract-images', 'in', '--output=dir']), {
    command: 'extract-images',
    input: 'in',
    output: 'dir',
  });
  assert.throws(
    () => parse(['extract-images', 'in', '--output=dir', '--id=hwpx:s0:i3']),
    /ImageIDRequiresSHA256/,
  );
  assert.equal(
    parse(['extract-images', 'in', '--output=dir', '--id=hwpx:s0:i3', '--expect-sha256=' + sha]).id,
    'hwpx:s0:i3',
  );
  for (const extra of [
    ['--output=-'],
    [],
    ['--output=x', '--expect-sha256=no'],
    ['--output=x', '--id='],
  ])
    assert.throws(() => parse(['extract-images', 'in', ...extra]));
});

test('read-many는 명시 경로와 한도 옵션을 소유하고 옵션 같은 경로는 리터럴로 보존한다', () => {
  const argv = [
    'read-many',
    '--format=markdown',
    '--concurrency=2',
    '--max-output-bytes=8000',
    '--wasm=w',
    '--',
    '--문서.hwp',
    'b.hwpx',
  ];
  const options = parse(argv);
  argv[7] = '변경';
  assert.deepEqual(options.inputPaths, ['--문서.hwp', 'b.hwpx']);
  assert.equal(options.format, 'markdown');
  assert.equal(options.concurrency, 2);
  assert.equal(options.maxOutputBytes, 8000);
  assert.equal(options.wasm, 'w');
  assert.ok(Object.isFrozen(options.inputPaths));
  const defaults = parse(['read-many', 'a']);
  assert.equal(defaults.concurrency, 1);
  assert.equal(defaults.maxOutputBytes, 4194304);
});
test('read-many의 빈 입력·중복·128 초과·HTML·JSON·폴더 옵션·일괄 편집을 거부한다', () => {
  for (const argv of [
    ['read-many'],
    ['read-many', 'a', 'a'],
    ['read-many', ...Array.from({ length: 129 }, (_, i) => String(i))],
    ['read-many', 'a', '--format=html'],
    ['read-many', 'a', '--format=json'],
    ['read-many', 'a', '--recursive'],
    ['read-many', 'a', '--output=x'],
    ['read-many', 'a', '--concurrency=3'],
    ['read-many', 'a', '--concurrency=1.5'],
    ['read-many', 'a', '--max-output-bytes=0'],
    ['read-many', 'a', '--max-output-bytes=16777217'],
    ['read-many', '-'],
    ['read-many', '줄\n바꿈'],
    ['read-many', 'a', '--max-output-bytes=NaN'],
  ])
    assert.throws(() => parse(argv));
  assert.equal(
    parse(['read-many', ...Array.from({ length: 128 }, (_, i) => String(i))]).inputPaths.length,
    128,
  );
});
test('프로그램에서 전달한 argv도 길이를 한 번 포착하고 반복기를 사용하지 않는다', () => {
  let reads = 0;
  const argv = new Proxy(['read-many', 'a'], {
    get(array, key, receiver) {
      if (key === 'length') {
        reads++;
        return 2;
      }
      if (key === Symbol.iterator) throw Error('반복기 접근 금지');
      return Reflect.get(array, key, receiver);
    },
  });
  assert.deepEqual(parse(argv).inputPaths, ['a']);
  assert.equal(reads, 1);
});
