import { displayDocumentParagraph } from '../../../js/document-text-coordinates.mjs';
import type { DocumentTextSelectionObservation, EditorState } from '@hwpjs/core';
import {
  isCurrentDocumentTextSelectionObservation,
  readNativeReadSourceEvidence,
} from '@hwpjs/core/_internal/native-read-source';
import type { DocumentSearchRange } from './document-text-selection.ts';
function dataRange(value: unknown): value is DocumentSearchRange {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const names = new Set([
    'section',
    'paragraph',
    'createdCell',
    'startUnit',
    'endUnit',
    'expectedText',
  ]);
  for (const key of Reflect.ownKeys(value)) {
    const d = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== 'string' || !names.has(key) || !d || !('value' in d)) return false;
  }
  const cell = Object.getOwnPropertyDescriptor(value, 'createdCell')?.value;
  if (cell !== undefined) {
    if (!cell || typeof cell !== 'object' || Array.isArray(cell)) return false;
    for (const key of Reflect.ownKeys(cell)) {
      const d = Object.getOwnPropertyDescriptor(cell, key);
      if (
        typeof key !== 'string' ||
        !['identity', 'row', 'column'].includes(key) ||
        !d ||
        !('value' in d)
      )
        return false;
    }
  }
  return true;
}
const sameRange = (a: DocumentSearchRange, b: DocumentSearchRange) =>
  a.section === b.section &&
  a.paragraph === b.paragraph &&
  a.startUnit === b.startUnit &&
  a.endUnit === b.endUnit &&
  a.expectedText === b.expectedText &&
  (a.createdCell
    ? !!b.createdCell &&
      a.createdCell.identity === b.createdCell.identity &&
      a.createdCell.row === b.createdCell.row &&
      a.createdCell.column === b.createdCell.column
    : !b.createdCell);
/** Private, read-selection-only lease. It never changes editable/History or issues geometry. */
export function createDocumentTextReadPermit(port: {
  state(): EditorState;
  active(): boolean;
  ready(state: EditorState): boolean;
  row(range: DocumentSearchRange): { text: string; clipped?: boolean } | undefined;
  geometry(range: DocumentSearchRange): boolean;
}) {
  const issued = new WeakMap<
    object,
    {
      observation: DocumentTextSelectionObservation;
      range: DocumentSearchRange;
      current: () => boolean;
    }
  >();
  let closed = false,
    validating = false;
  const valid = (record: {
    observation: DocumentTextSelectionObservation;
    range: DocumentSearchRange;
    current: () => boolean;
  }) => {
    if (closed || validating) return false;
    validating = true;
    try {
      if (!port.active() || !record.current()) return false;
      const state = port.state(),
        value = record.observation.native,
        stamp = value.readBinding,
        source = readNativeReadSourceEvidence(state);
      if (
        !port.ready(state) ||
        !isCurrentDocumentTextSelectionObservation(record.observation, state) ||
        !stamp ||
        !source ||
        source.session !== value.binding.session ||
        source.format !== value.format ||
        source.epoch !== stamp.epoch ||
        source.serial !== stamp.serial
      )
        return false;
      const row = port.row(record.range);
      if (
        !row ||
        row.clipped ||
        row.text !== record.range.expectedText ||
        !port.geometry(record.range) ||
        !port.ready(state) ||
        !port.active() ||
        !record.current()
      )
        return false;
      const after = port.state();
      return (
        after === state &&
        readNativeReadSourceEvidence(after) === source &&
        isCurrentDocumentTextSelectionObservation(record.observation, after)
      );
    } finally {
      validating = false;
    }
  };
  return {
    issue(observation: DocumentTextSelectionObservation, current: () => boolean): object | null {
      if (!isCurrentDocumentTextSelectionObservation(observation, port.state())) return null;
      const target = observation.native.target;
      if (!target) return null;
      const paragraph =
        target.kind === 'paragraph'
          ? displayDocumentParagraph(observation.native.format, target.paragraph)
          : undefined;
      if (target.kind === 'paragraph' && paragraph === undefined) return null;
      const range: DocumentSearchRange = Object.freeze({
        section: target.section,
        startUnit: target.startUnit,
        endUnit: target.endUnit,
        expectedText: observation.native.beforeText,
        ...(target.kind === 'paragraph'
          ? { paragraph }
          : {
              createdCell: Object.freeze({
                identity: target.identity,
                row: target.row,
                column: target.column,
              }),
            }),
      });
      const record = { observation, range, current };
      if (!valid(record)) return null;
      const token = Object.freeze({});
      issued.set(token, record);
      return token;
    },
    current(token: unknown, range?: DocumentSearchRange): boolean {
      if (!token || typeof token !== 'object') return false;
      const record = issued.get(token);
      if (!record || (range && (!dataRange(range) || !sameRange(record.range, range))))
        return false;
      return valid(record);
    },
    dispose() {
      closed = true;
    },
  };
}
