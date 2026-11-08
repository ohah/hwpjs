import test from 'node:test';
import assert from 'node:assert/strict';
import { recognizeImage, ocrLanguages, OcrError } from '../src/ocr/common.ts';
import { createTesseractProvider } from '../src/ocr/tesseract.ts';
import { createVisionProvider } from '../src/ocr/vision.ts';

const image = () => Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10, 0);

test('OCR 코어는 원본 view를 복사하고 명시한 언어·본문을 보존한다', async () => {
  const bytes = image();
  const copy = bytes.slice();
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const pending = recognizeImage({
    bytes,
    provider: {
      async recognize(input) {
        await gate;
        assert.deepEqual(input.bytes, copy);
        assert.deepEqual(input.languages, ['kor', 'eng']);
        return { text: '한글 English\n' };
      },
    },
  });
  bytes.fill(0);
  release();
  assert.deepEqual(await pending, {
    status: 'recognized',
    text: '한글 English\n',
    languages: ['kor', 'eng'],
  });
});

test('byte view의 임의 iterator를 실행하지 않고 입력 길이와 바이트를 포착한다', async () => {
  const bytes = image();
  bytes[Symbol.iterator] = () => {
    throw new Error('외부 iterator 실행 금지');
  };
  const result = await recognizeImage({
    bytes,
    provider: {
      recognize: async (input) => {
        assert.deepEqual(input.bytes, image());
        return { text: '관측' };
      },
    },
  });
  assert.equal(result.text, '관측');
});

test('관측 빈 OCR와 도구 실패·부재를 구분하며 UTF8 한도와 UTF16을 검사한다', async () => {
  assert.equal(
    (
      await recognizeImage({
        bytes: image(),
        provider: { recognize: async () => ({ text: ' \n' }) },
      })
    ).status,
    'no-text',
  );
  await assert.rejects(recognizeImage({ bytes: image() }), { code: 'ProviderUnavailable' });
  for (const text of [null, '\ud800'])
    await assert.rejects(
      recognizeImage({ bytes: image(), provider: { recognize: async () => ({ text }) } }),
      { code: 'ProviderInvalidResponse' },
    );
  await assert.rejects(
    recognizeImage({
      bytes: image(),
      limits: { maxOutputBytes: 2 },
      provider: { recognize: async () => ({ text: '한' }) },
    }),
    { code: 'OcrOutputLimitExceeded' },
  );
  const failure = new OcrError('ProviderFailed');
  await assert.rejects(
    recognizeImage({
      bytes: image(),
      provider: {
        recognize: async () => {
          throw failure;
        },
      },
    }),
    (error) => error === failure,
  );
});

test('코어는 파일 목록·SVG·PDF·OLE·초과 이미지와 잘못된 언어를 실행기에 전달하지 않는다', async () => {
  let calls = 0;
  const provider = {
    recognize: async () => {
      calls++;
      return { text: '' };
    },
  };
  for (const bytes of [
    new TextEncoder().encode('/private/input.png\n'),
    new TextEncoder().encode('<svg/>'),
    new TextEncoder().encode('%PDF'),
    Uint8Array.of(208, 207, 17, 224),
  ])
    await assert.rejects(recognizeImage({ bytes, provider }), { code: 'OcrInputUnsupported' });
  await assert.rejects(recognizeImage({ bytes: image(), provider, limits: { maxInputBytes: 2 } }), {
    code: 'OcrInputLimitExceeded',
  });
  for (const languages of ['', 'eng+eng', 'eng;rm', ['kor', '--config'], Array(9).fill('eng')])
    assert.throws(() => ocrLanguages(languages), /InvalidOcrLanguages/);
  assert.equal(calls, 0);
});

test('Tesseract 어댑터는 kor+eng 모두 준비된 경우만 실행하고 shell 옵션을 합성하지 않는다', async () => {
  const calls = [];
  const provider = createTesseractProvider({
    executable: '/local/tesseract',
    run: async (options) => {
      calls.push(options);
      return {
        stdout:
          calls.length === 1 ? 'List of available languages (2):\nkor\neng\n' : '한글 English\n',
      };
    },
  });
  await provider.prepare();
  await recognizeImage({ bytes: image(), provider });
  assert.deepEqual(calls[0].args, ['--list-langs']);
  assert.deepEqual(calls[1].args, ['stdin', 'stdout', '-l', 'kor+eng', '--psm', '3']);
  assert.deepEqual(calls[1].input, image());
  const missing = createTesseractProvider({ run: async () => ({ stdout: 'eng\n' }) });
  await assert.rejects(
    missing.prepare(),
    (error) => error.code === 'ProviderUnavailable' && error.reason.includes('kor'),
  );
});

test('Vision은 명시 선택·지원 언어·OS를 검사하며 임의 executable을 받지 않는다', async () => {
  assert.throws(
    () => createVisionProvider({ executable: '/custom/tool' }),
    /VisionExecutableOverrideNotAllowed/,
  );
  await assert.rejects(createVisionProvider({ platform: 'linux' }).prepare(), {
    code: 'ProviderUnavailable',
  });
  let calls = 0;
  const provider = createVisionProvider({
    platform: 'darwin',
    run: async (options) => {
      calls++;
      assert.equal(options.executable, '/usr/bin/osascript');
      assert.equal(options.args.at(-1), 'kor+eng');
      return { stdout: JSON.stringify({ ok: true, text: '한글', languages: ['kor', 'eng'] }) };
    },
  });
  await provider.prepare();
  assert.equal((await recognizeImage({ bytes: image(), provider })).text, '한글');
  await assert.rejects(provider.prepare({ languages: 'fra' }), { code: 'ProviderUnavailable' });
  assert.equal(calls, 2);
});

test('Tesseract가 일부 언어만 읽고 exit0을 반환해도 한국어 누락을 영어 성공으로 바꾸지 않는다', async () => {
  const provider = createTesseractProvider({
    run: async () => ({ stdout: 'English only', stderr: "Failed loading language 'kor'\n" }),
  });
  await assert.rejects(
    recognizeImage({ bytes: image(), provider }),
    (error) => error.code === 'ProviderUnavailable' && error.reason === 'LanguageModelUnavailable',
  );
});
