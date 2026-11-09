import test from 'node:test';
import assert from 'node:assert/strict';
import { ocrProcessEnvironment } from '../src/ocr/process-environment.ts';
import { runOcrProcess } from '../src/ocr/process.ts';

test('OCR child inherits a closed set of runtime settings and no credentials or loaders', () => {
  const source = {
    PATH: '/usr/bin:/bin',
    HOME: '/example',
    TMPDIR: '/tmp/ocr',
    TEMP: '/tmp',
    LANG: 'ko_KR.UTF-8',
    LC_ALL: 'C.UTF-8',
    TESSDATA_PREFIX: '/models',
    NPM_OHAH_TOKEN: 'fake-npm-token',
    AWS_SECRET_ACCESS_KEY: 'fake-aws-secret',
    NODE_OPTIONS: '--require=/untrusted/loader.js',
    LD_PRELOAD: '/untrusted.so',
    DYLD_INSERT_LIBRARIES: '/untrusted.dylib',
    HTTPS_PROXY: 'https://untrusted.invalid',
    PYTHONPATH: '/untrusted',
    HWPJS_OCR_SECRET: 'fake-secret',
    OMP_THREAD_LIMIT: '99',
  };
  const actual = ocrProcessEnvironment(source);
  for (const key of ['PATH', 'HOME', 'TMPDIR', 'TEMP', 'LANG', 'LC_ALL', 'TESSDATA_PREFIX'])
    assert.equal(actual[key], source[key]);
  for (const key of [
    'NPM_OHAH_TOKEN',
    'AWS_SECRET_ACCESS_KEY',
    'NODE_OPTIONS',
    'LD_PRELOAD',
    'DYLD_INSERT_LIBRARIES',
    'HTTPS_PROXY',
    'PYTHONPATH',
    'HWPJS_OCR_SECRET',
  ])
    assert.equal(Object.hasOwn(actual, key), false, key);
  assert.equal(actual.OMP_THREAD_LIMIT, '1');
  actual.HOME = '/changed';
  assert.equal(source.HOME, '/example');
  assert.equal(Object.getPrototypeOf(actual), null);
});

test('Windows settings are normalized without retaining alternate-case duplicates', () => {
  const env = ocrProcessEnvironment({
    Path: 'C:\\ocr',
    SYSTEMROOT: 'C:\\Windows',
    windir: 'C:\\Windows',
    USERPROFILE: 'C:\\user',
  });
  assert.equal(env.PATH, 'C:\\ocr');
  assert.equal(env.SystemRoot, 'C:\\Windows');
  assert.equal(env.WINDIR, 'C:\\Windows');
  assert.equal(env.USERPROFILE, 'C:\\user');
  for (const key of ['Path', 'SYSTEMROOT', 'windir']) assert.equal(Object.hasOwn(env, key), false);
  assert.deepEqual(
    Object.keys(ocrProcessEnvironment({})).filter(
      (k) => ocrProcessEnvironment({})[k] !== undefined,
    ),
    ['OMP_THREAD_LIMIT'],
  );
});

test('real OCR child cannot observe a parent secret and keeps required model settings', async () => {
  const names = ['HWPJS_OCR_SECURITY_TEST_SECRET', 'TESSDATA_PREFIX', 'OMP_THREAD_LIMIT'];
  const saved = new Map(names.map((k) => [k, process.env[k]]));
  try {
    process.env.HWPJS_OCR_SECURITY_TEST_SECRET = 'synthetic-secret-only';
    process.env.TESSDATA_PREFIX = '/synthetic/models';
    process.env.OMP_THREAD_LIMIT = '99';
    const result = await runOcrProcess({
      executable: process.execPath,
      args: [
        '-e',
        'process.stdout.write(JSON.stringify({leaked:Object.hasOwn(process.env,"HWPJS_OCR_SECURITY_TEST_SECRET"),model:process.env.TESSDATA_PREFIX,threads:process.env.OMP_THREAD_LIMIT}))',
      ],
    });
    assert.deepEqual(JSON.parse(result.stdout), {
      leaked: false,
      model: '/synthetic/models',
      threads: '1',
    });
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
