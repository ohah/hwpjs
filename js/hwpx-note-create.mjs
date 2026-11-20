import { inlineInsertRecord } from './hwpx-inline-object-record.mjs';
import {
  checkedInlineObjectTarget,
  requireInlineObjectPlacement,
} from './hwpx-inline-object-placement.mjs';
import { applyNativeEdit } from './native-edit-outcome.mjs';
const encoder = new TextEncoder();
function uint(value, min = 0, max = 0xffffffff) {
  if (!Number.isSafeInteger(value) || value < min || value > max || Object.is(value, -0))
    throw Error('InvalidNoteCreateInteger');
  return value;
}
function text(value, max, empty = true) {
  if (
    typeof value !== 'string' ||
    (!empty && !value.length) ||
    !value.isWellFormed() ||
    // eslint-disable-next-line no-control-regex -- Reject forbidden XML controls before Native allocation.
    /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/u.test(value) ||
    encoder.encode(value).length > max
  )
    throw Error('InvalidNoteCreateText');
  return value;
}
function record(input, required, optional = []) {
  if (!input || typeof input !== 'object') throw Error('InvalidNoteCreateRequest');
  const d = Object.getOwnPropertyDescriptors(input);
  const keys = required.concat(optional.filter((k) => Object.hasOwn(d, k)));
  return inlineInsertRecord(input, keys);
}
function format(input) {
  const p = inlineInsertRecord(input, [
    'number_type',
    'user_char',
    'prefix_char',
    'suffix_char',
    'superscript',
  ]);
  if (typeof p.superscript !== 'boolean') throw Error('InvalidNoteCreateFormat');
  return {
    number_type: text(p.number_type, 128, false),
    user_char: text(p.user_char, 4096),
    prefix_char: text(p.prefix_char, 4096),
    suffix_char: text(p.suffix_char, 4096),
    superscript: p.superscript,
  };
}
function shape(input) {
  const p = inlineInsertRecord(input, [
    'format',
    'line_length',
    'line_type',
    'line_width',
    'line_color',
    'between_notes',
    'below_line',
    'above_line',
    'start',
    'place',
    'beneath_text',
  ]);
  if (typeof p.beneath_text !== 'boolean') throw Error('InvalidNoteCreatePolicy');
  return {
    format: format(p.format),
    line_length: uint(p.line_length, -0x80000000, 0x7fffffff),
    line_type: text(p.line_type, 128, false),
    line_width: text(p.line_width, 128, false),
    line_color: text(p.line_color, 128, false),
    between_notes: uint(p.between_notes),
    below_line: uint(p.below_line),
    above_line: uint(p.above_line),
    start: uint(p.start, 1, 0x7fffffff),
    place: text(p.place, 128, false),
    beneath_text: p.beneath_text,
  };
}
function policies(input) {
  if (!Array.isArray(input) || input.length > 1024) throw Error('InvalidNoteCreatePolicy');
  const d = Object.getOwnPropertyDescriptors(input);
  if (Reflect.ownKeys(d).length !== input.length + 1) throw Error('InvalidNoteCreatePolicy');
  const seen = new Set();
  return Array.from({ length: input.length }, (_, i) => {
    if (!d[i] || !Object.hasOwn(d[i], 'value')) throw Error('InvalidNoteCreatePolicy');
    const p = inlineInsertRecord(d[i].value, ['section', 'shape']);
    const section = uint(p.section);
    if (seen.has(section)) throw Error('InvalidNoteCreatePolicy');
    seen.add(section);
    return { section, shape: shape(p.shape) };
  });
}
export function checkedNoteInsertOptions(input) {
  const p = record(input, ['resources', 'format', 'body'], ['initial_policies']);
  const resources = inlineInsertRecord(p.resources, ['paragraph', 'character', 'style']);
  return {
    resources: {
      paragraph: uint(resources.paragraph),
      character: uint(resources.character),
      style: uint(resources.style),
    },
    format: format(p.format),
    body: text(p.body, 1024 * 1024),
    initial_policies: policies(p.initial_policies === undefined ? [] : p.initial_policies),
  };
}
export function checkedNoteInsertRequest(input) {
  const p = record(input, ['target', 'kind', 'resources', 'format', 'body'], ['initial_policies']);
  if (!['foot', 'end'].includes(p.kind)) throw Error('InvalidNoteCreateKind');
  const target = checkedInlineObjectTarget(p.target);
  if (!target.owner) throw Error('InvalidNoteCreateOwner');
  return {
    target,
    kind: p.kind,
    ...checkedNoteInsertOptions({
      resources: p.resources,
      format: p.format,
      body: p.body,
      initial_policies: p.initial_policies === undefined ? [] : p.initial_policies,
    }),
  };
}
export function checkedNoteCaret(input) {
  const p = inlineInsertRecord(input, ['schemaVersion', 'caret']);
  const c = inlineInsertRecord(p.caret, ['section', 'paragraph', 'unit', 'coordinateSpace']);
  if (p.schemaVersion !== 1 || c.coordinateSpace !== 'plain') throw Error('InvalidNoteCreateCaret');
  return {
    section: uint(c.section),
    paragraph: uint(c.paragraph, 1),
    unit: uint(c.unit),
    coordinateSpace: 'plain',
  };
}
export function createHwpxNoteCreateApi({ wasm, memory, check }) {
  function available() {
    check();
    try {
      return (
        typeof wasm.hwpx_edit_insert_note === 'function' &&
        typeof wasm.hwpx_edit_note_create_version === 'function' &&
        wasm.hwpx_edit_note_create_version() === 1
      );
    } catch {
      return false;
    }
  }
  function insertNote(input) {
    check();
    const request = checkedNoteInsertRequest(input);
    if (!available()) throw Error('NoteCreationUnavailable');
    requireInlineObjectPlacement(wasm, request);
    const bytes = encoder.encode(JSON.stringify(request));
    if (bytes.length > 2 * 1024 * 1024) throw Error('LimitExceeded');
    const result = applyNativeEdit(
      memory,
      bytes,
      (ptr, size) => wasm.hwpx_edit_insert_note(ptr, size),
      'InvalidNoteCreateResult',
    );
    let completed = result;
    try {
      if (result.application === 'applied') {
        const parsed = JSON.parse(
          new TextDecoder('utf-8', { fatal: true }).decode(
            memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()),
          ),
        );
        completed = { ...result, noteCaret: checkedNoteCaret(parsed) };
      }
    } catch (error) {
      completed = { ...result, error: error.message, refreshRequired: true };
    } finally {
      try {
        wasm.hwpx_edit_output_free();
      } catch (error) {
        completed.cleanupError = error.message;
        completed.refreshRequired = true;
      }
    }
    return completed;
  }
  const insertKind = (kind, input) => {
    const p = record(input, ['target', 'resources', 'format', 'body'], ['initial_policies']);
    return insertNote({ ...p, kind });
  };
  return {
    supportsNoteCreationAbi: available,
    insertNote,
    insertFootnote: (input) => insertKind('foot', input),
    insertEndnote: (input) => insertKind('end', input),
  };
}
