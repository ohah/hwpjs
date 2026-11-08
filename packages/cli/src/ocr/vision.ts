import { OcrError, ocrLanguages, ocrLimits, imageInput, isRecord, ocrSignal } from './common.ts';
import { runOcrProcess } from './process.ts';
import type {
  PreparedOcrProvider,
  OcrProcessRunner,
  OcrProviderInput,
  OcrProviderImageInput,
} from './types.ts';

// Apple OS 제공 Vision만 호출합니다. 컴파일·카메라·URL·모델 다운로드를 사용하지 않습니다.
const script = `function run(args) {
  ObjC.import('Vision');
  var requested = args[1].split('+');
  var mapping = {kor:'ko-KR', eng:'en-US'};
  var request = $.VNRecognizeTextRequest.alloc.init;
  request.recognitionLevel = $.VNRequestTextRecognitionLevelAccurate;
  request.usesLanguageCorrection = false;
  var error = Ref();
  var supported = ObjC.deepUnwrap(request.supportedRecognitionLanguagesAndReturnError(error));
  for (var i=0; i<requested.length; i++) {
    if (!mapping[requested[i]] || supported.indexOf(mapping[requested[i]]) < 0)
      return JSON.stringify({ok:false, code:'ProviderUnavailable', reason:'LanguageUnavailable'});
  }
  if (args[0] === 'prepare') return JSON.stringify({ok:true, languages:requested});
  request.recognitionLanguages = requested.map(function(x){return mapping[x];});
  var data = $.NSFileHandle.fileHandleWithStandardInput.readDataToEndOfFile;
  var handler = $.VNImageRequestHandler.alloc.initWithDataOptions(data, $({}));
  if (!handler.performRequestsError($.NSArray.arrayWithObject(request), error))
    return JSON.stringify({ok:false, code:'ProviderFailed', reason:'VisionRequestFailed'});
  var observations = request.results;
  var lines = [];
  for (var j=0; observations && j<observations.count; j++) {
    var candidates = observations.objectAtIndex(j).topCandidates(1);
    if (candidates.count) lines.push(ObjC.unwrap(candidates.objectAtIndex(0).string));
  }
  return JSON.stringify({ok:true, text:lines.join('\\n'), languages:requested});
}`;

export function createVisionProvider(options: unknown = {}): PreparedOcrProvider {
  if (!isRecord(options)) throw new TypeError('InvalidOcrProviderOptions');
  const { run = runOcrProcess, platform = process.platform, executable } = options;
  if (typeof run !== 'function' || typeof platform !== 'string')
    throw new TypeError('InvalidOcrProviderOptions');
  const runner = run as OcrProcessRunner;
  if (executable !== undefined) throw new TypeError('VisionExecutableOverrideNotAllowed');
  const invoke = async (
    mode: 'prepare' | 'recognize',
    input: unknown = {},
  ): Promise<Record<string, unknown>> => {
    if (!isRecord(input)) throw new TypeError('InvalidOcrProviderOptions');
    const { bytes, languages = 'kor+eng', limits } = input;
    const signal = ocrSignal(input.signal);
    if (platform !== 'darwin')
      throw new OcrError('ProviderUnavailable', { reason: 'MacOSRequired' });
    const requested = ocrLanguages(languages);
    const budget = ocrLimits(limits);
    if (requested.some((language) => !['kor', 'eng'].includes(language)))
      throw new OcrError('ProviderUnavailable', { reason: 'LanguageUnavailable' });
    const output = await runner({
      executable: '/usr/bin/osascript',
      args: ['-l', 'JavaScript', '-e', script, mode, requested.join('+')],
      input: mode === 'recognize' ? imageInput(bytes, budget.maxInputBytes) : new Uint8Array(),
      limits: budget,
      signal,
    });
    if (!isRecord(output) || typeof output.stdout !== 'string')
      throw new OcrError('ProviderInvalidResponse');
    let result: unknown;
    try {
      result = JSON.parse(output.stdout);
    } catch (cause) {
      throw new OcrError('ProviderInvalidResponse', { cause });
    }
    if (!isRecord(result) || result.ok !== true)
      throw new OcrError(
        isRecord(result) && result.code === 'ProviderUnavailable'
          ? 'ProviderUnavailable'
          : 'ProviderFailed',
        {
          reason: isRecord(result) && typeof result.reason === 'string' ? result.reason : undefined,
        },
      );
    return result;
  };
  return {
    id: 'vision',
    prepare: (input: OcrProviderInput) => invoke('prepare', input),
    recognize: (input: OcrProviderImageInput) => invoke('recognize', input),
  };
}
