import { createHash } from 'node:crypto';
import { detectDocumentFormat } from '../../../js/document-format.mjs';
import { createExperimentalHwp5Editor } from '../../../js/hwp5-editor.mjs';
import { createHwpxEditor } from '../../../js/hwpx-editor.mjs';
import { findUniqueLiteral, validateLiteral, MAX_TEXT_UNITS } from './literal-match.mjs';

const MAX_INPUT_BYTES = 64 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 128 * 1024 * 1024;

function byteInput(value, name) {
  if (!(value instanceof Uint8Array)) throw new TypeError(`Expected${name}Uint8Array`);
  if (!value.byteLength || value.byteLength > MAX_INPUT_BYTES)
    throw new RangeError(`${name}LimitExceeded`);
  return Uint8Array.from(value); // Buffer.slice() would borrow caller-owned storage.
}

function captureTarget(target) {
  if (!target || typeof target !== 'object' || Array.isArray(target))
    throw new TypeError('InvalidTarget');
  const { section, paragraph } = target;
  if (
    !Number.isInteger(section) ||
    section < 0 ||
    section > 0xffffffff ||
    !Number.isInteger(paragraph) ||
    paragraph < 0 ||
    paragraph > 0xffffffff
  )
    throw new RangeError('InvalidTarget');
  return { section, paragraph };
}

function position(target, sectionCount, format) {
  const captured = captureTarget(target);
  if (captured.section >= sectionCount || (format === 'hwpx' && captured.paragraph === 0))
    throw new RangeError('InvalidTarget');
  return captured;
}

/** No filesystem, DOM, Canvas, normalization or permissive source-open policy.
 * The caller owns the exposed SDK lifetime and must close in finally.
 * expectedSha256 checks document bytes, not WASM. Host edit SHA is mandatory
 * at the args/main boundary; this lower-level check is optional.
 */
export async function openDocument({ bytes, wasm, expectedSha256 } = {}) {
  const input = byteInput(bytes, 'Document');
  const sourceSha256 = createHash('sha256').update(input).digest('hex');
  if (expectedSha256 !== undefined) {
    if (typeof expectedSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(expectedSha256))
      throw new TypeError('InvalidExpectedSha256');
    if (sourceSha256 !== expectedSha256) throw new Error('SourceSha256Mismatch');
  }
  const format = detectDocumentFormat(input);
  const binary = byteInput(wasm, 'Wasm');
  let sdk;
  try {
    let sectionCount;
    if (format === 'hwp5') {
      sdk = await createExperimentalHwp5Editor(binary, input);
      sectionCount = sdk.sectionCount();
    } else {
      sdk = await createHwpxEditor(binary);
      sectionCount = sdk.open(input).sectionCount;
    }
    if (!Number.isInteger(sectionCount) || sectionCount < 1 || sectionCount > 4096)
      throw new RangeError('SectionLimitExceeded');
    let closed = false;
    const ready = () => {
      if (closed) throw new Error('DocumentClosed');
    };
    return {
      format,
      sourceSha256,
      sectionCount,
      sdk,
      replaceText({ target, oldText, newText }) {
        ready();
        validateLiteral(oldText);
        validateLiteral(newText, { empty: true });
        const { section, paragraph } = position(target, sectionCount, format);
        let text;
        if (format === 'hwp5') {
          if (paragraph >= sdk.paragraphCount(section)) throw new RangeError('InvalidTarget');
          sdk.validateTextSourcePolicy(section);
          text = sdk.text(section, paragraph);
        } else {
          // HWPX ordinals are document-wide: never infer 1..section row count.
          const rows = sdk.paragraphTextSnapshot(section);
          let units = 0;
          let present = false;
          for (const row of rows) {
            units += row.text.length;
            if (units > MAX_TEXT_UNITS) throw new RangeError('DecodedTextLimitExceeded');
            if (row.paragraph === paragraph) present = true;
          }
          if (!present) throw new RangeError('InvalidTarget');
          if (!sdk.canEdit(section, paragraph)) throw new Error('UnsupportedParagraphEdit');
          text = sdk.anchorText(section, paragraph);
        }
        const startUnit = findUniqueLiteral(text, oldText);
        const endUnit = startUnit + oldText.length;
        const changed = oldText !== newText;
        // Native still validates protected/control-token boundaries for a no-op.
        if (format === 'hwp5')
          sdk.splice({ section, paragraph, startUnit, endUnit, text: newText });
        else sdk.splice(section, paragraph, startUnit, oldText.length, newText);
        return { changed, section, paragraph, startUnit, endUnit };
      },
      save({ allowStaleLayout = false } = {}) {
        ready();
        if (typeof allowStaleLayout !== 'boolean') throw new TypeError('InvalidAllowStaleLayout');
        const saved = format === 'hwp5' ? sdk.save({ allowStaleLayout }) : sdk.save();
        const output = format === 'hwp5' ? saved.bytes : saved;
        if (
          !(output instanceof Uint8Array) ||
          !output.byteLength ||
          output.byteLength > MAX_OUTPUT_BYTES
        )
          throw new RangeError('OutputLimitExceeded');
        return format === 'hwp5' ? saved : output;
      },
      close() {
        if (!closed) {
          closed = true;
          sdk.close();
        }
      },
    };
  } catch (error) {
    sdk?.close();
    throw error;
  }
}

export async function read({ bytes, wasm }) {
  const document = await openDocument({ bytes, wasm });
  try {
    const { readDocumentModel } = await import('./document-model.mjs');
    const model = await readDocumentModel({
      format: document.format,
      sourceSha256: document.sourceSha256,
      sectionCount: document.sectionCount,
      sdk: document.sdk,
    });
    return { format: document.format, model };
  } finally {
    document.close();
  }
}

export async function edit({
  bytes,
  wasm,
  target,
  replace,
  with: replacement,
  allowStaleLayout = false,
}) {
  // Input bytes and WASM are copied by openDocument before it awaits compilation;
  // capture the caller-owned address at the same request boundary.
  const capturedTarget = captureTarget(target);
  const document = await openDocument({ bytes, wasm });
  try {
    const { changed } = document.replaceText({
      target: capturedTarget,
      oldText: replace,
      newText: replacement,
    });
    const saved = document.save({ allowStaleLayout });
    return {
      format: document.format,
      bytes: document.format === 'hwp5' ? saved.bytes : saved,
      changed,
      layoutRequiresReflow: document.format === 'hwp5' ? saved.layoutRequiresReflow : false,
    };
  } finally {
    document.close();
  }
}
