import { readFormInventory, publicFormInventory } from './document-forms.ts';
import type { Diagnostic, ObservationSdk } from './types/document-view.ts';
import type { DocumentFormat } from './types/native-document.ts';
import { openDocument as defaultOpenDocument } from './engine.ts';
import { detectDocumentFormat } from '../../../js/document-format.mjs';
import { validateHwp5TextSourceProtection } from '../../../js/hwp5-text-source-protection.mjs';
import { diagnostic, LIMITS, uint } from './model/common.ts';

interface InspectionDocument {
  format: DocumentFormat;
  sourceSha256: string;
  sectionCount: number;
  sdk: ObservationSdk;
  nativeExports?: readonly string[];
  close(): void | Promise<void>;
}
interface InspectionOptions {
  bytes?: unknown;
  wasm?: unknown;
  expectedSha256?: unknown;
}
interface InspectionDependencies {
  openDocument?: (input: unknown) => Promise<InspectionDocument>;
}
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object';
const message = (error: unknown): string =>
  record(error) && typeof error.message === 'string' ? error.message : 'UnknownError';
const invoke = (sdk: ObservationSdk, method: string, args: unknown[] = []): unknown => {
  const fn: unknown = Reflect.get(sdk, method);
  if (typeof fn !== 'function') throw Error('MissingSdkMethod');
  return Reflect.apply(fn, sdk, args) as unknown;
};
const has = (sdk: ObservationSdk, method: string): boolean =>
  typeof Reflect.get(sdk, method) === 'function';
const MAX_INPUT_BYTES = 64 * 1024 * 1024;
const observed = <T>(value: T, source: string) => ({ status: 'observed' as const, value, source });
const unknown = (reason: string) => ({ status: 'unknown' as const, value: null, reason });
const unsupported = (reason: string) => ({ status: 'unsupported' as const, value: null, reason });

function failedObservation(
  diagnostics: Diagnostic[],
  method: string,
  error: unknown,
  source?: Readonly<Record<string, unknown>>,
) {
  diagnostics.push(diagnostic('ObservationUnavailable', `${method}: ${message(error)}`, source));
  return unknown('NativeObservationFailed');
}

function fileVersion(document: InspectionDocument, diagnostics: Diagnostic[]) {
  if (document.format !== 'hwp5' || !has(document.sdk, 'fileVersion'))
    return unsupported('FileVersionNotExposedBySdk');
  try {
    const value = invoke(document.sdk, 'fileVersion');
    if (!uint(value) || value === 0) throw Error('InvalidFileVersionObservation');
    return observed(value, 'sdk.fileVersion');
  } catch (error) {
    return failedObservation(diagnostics, 'fileVersion', error);
  }
}

function textSourceProtection(document: InspectionDocument, diagnostics: Diagnostic[]) {
  const sdk = document.sdk;
  if (document.format !== 'hwp5' || !has(sdk, 'textSourceProtection'))
    return unsupported('TextSourceProtectionNotExposedBySdk');
  try {
    if (has(sdk, 'supportsTextSourceProtection')) {
      const supported = invoke(sdk, 'supportsTextSourceProtection');
      if (supported === false) return unsupported('TextSourceProtectionAbiUnavailable');
      if (supported !== true) throw Error('InvalidProtectionCapabilityObservation');
    }
  } catch (error) {
    return failedObservation(diagnostics, 'supportsTextSourceProtection', error);
  }
  if (!has(sdk, 'paragraphCount')) return unsupported('ProtectionParagraphCountNotExposedBySdk');
  const sections: {
    section: number;
    paragraphCount: number;
    protectedParagraphCount: number;
    mode: unknown;
    retainedHeaders: unknown;
  }[] = [];
  let paragraphs = 0;
  for (let section = 0; section < document.sectionCount; section++) {
    try {
      const count = invoke(sdk, 'paragraphCount', [section]);
      if (!uint(count) || count > 100000) throw Error('InvalidParagraphCountObservation');
      paragraphs += count;
      if (paragraphs > LIMITS.maxBlocks) {
        diagnostics.push(
          diagnostic('ObservationLimitExceeded', 'textSourceProtection', { section }),
        );
        return unknown('ProtectionObservationLimitExceeded');
      }
      const value = validateHwp5TextSourceProtection(
        invoke(sdk, 'textSourceProtection', [section]),
        count,
      );
      sections.push({
        section,
        paragraphCount: count,
        protectedParagraphCount: value.protected_paragraphs.reduce(
          (total: number, bit: boolean | number) => total + Number(bit),
          0,
        ),
        mode: value.mode,
        retainedHeaders: value.retained_headers,
      });
    } catch (error) {
      return failedObservation(diagnostics, 'textSourceProtection', error, { section });
    }
  }
  return observed(sections, 'sdk.paragraphCount + sdk.textSourceProtection');
}

