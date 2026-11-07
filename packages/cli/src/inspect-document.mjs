import { openDocument as defaultOpenDocument } from './engine.mjs';
import { detectDocumentFormat } from '../../../js/document-format.mjs';
import { validateHwp5TextSourceProtection } from '../../../js/hwp5-text-source-protection.mjs';
import { diagnostic, LIMITS, uint } from './model/common.mjs';

const MAX_INPUT_BYTES = 64 * 1024 * 1024;
const observed = (value, source) => ({ status: 'observed', value, source });
const unknown = (reason) => ({ status: 'unknown', value: null, reason });
const unsupported = (reason) => ({ status: 'unsupported', value: null, reason });

function failedObservation(diagnostics, method, error, source) {
  diagnostics.push(
    diagnostic('ObservationUnavailable', `${method}: ${error?.message ?? 'UnknownError'}`, source),
  );
  return unknown('NativeObservationFailed');
}

function fileVersion(document, diagnostics) {
  if (document.format !== 'hwp5' || typeof document.sdk.fileVersion !== 'function')
    return unsupported('FileVersionNotExposedBySdk');
  try {
    const value = document.sdk.fileVersion();
    if (!uint(value) || value === 0) throw Error('InvalidFileVersionObservation');
    return observed(value, 'sdk.fileVersion');
  } catch (error) {
    return failedObservation(diagnostics, 'fileVersion', error);
  }
}

function textSourceProtection(document, diagnostics) {
  const sdk = document.sdk;
  if (document.format !== 'hwp5' || typeof sdk.textSourceProtection !== 'function')
    return unsupported('TextSourceProtectionNotExposedBySdk');
  try {
    if (typeof sdk.supportsTextSourceProtection === 'function') {
      const supported = sdk.supportsTextSourceProtection();
      if (supported === false) return unsupported('TextSourceProtectionAbiUnavailable');
      if (supported !== true) throw Error('InvalidProtectionCapabilityObservation');
    }
  } catch (error) {
    return failedObservation(diagnostics, 'supportsTextSourceProtection', error);
  }
  if (typeof sdk.paragraphCount !== 'function')
    return unsupported('ProtectionParagraphCountNotExposedBySdk');
  const sections = [];
  let paragraphs = 0;
  for (let section = 0; section < document.sectionCount; section++) {
    try {
      const count = sdk.paragraphCount(section);
      if (!uint(count) || count > 100000) throw Error('InvalidParagraphCountObservation');
      paragraphs += count;
      if (paragraphs > LIMITS.maxBlocks) {
        diagnostics.push(
          diagnostic('ObservationLimitExceeded', 'textSourceProtection', { section }),
        );
        return unknown('ProtectionObservationLimitExceeded');
      }
      const value = validateHwp5TextSourceProtection(sdk.textSourceProtection(section), count);
      sections.push({
        section,
        paragraphCount: count,
        protectedParagraphCount: value.protected_paragraphs.reduce(
          (total, bit) => total + Number(bit),
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
  { bytes, wasm, expectedSha256 } = {},
  { openDocument = defaultOpenDocument } = {},
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
    const diagnostics = [];
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
