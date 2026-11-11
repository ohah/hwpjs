import { readFormInventory, type FormInventory } from './document-forms.ts';
import { detectDocumentFormat } from '../../../js/document-format.mjs';
import { createExperimentalHwp5Editor } from '../../../js/hwp5-editor.mjs';
import { createHwpxEditor } from '../../../js/hwpx-editor.mjs';
import { findUniqueLiteral, validateLiteral, MAX_TEXT_UNITS } from './literal-match.ts';
import { createWasmModuleCache } from './wasm-module.ts';
import type { DocumentView } from './types/document-view.ts';
import type {
  DocumentFormat,
  NativeEditor,
  OpenedDocument,
  TextTarget,
  ReplaceTextInput,
  ReplaceTextResult,
  SaveOptions,
  Hwp5SaveResult,
} from './types/native-document.ts';

const MAX_INPUT_BYTES = 64 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 128 * 1024 * 1024;
const wasmModules = createWasmModuleCache();
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
function byteInput(value: unknown, name: string): Uint8Array<ArrayBuffer> {
  if (!(value instanceof Uint8Array)) throw new TypeError(`Expected${name}Uint8Array`);
  if (!value.byteLength || value.byteLength > MAX_INPUT_BYTES)
    throw new RangeError(`${name}LimitExceeded`);
  return Uint8Array.from(value);
}
function captureTarget(target: unknown): TextTarget {
  if (!record(target)) throw new TypeError('InvalidTarget');
  const { section, paragraph } = target;
  if (
    typeof section !== 'number' ||
    !Number.isInteger(section) ||
    section < 0 ||
    section > 0xffffffff ||
    typeof paragraph !== 'number' ||
    !Number.isInteger(paragraph) ||
    paragraph < 0 ||
    paragraph > 0xffffffff
  )
    throw new RangeError('InvalidTarget');
  return { section, paragraph };
}
function position(target: unknown, sectionCount: number, format: DocumentFormat): TextTarget {
  const captured = captureTarget(target);
  if (captured.section >= sectionCount || (format === 'hwpx' && captured.paragraph === 0))
    throw new RangeError('InvalidTarget');
  return captured;
}
function outputBytes(value: unknown): Uint8Array {
  if (!(value instanceof Uint8Array) || !value.byteLength || value.byteLength > MAX_OUTPUT_BYTES)
    throw new RangeError('OutputLimitExceeded');
  return value;
}

