import { createDrawingObservationQuery } from '../../../web/preview/drawing-observation.mjs';
import type { HeadlessEditor } from '@hwpjs/core';
import { pictureMillimeters } from './object-properties-input.ts';

type State = ReturnType<HeadlessEditor['getEditorState']>;
export type DrawingPropertiesToken = State['token'];
export type DrawingPropertiesEditor = Pick<
  HeadlessEditor,
  'getEditorState' | 'registerStateListener'
>;
export interface DrawingPropertiesTarget {
  readonly section: number;
  readonly drawingNode: number;
  /** Optional caller fence. Target-only opens always inspect the current observation. */
  readonly token?: DrawingPropertiesToken;
}
export interface DrawingPropertiesCapture {
  readonly target: Readonly<{ section: number; drawingNode: number }>;
  readonly token: DrawingPropertiesToken;
  readonly fields: readonly Readonly<{ label: string; value: string }>[];
  readonly text: string | null;
  readonly textTruncated: boolean;
}
export interface DrawingPropertiesPort {
  capture(target: DrawingPropertiesTarget): {
    capture: DrawingPropertiesCapture | null;
    reason: string | null;
  };
  current(capture: DrawingPropertiesCapture): boolean;
  subscribe(listener: () => void): () => void;
}
const uint = (n: unknown): n is number =>
  Number.isSafeInteger(n) && (n as number) >= 0 && (n as number) <= 0xffffffff && !Object.is(n, -0);
const object = (value: unknown): Record<string, any> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null;
const keys = ['editorId', 'documentId', 'generation', 'operationRevision', 'viewRevision'] as const;
function tokenFor(state: State): DrawingPropertiesToken | null {
  const token = state.token;
  if (
    !token ||
    typeof token.editorId !== 'string' ||
    !token.editorId ||
    typeof token.documentId !== 'string' ||
    !token.documentId ||
    ![token.generation, token.operationRevision, token.viewRevision].every(
      (n) => Number.isSafeInteger(n) && n >= 0,
    ) ||
    keys.some((key) => token[key] !== state[key])
  )
    return null;
  return Object.freeze({
    editorId: token.editorId,
    documentId: token.documentId,
    generation: token.generation,
    operationRevision: token.operationRevision,
    viewRevision: token.viewRevision,
  });
}
const sameToken = (a: DrawingPropertiesToken, b: DrawingPropertiesToken) =>
  keys.every((key) => a[key] === b[key]);

/** Exact current Native content.drawings owner only; no renderer rectangles or raw runtime queries. */
export function createDrawingPropertiesPort(
  editor: DrawingPropertiesEditor,
): DrawingPropertiesPort {
  const issued = new WeakMap<
    DrawingPropertiesCapture,
    { state: State; version: number; token: DrawingPropertiesToken }
  >();
  function current(capture: DrawingPropertiesCapture) {
    const owned = issued.get(capture);
    if (!owned) return false;
    try {
      const state = editor.getEditorState(),
        token = tokenFor(state);
      return (
        state === owned.state &&
        state.status === 'ready' &&
        !state.historyRecoveryRequired &&
        state.stateVersion === owned.version &&
        token !== null &&
        sameToken(token, owned.token) &&
        editor.getEditorState() === state
      );
    } catch {
      return false;
    }
  }
  return {
    capture(target) {
      const refuse = (reason: string) => ({ capture: null, reason });
      const section = target?.section,
        drawingNode = target?.drawingNode,
        expected = target?.token;
      if (!uint(section) || !uint(drawingNode))
        return refuse('선택한 개체를 확인할 수 없습니다. 다시 선택해 주세요.');
      const state = editor.getEditorState();
      if (state.status !== 'ready' || state.historyRecoveryRequired)
        return refuse('문서를 준비 중입니다. 잠시 후 다시 열어 주세요.');
      const token = tokenFor(state),
        version = state.stateVersion;
      if (
        !token ||
        !Number.isSafeInteger(version) ||
        version < 0 ||
        (expected && !sameToken(expected, token))
      )
        return refuse('문서가 바뀌었습니다. 개체를 다시 선택해 주세요.');
      const content = object(state.content);
      if (
        !content ||
        !['hwp5', 'hwpx'].includes(content.format) ||
        content.limited === true ||
        content.window ||
        !Array.isArray(content.drawings)
      )
        return refuse('현재 문서에서 이 개체의 정보를 불러올 수 없습니다.');
      const observed = createDrawingObservationQuery(content).get(section, drawingNode);
      if (!observed) return refuse('선택한 개체를 확인할 수 없습니다. 다시 선택해 주세요.');
      const fields: { label: string; value: string }[] = [];
      const geometry = object(observed.geometry);
      // Native absolute size bases are width=4 and height=2. Other bases cannot
      // establish a physical size from these source values alone.
      for (const [key, basis, absolute, label] of [
        ['width', 'width_relative', 4, '너비'],
        ['height', 'height_relative', 2, '높이'],
      ] as const) {
        const value = geometry?.[key];
        if (geometry?.[basis] === absolute && uint(value) && value > 0)
          fields.push({ label, value: `${pictureMillimeters(value)} mm` });
      }
      if (typeof geometry?.treat_as_character === 'boolean')
        fields.push({
          label: '글자처럼 취급',
          value: geometry.treat_as_character ? '예' : '아니오',
        });
      // Alignment/wrap code-to-label mappings are not owned by this UI. Do not
      // surface unproven enum translations or diagnostic numbers to the user.
      const textObservation = observed.readText();
      if (textObservation.state !== 'available')
        return refuse('이 개체의 내용을 불러올 수 없습니다.');
      const paragraphs = textObservation.paragraphs;
      let text: string | null = null,
        textTruncated = false;
      if (paragraphs.length) {
        // Shared query has validated exact format ownership and Native paragraph order.
        text = '';
        for (const [index, p] of paragraphs.entries()) {
          const separator = index ? '\n' : '';
          const available = 16000 - text.length;
          const part = separator + p.text;
          text += part.slice(0, available);
          if (part.length > available) {
            textTruncated = true;
            break;
          }
        }
      }
      if (!fields.length && text === null)
        return refuse('이 개체에서 확인할 수 있는 정보가 없습니다.');
      const capture: DrawingPropertiesCapture = Object.freeze({
        target: Object.freeze({ section, drawingNode }),
        token,
        fields: Object.freeze(fields.map((field) => Object.freeze(field))),
        text,
        textTruncated,
      });
      issued.set(capture, { state, version, token });
      if (!current(capture)) return refuse('문서가 바뀌었습니다. 개체를 다시 선택해 주세요.');
      return { capture, reason: null };
    },
    current,
    subscribe: (listener) => editor.registerStateListener(() => listener()),
  };
}
