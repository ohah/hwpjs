import { OcrError, ocrLanguages, ocrLimits, imageInput, isRecord, ocrSignal } from './common.ts';
import { runOcrProcess } from './process.ts';
import type {
  PreparedOcrProvider,
  OcrProcessRequest,
  OcrProcessRunner,
  OcrProviderImageInput,
} from './types.ts';

export function createTesseractProvider(options: unknown = {}): PreparedOcrProvider {
  if (!isRecord(options)) throw new TypeError('InvalidOcrProviderOptions');
  const { executable = 'tesseract', run = runOcrProcess } = options;
  if (typeof executable !== 'string' || typeof run !== 'function')
    throw new TypeError('InvalidOcrProviderOptions');
  const runner = run as OcrProcessRunner;
  const languageFailure = (value: unknown): boolean =>
    typeof value === 'string' &&
    /Failed loading language|Error opening data file|couldn't load any languages/iu.test(value);
  const checked = async (
    options: OcrProcessRequest,
  ): Promise<{ stdout: string; stderr?: string }> => {
    let output: unknown;
    try {
      output = await runner(options);
    } catch (error) {
      if (languageFailure(isRecord(error) ? error.stderr : undefined))
        throw new OcrError('ProviderUnavailable', {
          reason: 'LanguageModelUnavailable',
          cause: error,
        });
      throw error;
    }
    if (
      !isRecord(output) ||
      typeof output.stdout !== 'string' ||
      (output.stderr !== undefined && typeof output.stderr !== 'string')
    )
      throw new OcrError('ProviderInvalidResponse');
    if (languageFailure(output.stderr))
      throw new OcrError('ProviderUnavailable', { reason: 'LanguageModelUnavailable' });
    return {
      stdout: output.stdout,
      ...(output.stderr === undefined ? {} : { stderr: output.stderr }),
    };
  };
  return {
    id: 'tesseract',
    async prepare(input: unknown = {}) {
      if (!isRecord(input)) throw new TypeError('InvalidOcrProviderOptions');
      const { languages = 'kor+eng', limits } = input;
      const signal = ocrSignal(input.signal);
      const requested = ocrLanguages(languages);
      const output = await checked({
        executable,
        args: ['--list-langs'],
        limits: ocrLimits(limits),
        signal,
      });
      const available = new Set(output.stdout.split(/\r?\n/u).map((line) => line.trim()));
      if (requested.some((language) => !available.has(language)))
        throw new OcrError('ProviderUnavailable', {
          reason:
            'LanguageUnavailable:' +
            requested.filter((language) => !available.has(language)).join('+'),
        });
      return { languages: requested };
    },
    async recognize({ bytes, languages, limits, signal }: OcrProviderImageInput) {
      const requested = ocrLanguages(languages);
      const budget = ocrLimits(limits);
      const output = await checked({
        executable,
        args: ['stdin', 'stdout', '-l', requested.join('+'), '--psm', '3'],
        input: imageInput(bytes, budget.maxInputBytes),
        limits: budget,
        signal,
      });
      return { text: output.stdout };
    },
  };
}