/** Byte-only Native metadata inspection, shared by Node and browser hosts.
 * It opens through the existing engine, which may decode document content.
 * No fast-path, total-count, signature or whole-document editability claim is made.
 * The optional opener is an injection seam for contract tests, not another engine.
 */
export async function inspectDocument(
  { bytes, wasm, expectedSha256 }: InspectionOptions = {},
  { openDocument = defaultOpenDocument }: InspectionDependencies = {},
) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError('ExpectedDocumentUint8Array');
  if (!bytes.byteLength || bytes.byteLength > MAX_INPUT_BYTES)
    throw new RangeError('DocumentLimitExceeded');
  if (
    expectedSha256 !== undefined &&
    (typeof expectedSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(expectedSha256))
  )
    throw new TypeError('InvalidExpectedSha256');
  if (typeof openDocument !== 'function') throw new TypeError('InvalidDocumentOpener');
  if (!globalThis.crypto?.subtle) throw Error('WebCryptoUnavailable');
  const sourceByteLength = bytes.byteLength;
  const snapshot = Uint8Array.from(bytes);
  const format = detectDocumentFormat(snapshot);
  // WebCrypto copies its BufferSource synchronously. Start the digest before
  // passing bytes to the opener, and attach rejection handling immediately.
  // Call openDocument before any await so the engine also captures caller WASM.
  const digest = globalThis.crypto.subtle.digest('SHA-256', snapshot).then(
    (value) => ({ value }),
    (error) => ({ error }),
  );
  const document = await openDocument({ bytes: snapshot, wasm, expectedSha256 });
  let result;
  let failure;
  let failed = false;
  try {
    const hash = await digest;
    if ('error' in hash) throw hash.error;
    const sourceSha256 = Array.from(new Uint8Array(hash.value), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('');
    if (
      !document ||
      typeof document.close !== 'function' ||
      !document.sdk ||
      typeof document.sdk !== 'object'
    )
      throw Error('InvalidOpenedDocument');
    if (document.format !== format) throw Error('DocumentFormatMismatch');
    if (document.sourceSha256 !== sourceSha256) throw Error('DocumentSnapshotSha256Mismatch');
    if (expectedSha256 !== undefined && sourceSha256 !== expectedSha256)
      throw Error('SourceSha256Mismatch');
    if (
      !Number.isInteger(document.sectionCount) ||
      document.sectionCount < 1 ||
      document.sectionCount > 4096
    )
      throw new RangeError('SectionLimitExceeded');
    const diagnostics: Diagnostic[] = [];
    result = {
      schemaVersion: 1,
      format,
      sourceSha256,
      sourceByteLength,
      sectionCount: document.sectionCount,
      fileVersion: fileVersion(document, diagnostics),
      security: {
        encryption: unknown('EncryptionNotExposedBySdk'),
        passwordProtection: unknown('PasswordProtectionNotExposedBySdk'),
        digitalSignature: unknown('DigitalSignatureNotExposedBySdk'),
      },
      formControls: publicFormInventory(readFormInventory(document)),
      editing: {
        documentEditable: unknown('RequiresNativeValidationForEachTargetAndOperation'),
        textSourceProtection: textSourceProtection(document, diagnostics),
      },
      inspection: {
        scope: 'native-open-and-metadata',
        performance: 'not-measured',
        documentModelCollected: false,
        contentTotals: unknown('ParagraphTableImageAndPageTotalsNotCollected'),
      },
      diagnostics,
    };
  } catch (error) {
    failed = true;
    failure = error;
  }
  try {
    if (typeof document?.close === 'function') await document.close();
  } catch (error) {
    if (failed)
      throw new AggregateError([failure, error], 'DocumentInspectionAndCloseFailed', {
        cause: failure,
      });
    throw new Error('DocumentInspectionCloseFailed', { cause: error });
  }
  if (failed) throw failure;
  return result;
}
