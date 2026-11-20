import { nativeDocumentParagraph } from '../../../js/document-text-coordinates.mjs';
import type { DocumentTextCaretPoint, EditorState } from '@hwpjs/core';
type Point = {
  section: number;
  paragraph?: number;
  createdCell?: { identity: string; row: number; column: number };
  unit: number;
};
export type DocumentTextCaretCapture = Readonly<{
  state: EditorState;
  anchor: DocumentTextCaretPoint;
  focus: DocumentTextCaretPoint;
  current(): boolean;
}>;
export type DocumentTextCaretRead = Readonly<
  | { status: 'none' }
  | { status: 'unavailable'; reason: string }
  | { status: 'captured'; capture: DocumentTextCaretCapture }
>;
const uint = (n: unknown) => Number.isSafeInteger(n) && Number(n) >= 0 && Number(n) <= 0xffffffff;
const same = (a: Point, b: Point) =>
  a.section === b.section &&
  a.paragraph === b.paragraph &&
  a.unit === b.unit &&
  (a.createdCell
    ? !!b.createdCell &&
      a.createdCell.identity === b.createdCell.identity &&
      a.createdCell.row === b.createdCell.row &&
      a.createdCell.column === b.createdCell.column
    : !b.createdCell);
/** Capture observed geometry and text only. No edit capability or synthetic paragraph is issued. */
export function captureDocumentTextCaret(port: {
  state(): EditorState;
  ready(state: EditorState): boolean;
  selection(): { anchor: Point; focus: Point } | null;
  selectionFence(): () => boolean;
  paragraph(point: Point): { text: string; clipped?: boolean } | undefined;
  geometry(anchor: Point, focus: Point): boolean;
}): DocumentTextCaretRead {
  const state = port.state();
  if (!port.ready(state))
    return { status: 'unavailable', reason: 'DocumentSearchCaretUnavailable' };
  const fence = port.selectionFence();
  const observed = port.selection();
  if (!observed) return { status: 'none' };
  const ownPoint = (point: Point): Point =>
    Object.freeze({
      ...point,
      ...(point.createdCell ? { createdCell: Object.freeze({ ...point.createdCell }) } : {}),
    });
  const points = Object.freeze({
    anchor: ownPoint(observed.anchor),
    focus: ownPoint(observed.focus),
  });
  const copy = (point: Point): DocumentTextCaretPoint | null => {
    if (!uint(point.section) || !uint(point.unit)) return null;
    const row = port.paragraph(point);
    if (!row || row.clipped || typeof row.text !== 'string' || point.unit > row.text.length)
      return null;
    const base = { section: point.section, unit: point.unit, beforeText: row.text };
    if (point.createdCell) {
      const c = point.createdCell;
      if (
        point.paragraph !== undefined ||
        typeof c.identity !== 'string' ||
        !/^[1-9][0-9]{0,19}$/.test(c.identity) ||
        (c.identity.length === 20 && c.identity > '18446744073709551615') ||
        !uint(c.row) ||
        !uint(c.column)
      )
        return null;
      return Object.freeze({
        ...base,
        kind: 'created-cell',
        identity: c.identity,
        row: c.row,
        column: c.column,
      });
    }
    const paragraph = nativeDocumentParagraph(
      (state.content as { format?: unknown })?.format,
      point.paragraph,
    );
    return paragraph === undefined
      ? null
      : Object.freeze({ ...base, kind: 'paragraph', paragraph });
  };
  const anchor = copy(points.anchor),
    focus = copy(points.focus);
  if (
    !fence() ||
    !anchor ||
    !focus ||
    !port.geometry(points.anchor, points.focus) ||
    !port.ready(state) ||
    port.state() !== state
  )
    return { status: 'unavailable', reason: 'DocumentSearchCaretUnavailable' };
  let invalid = false;
  const current = () => {
    if (invalid) return false;
    const now = port.selection();
    if (
      fence() &&
      port.state() === state &&
      port.ready(state) &&
      now &&
      same(points.anchor, now.anchor) &&
      same(points.focus, now.focus) &&
      port.geometry(now.anchor, now.focus)
    )
      return true;
    invalid = true;
    return false;
  };
  if (!current()) return { status: 'unavailable', reason: 'DocumentSearchCaretUnavailable' };
  return Object.freeze({
    status: 'captured',
    capture: Object.freeze({ state, anchor, focus, current }),
  });
}
