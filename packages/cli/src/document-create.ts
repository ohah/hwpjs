import { createNewDocumentBytes } from '../../../js/new-document.mjs';
import { normalizeParagraphReplacement } from '../../../js/paragraph-replacement.mjs';
import { detectDocumentFormat } from '../../../js/document-format.mjs';
import { openDocument } from './engine.ts';

import type {
  DocumentFormat,
  DocumentOpenOptions,
  Hwp5Sdk,
  HwpxSdk,
} from './types/native-document.ts';

export interface DocumentCreateOptions {
  format: DocumentFormat;
  text?: string;
  wasm: Uint8Array;
  allowStaleLayout?: boolean;
}
export interface CreatedDocumentResult {
  schemaVersion: 1;
  format: DocumentFormat;
  bytes: Uint8Array;
  paragraphCount: number;
  layoutRequiresReflow: boolean;
}
interface CreationLifetime {
  sectionCount: number;
  save: (options: { allowStaleLayout: boolean }) => unknown;
  close: () => void | Promise<void>;
}
export type CreationSession = CreationLifetime &
  (
    | {
        format: 'hwp5';
        sdk: Pick<
          Hwp5Sdk,
          | 'paragraphFlow'
          | 'paragraphCount'
          | 'text'
          | 'splice'
          | 'splitParagraph'
          | 'replaceParagraphRanges'
        >;
      }
    | { format: 'hwpx'; sdk: Pick<HwpxSdk, 'paragraphTextSnapshot' | 'replaceParagraphRanges'> }
  );
export interface DocumentCreateDependencies {
  createNewDocumentBytes?: (wasm: Uint8Array, format: DocumentFormat) => Promise<Uint8Array>;
  openDocument?: (options: DocumentOpenOptions) => Promise<CreationSession>;
}

export const DOCUMENT_CREATE_LIMITS = Object.freeze({
  maxTextBytes: 4 * 1024 * 1024,
  maxParagraphs: 4096,
  maxBinaryBytes: 64 * 1024 * 1024,
});

