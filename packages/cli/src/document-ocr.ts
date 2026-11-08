import {
  parseObjectReference,
  buildObjectReference,
  canonicalImageId,
} from './object-reference.ts';
import { createDisplayEscaper } from './render-escape.ts';
import {
  OcrError,
  ocrLanguages,
  ocrLimits,
  recognizeImage,
  ownedBytes,
  isRecord,
  isProvider,
  ocrSignal,
  errorCode,
} from './ocr/common.ts';
import type {
  DocumentOcrResult,
  OcrDependencies,
  OcrDocumentHandle,
  OcrImageCollector,
  OcrProviderFactoryOptions,
  PreparedOcrProvider,
  OcrImageResult,
  RecognizedImage,
  FailedImage,
} from './ocr/types.ts';

export { OcrError } from './ocr/common.ts';

async function providerFactory({
  provider,
  executable,
}: OcrProviderFactoryOptions): Promise<PreparedOcrProvider> {
  if (provider === 'vision')
    return (await import('./ocr/vision.ts')).createVisionProvider({ executable });
  return (await import('./ocr/tesseract.ts')).createTesseractProvider({ executable });
}

function snapshot(bytes: unknown, name: string): Uint8Array<ArrayBuffer> {
  return ownedBytes(bytes, 64 * 1024 * 1024, name);
}

function documentHandle(value: unknown): value is OcrDocumentHandle {
  return isRecord(value) && typeof value.close === 'function';
}
function imageCollector(value: unknown): value is OcrImageCollector {
  return (
    isRecord(value) &&
    typeof value.list === 'function' &&
    typeof value.read === 'function' &&
    typeof value.close === 'function'
  );
}