// 입력과 WASM을 해시 대기 전에 소유합니다. 원문 보호와 편집 좌표의 최종 권위는 Native입니다.
export async function openDocument(options: unknown = {}): Promise<OpenedDocument> {
  if (!record(options)) throw new TypeError('InvalidDocumentOpenOptions');
  const { bytes, wasm, expectedSha256 } = options;
  const input = byteInput(bytes, 'Document');
  if (
    expectedSha256 !== undefined &&
    (typeof expectedSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(expectedSha256))
  )
    throw new TypeError('InvalidExpectedSha256');
  const binary = byteInput(wasm, 'Wasm');
  if (!globalThis.crypto?.subtle) throw new Error('WebCryptoUnavailable');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', input);
  const sourceSha256 = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  if (expectedSha256 !== undefined && sourceSha256 !== expectedSha256)
    throw new Error('SourceSha256Mismatch');
  const detected: unknown = detectDocumentFormat(input);
  if (detected !== 'hwp5' && detected !== 'hwpx') throw new TypeError('InvalidDocumentFormat');
  let native: NativeEditor | undefined;
  try {
    const module = await wasmModules.compileOwned(binary);
    let sectionCount: number;
    if (detected === 'hwp5') {
      const sdk = await createExperimentalHwp5Editor(module, input);
      native = { format: 'hwp5', sdk };
      sectionCount = sdk.sectionCount();
    } else {
      const sdk = await createHwpxEditor(module);
      native = { format: 'hwpx', sdk };
      sectionCount = sdk.open(input).sectionCount;
    }
    if (!Number.isInteger(sectionCount) || sectionCount < 1 || sectionCount > 4096)
      throw new RangeError('SectionLimitExceeded');
    const state = native;
    let closed = false;
    const ready = (): void => {
      if (closed) throw new Error('DocumentClosed');
    };
    const replaceText = ({ target, oldText, newText }: ReplaceTextInput): ReplaceTextResult => {
      ready();
      const search = validateLiteral(oldText),
        replacement = validateLiteral(newText, { empty: true });
      const { section, paragraph } = position(target, sectionCount, state.format);
      let text: unknown;
      if (state.format === 'hwp5') {
        if (paragraph >= state.sdk.paragraphCount(section)) throw new RangeError('InvalidTarget');
        state.sdk.validateTextSourcePolicy(section);
        text = state.sdk.text(section, paragraph);
      } else {
        const rows = state.sdk.paragraphTextSnapshot(section);
        let units = 0,
          present = false;
        for (const row of rows) {
          units += row.text.length;
          if (units > MAX_TEXT_UNITS) throw new RangeError('DecodedTextLimitExceeded');
          if (row.paragraph === paragraph) present = true;
        }
        if (!present) throw new RangeError('InvalidTarget');
        if (!state.sdk.canEdit(section, paragraph)) throw new Error('UnsupportedParagraphEdit');
        text = state.sdk.anchorText(section, paragraph);
      }
      const startUnit = findUniqueLiteral(text, search),
        endUnit = startUnit + search.length;
      if (state.format === 'hwp5')
        state.sdk.splice({ section, paragraph, startUnit, endUnit, text: replacement });
      else state.sdk.splice(section, paragraph, startUnit, search.length, replacement);
      return { changed: search !== replacement, section, paragraph, startUnit, endUnit };
    };
    const close = (): void => {
      if (!closed) {
        closed = true;
        state.sdk.close();
      }
    };
    const nativeExports = Object.freeze(
      WebAssembly.Module.exports(module)
        .filter((row) => row.kind === 'function')
        .map((row) => row.name),
    );
    const common = { sourceSha256, sectionCount, replaceText, close, nativeExports };
    if (state.format === 'hwp5') {
      const sdk = state.sdk;
      return {
        ...common,
        format: 'hwp5',
        sdk,
        save({ allowStaleLayout = false }: SaveOptions = {}): Hwp5SaveResult {
          ready();
          if (typeof allowStaleLayout !== 'boolean') throw new TypeError('InvalidAllowStaleLayout');
          const saved = sdk.save({ allowStaleLayout });
          return { ...saved, bytes: outputBytes(saved.bytes) };
        },
      };
    }
    const sdk = state.sdk;
    return {
      ...common,
      format: 'hwpx',
      sdk,
      save({ allowStaleLayout = false }: SaveOptions = {}): Uint8Array {
        ready();
        if (typeof allowStaleLayout !== 'boolean') throw new TypeError('InvalidAllowStaleLayout');
        return outputBytes(sdk.save());
      },
    };
  } catch (error) {
    native?.sdk.close();
    throw error;
  }
}

export async function read(
  options: unknown,
): Promise<{ format: DocumentFormat; model: DocumentView; formControls?: FormInventory }> {
  const document = await openDocument(options);
  try {
    const { readDocumentModel } = await import('./document-model.ts');
    const model = await readDocumentModel({
      format: document.format,
      sourceSha256: document.sourceSha256,
      sectionCount: document.sectionCount,
      sdk: document.sdk,
    });
    return {
      format: document.format,
      model,
      ...(record(options) && options.includeFormControls === true
        ? { formControls: readFormInventory(document) }
        : {}),
    };
  } finally {
    document.close();
  }
}

export interface EditResult {
  format: DocumentFormat;
  bytes: Uint8Array;
  changed: boolean;
  layoutRequiresReflow: boolean;
}
export async function edit(options: unknown): Promise<EditResult> {
  if (!record(options)) throw new TypeError('InvalidEditOptions');
  const { bytes, wasm, target, replace, with: replacement, allowStaleLayout = false } = options;
  const capturedTarget = captureTarget(target);
  const document = await openDocument({ bytes, wasm });
  try {
    const { changed } = document.replaceText({
      target: capturedTarget,
      oldText: replace,
      newText: replacement,
    });
    if (typeof allowStaleLayout !== 'boolean') throw new TypeError('InvalidAllowStaleLayout');
    if (document.format === 'hwp5') {
      const saved = document.save({ allowStaleLayout });
      return {
        format: document.format,
        bytes: saved.bytes,
        changed,
        layoutRequiresReflow: saved.layoutRequiresReflow,
      };
    }
    return {
      format: document.format,
      bytes: document.save({ allowStaleLayout }),
      changed,
      layoutRequiresReflow: false,
    };
  } finally {
    document.close();
  }
}