// 새 문서의 문자열만 초기화합니다. 파일 호스트·임의 문서·템플릿 파서는 소유하지 않습니다.
export async function createDocument(
  input: unknown = {},
  dependencies: DocumentCreateDependencies = {},
): Promise<CreatedDocumentResult> {
  if (!input || typeof input !== 'object') throw new TypeError('InvalidCreationInput');
  const { format, text = '', wasm, allowStaleLayout = false } = input as Record<string, unknown>;
  if (format !== 'hwp5' && format !== 'hwpx') throw new TypeError('InvalidDocumentFormat');
  if (typeof allowStaleLayout !== 'boolean') throw new TypeError('InvalidAllowStaleLayout');
  if (typeof text !== 'string' || !text.isWellFormed()) throw new TypeError('InvalidCreationText');
  if (
    text.length > DOCUMENT_CREATE_LIMITS.maxTextBytes ||
    new TextEncoder().encode(text).length > DOCUMENT_CREATE_LIMITS.maxTextBytes
  )
    throw new RangeError('CreationTextLimitExceeded');
  const normalized = normalizeParagraphReplacement(text);
  // CR/LF만 공통 문단 정규화 정책으로 처리합니다. 다른 제어문자를 몰래 삭제하지 않습니다.
  // eslint-disable-next-line no-control-regex -- Native 제어 토큰의 주입을 거부합니다.
  if (/[\u0000-\u0009\u000b-\u001f\u0085\u2028\u2029]/u.test(normalized))
    throw new Error('UnsupportedCreationControl');
  const lines = normalized.split('\n');
  if (lines.length > DOCUMENT_CREATE_LIMITS.maxParagraphs)
    throw new RangeError('CreationParagraphLimitExceeded');
  if (!(wasm instanceof Uint8Array)) throw new TypeError('ExpectedWasmUint8Array');
  if (!wasm.byteLength || wasm.byteLength > DOCUMENT_CREATE_LIMITS.maxBinaryBytes)
    throw new RangeError('WasmLimitExceeded');
  const binary = Uint8Array.from(wasm);
  const make = dependencies.createNewDocumentBytes ?? createNewDocumentBytes;
  const open = dependencies.openDocument ?? openDocument;
  const blank = await make(binary, format);
  const document = await open({ bytes: blank, wasm: binary });
  let failed = false,
    failure: unknown;
  let result: CreatedDocumentResult | undefined;
  try {
    if (document.format !== format || document.sectionCount !== 1)
      throw new Error('InvalidBlankDocument');
    if (document.format === 'hwpx') {
      const sdk = document.sdk;
      const rows = sdk.paragraphTextSnapshot(0);
      if (
        !Array.isArray(rows) ||
        rows.length !== 1 ||
        !Number.isInteger(rows[0].paragraph) ||
        rows[0].paragraph < 1 ||
        rows[0].text !== '' ||
        rows[0].nested !== false
      )
        throw new Error('InvalidBlankDocument');
      if (normalized !== '')
        sdk.replaceParagraphRanges({
          properties: undefined,
          ranges: [{ section: 0, paragraph: rows[0].paragraph, startUnit: 0, endUnit: 0 }],
          text: normalized,
        });
      if (sdk.paragraphTextSnapshot(0).length !== lines.length)
        throw new Error('CreatedParagraphCountMismatch');
    } else {
      const sdk = document.sdk;
      const flow = sdk.paragraphFlow(0);
      if (
        !Array.isArray(flow) ||
        flow.length !== 1 ||
        sdk.paragraphCount(0) !== 1 ||
        !Number.isInteger(flow[0].paragraph) ||
        flow[0].paragraph < 0 ||
        flow[0].host !== 'body' ||
        flow[0].top_level !== true
      )
        throw new Error('InvalidBlankDocument');
      const paragraph = flow[0].paragraph;
      const current = sdk.text(0, paragraph);
      if (typeof current !== 'string' || !current.endsWith('\r'))
        throw new Error('InvalidBlankDocument');
      // 구역/단 제어의 길이를 추정하지 않고 Native 현재 문자열의 종결 위치를 사용합니다.
      const end = current.length - 1;
      if (lines[0] !== '')
        sdk.splice({ section: 0, paragraph, startUnit: end, endUnit: end, text: lines[0] });
      if (lines.length > 1) {
        sdk.splitParagraph({ section: 0, paragraph, atUnit: end + lines[0].length });
        const after = sdk.paragraphFlow(0);
        const continuations = after.filter((row) => row.paragraph !== paragraph);
        if (
          after.length !== 2 ||
          continuations.length !== 1 ||
          continuations[0].generated !== true ||
          continuations[0].host !== 'body' ||
          !Number.isInteger(continuations[0].paragraph) ||
          continuations[0].paragraph < 0
        )
          throw new Error('InvalidCreatedContinuation');
        const remaining = normalized.slice(normalized.indexOf('\n') + 1);
        if (remaining !== '')
          sdk.replaceParagraphRanges({
            properties: undefined,
            ranges: [
              { section: 0, paragraph: continuations[0].paragraph, startUnit: 0, endUnit: 0 },
            ],
            text: remaining,
          });
      }
      if (sdk.paragraphCount(0) !== lines.length) throw new Error('CreatedParagraphCountMismatch');
    }
    const saved = document.save({ allowStaleLayout });
    const metadata =
      saved && typeof saved === 'object' ? (saved as Record<string, unknown>) : undefined;
    const bytes = format === 'hwp5' ? metadata?.bytes : saved;
    const layoutRequiresReflow = format === 'hwp5' ? metadata?.layoutRequiresReflow : false;
    if (
      !(bytes instanceof Uint8Array) ||
      !bytes.byteLength ||
      bytes.byteLength > DOCUMENT_CREATE_LIMITS.maxBinaryBytes ||
      typeof layoutRequiresReflow !== 'boolean' ||
      detectDocumentFormat(bytes) !== format
    )
      throw new Error('InvalidCreatedDocumentOutput');
    if (layoutRequiresReflow && !allowStaleLayout) throw new Error('LayoutReflowRequired');
    result = {
      schemaVersion: 1,
      format,
      bytes: Uint8Array.from(bytes),
      paragraphCount: lines.length,
      layoutRequiresReflow,
    };
  } catch (error) {
    failed = true;
    failure = error;
  }
  try {
    await document.close();
  } catch (error) {
    if (failed)
      throw new AggregateError([failure, error], 'DocumentCreationAndCloseFailed', {
        cause: failure,
      });
    throw new Error('DocumentCreationCloseFailed', { cause: error });
  }
  if (failed) throw failure;
  if (!result) throw new Error('MissingCreatedDocumentOutput');
  return result;
}