// 명시 OCR에서만 이미지 바이트를 읽으며 기존 일반 read에는 연결하지 않습니다.
export async function ocrDocument(
  options: unknown = {},
  dependencies: OcrDependencies = {},
): Promise<DocumentOcrResult> {
  if (!isRecord(options)) throw new TypeError('InvalidOcrOptions');
  const {
    bytes,
    wasm,
    reference,
    provider = 'tesseract',
    languages = 'kor+eng',
    executable,
    format = 'text',
    limits,
  } = options;
  const signal = ocrSignal(options.signal);
  const input = snapshot(bytes, 'Document'),
    binary = snapshot(wasm, 'Wasm');
  if (provider !== 'tesseract' && provider !== 'vision') throw new TypeError('InvalidOcrProvider');
  if (executable !== undefined && typeof executable !== 'string')
    throw new TypeError('InvalidOcrExecutable');
  if (provider === 'vision' && executable !== undefined)
    throw new TypeError('VisionExecutableOverrideNotAllowed');
  if (format !== 'text' && format !== 'markdown') throw new TypeError('InvalidRenderFormat');
  if (reference !== undefined && typeof reference !== 'string')
    throw new TypeError('InvalidObjectReference');
  const requested = ocrLanguages(languages),
    budget = ocrLimits(limits);
  const target = reference === undefined ? null : parseObjectReference(reference);
  if (target && target.kind !== 'image') throw new TypeError('ExpectedImageReference');
  const digest = await crypto.subtle.digest('SHA-256', input);
  const sourceSha256 = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  if (target) parseObjectReference(reference, { sourceSha256 });
  if (signal?.aborted) throw new OcrError('OcrAborted');
  const selectedProvider = await (dependencies.createProvider ?? providerFactory)({
    provider,
    executable,
  });
  if (!isProvider(selectedProvider) || typeof selectedProvider.prepare !== 'function')
    throw new OcrError('ProviderUnavailable');
  await selectedProvider.prepare({ languages: [...requested], limits: budget, signal });
  const open = dependencies.openDocument ?? (await import('./engine.ts')).openDocument;
  const document: unknown = await open({
    bytes: input,
    wasm: binary,
    expectedSha256: sourceSha256,
  });
  if (!documentHandle(document)) throw new Error('InvalidOcrDocumentSnapshot');
  let images: OcrImageCollector | undefined;
  let result: DocumentOcrResult | undefined;
  let failed = false;
  let primary: unknown;
  try {
    if (
      (document.format !== 'hwp5' && document.format !== 'hwpx') ||
      document.sourceSha256 !== sourceSha256 ||
      typeof document.sectionCount !== 'number' ||
      !Number.isInteger(document.sectionCount) ||
      document.sectionCount < 1 ||
      document.sectionCount > 4096
    )
      throw new Error('InvalidOcrDocumentSnapshot');
    if (target) parseObjectReference(reference, { sourceSha256, format: document.format });
    const create =
      dependencies.createDocumentImages ??
      (await import('./document-images.ts')).createDocumentImages;
    const candidate: unknown = await create({
      sdk: document.sdk,
      format: document.format,
      sourceSha256,
      sectionCount: document.sectionCount,
    });
    if (!imageCollector(candidate)) throw new Error('InvalidOcrImageInventory');
    images = candidate;
    const inventory = await images.list();
    if (
      !isRecord(inventory) ||
      inventory.version !== 1 ||
      inventory.format !== document.format ||
      inventory.sourceSha256 !== sourceSha256 ||
      !Array.isArray(inventory.images)
    )
      throw new Error('InvalidOcrImageInventory');
    const rows: unknown[] = inventory.images;
    const count = rows.length;
    if (count > 4096) throw new OcrError('OcrImageCountLimitExceeded');
    const selected: Array<{ id: string; reference: string }> = [],
      ids = new Set<string>();
    for (let index = 0; index < count; index++) {
      const row = rows[index];
      if (!isRecord(row) || !isRecord(row.source)) throw new Error('InvalidOcrImageInventory');
      const section = row.source.section,
        node = row.source.pictureNode;
      if (typeof section !== 'number' || typeof node !== 'number')
        throw new Error('InvalidOcrImageInventory');
      const id = canonicalImageId({ format: document.format, section, node });
      if (row.id !== id || ids.has(id) || section >= document.sectionCount)
        throw new Error('InvalidOcrImageInventory');
      ids.add(id);
      const ref = buildObjectReference({
        sourceSha256,
        format: document.format,
        section,
        kind: 'image',
        node,
      });
      if (!target || ref === reference) selected.push({ id, reference: ref });
    }
    if (target && selected.length !== 1) throw new Error('ObjectReferenceNotFound');
    const escape = createDisplayEscaper({ format, view: 'content' });
    const lines: string[] = [],
      results: OcrImageResult[] = [];
    let outputBytes = 0,
      totalInputBytes = 0,
      inputExhausted = false;
    const line = (text: string): void => {
      outputBytes += new TextEncoder().encode(text).length + 1;
      if (outputBytes > 4 * 1024 * 1024) throw new OcrError('OcrOutputLimitExceeded');
      lines.push(text);
    };
    line(`OCR 공급자: ${provider}; 언어: ${requested.join('+')}`);
    line('구역 이미지의 명시 OCR 결과입니다. 바탕쪽·브러시·페이지 렌더링은 포함하지 않습니다.');
    for (const entry of selected) {
      if (signal?.aborted) throw new OcrError('OcrAborted');
      let observed: RecognizedImage | FailedImage;
      try {
        if (inputExhausted) throw new OcrError('OcrTotalInputLimitExceeded');
        const payload: unknown = await images.read(entry.id, { sourceSha256 });
        if (
          !isRecord(payload) ||
          payload.id !== entry.id ||
          payload.sourceSha256 !== sourceSha256 ||
          payload.status !== 'ready' ||
          !(payload.bytes instanceof Uint8Array)
        )
          throw new Error('InvalidOcrImagePayload');
        totalInputBytes += payload.bytes.length;
        if (totalInputBytes > 32 * 1024 * 1024) {
          inputExhausted = true;
          throw new OcrError('OcrTotalInputLimitExceeded');
        }
        observed = await recognizeImage({
          bytes: payload.bytes,
          provider: selectedProvider,
          languages: requested,
          limits: budget,
          signal,
        });
      } catch (error) {
        const code = errorCode(error);
        if (code === 'ProviderUnavailable' || code === 'OcrAborted') throw error;
        observed = {
          status: 'failed',
          text: '',
          error: code ?? 'OcrImageFailed',
        };
      }
      const row: OcrImageResult = { ...entry, ...observed };
      results.push(row);
      line(`[이미지 ${results.length}: ${entry.reference}] OCR ${row.status}`);
      if (row.status === 'failed') line(escape('OCR 실패: ' + row.error));
      else if (row.status === 'no-text') line('[OCR 공급자가 인식한 텍스트 없음]');
      else for (const logicalLine of row.text.split(/\r?\n/u)) line(escape(logicalLine));
    }
    if (!selected.length) line('[OCR 대상 구역 이미지 없음]');
    const failures = results.filter((row) => row.status === 'failed').length;
    const status = failures ? (failures === results.length ? 'failed' : 'partial') : 'complete';
    result = {
      schemaVersion: 1,
      format: document.format,
      sourceSha256,
      provider,
      languages: requested,
      status,
      images: results,
      text: lines.join('\n') + '\n',
    };
  } catch (error) {
    failed = true;
    primary = error;
  }
  const errors: unknown[] = failed ? [primary] : [];
  if (images) {
    try {
      await images.close();
    } catch (error) {
      errors.push(error);
    }
  }
  try {
    await document.close();
  } catch (error) {
    errors.push(error);
  }
  if (errors.length > 1)
    throw new AggregateError(errors, 'DocumentOcrAndCloseFailed', { cause: errors[0] });
  if (errors.length) throw errors[0];
  if (!result) throw new Error('InvalidOcrResult');
  return result;
}
