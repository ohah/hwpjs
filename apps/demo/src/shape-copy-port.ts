import {
  getSelectionFormatting,
  createParagraphSelection,
  APPLY_FORMATTING_PATCH_COMMAND,
} from '@hwpjs/core';
import type { HeadlessEditor, FormattingPatch } from '@hwpjs/core';
// @ts-ignore Same scalar span as the existing Core caret formatting observer.
import { typingSourceSpan } from '../../../web/preview/character-typing-properties.mjs';
import { SHAPE_COPY_FIELDS } from './shape-copy-fields.ts';
type State = ReturnType<HeadlessEditor['getEditorState']>;
type Editor = Pick<
  HeadlessEditor,
  'getEditorState' | 'getFormattingCapabilities' | 'queryFormatting' | 'dispatchCommand'
>;
const immutable = <T>(value: T): T => {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) immutable(child);
    Object.freeze(value);
  }
  return value;
};
const sameDocument = (a: { token: State['token'] }, b: State) =>
  a.token.editorId === b.token.editorId &&
  a.token.documentId === b.token.documentId &&
  a.token.generation === b.token.generation;
export function createShapeCopyPort(editor: Editor) {
  type Capture = Awaited<ReturnType<typeof readSource>>;
  const issued = new WeakSet<object>();
  let copied: {
    token: State['token'];
    entries: readonly { id: string; values: readonly unknown[] }[];
  } | null = null;
  let closed = false,
    pending = false;
  function target(state: State) {
    const f = getSelectionFormatting(state),
      t = f.target;
    if (!t) throw Error('ShapeCopySelectionUnavailable');
    if (f.paragraphAvailableReason) throw Error(f.paragraphAvailableReason);
    const row = (state.content as any).paragraphs.find(
      (r: any) => r.section === t.section && r.paragraph === t.paragraph,
    );
    if (!row || row.tableCell || row.drawingText || row.drawingCaption)
      throw Error('ShapeCopyBodyOnly');
    return { target: t, row };
  }
  function guard(state: State, active: () => boolean) {
    if (closed || !active() || closed) throw Error('ShapeCopyInactive');
    if (editor.getEditorState() !== state) throw Error('StaleShapeCopy');
  }
  function discardForeign() {
    if (copied && !sameDocument(copied, editor.getEditorState())) copied = null;
  }
  async function capability(state: State, active: () => boolean) {
    guard(state, active);
    const cap = await editor.getFormattingCapabilities({ token: state.token });
    guard(state, active);
    if (!cap.atomic) throw Error('ShapeCopyAtomicUnavailable');
    if (
      cap.selectionAdmissionFence?.version !== 1 ||
      cap.selectionAdmissionFence.epoch !== 'stateVersion' ||
      !cap.selectionAdmissionFence.commands.includes('APPLY_FORMATTING_PATCH')
    )
      throw Error('SelectionFenceUnavailable');
    return cap;
  }
  async function readSource(active: () => boolean) {
    const state = editor.getEditorState();
    guard(state, active);
    const { target: t, row } = target(state);
    if (t.startUnit !== t.endUnit) throw Error('ShapeCopySourceCaretRequired');
    const cap = await capability(state, active);
    const values: Record<string, any> = {};
    for (const group of ['character', 'paragraph'] as const) {
      const fields = SHAPE_COPY_FIELDS.filter((d) => d.group === group)
        .flatMap((d) => d.fields)
        .filter((k) => cap.fields[k]?.readable === true);
      if (!fields.length) continue;
      let readTarget = t;
      if (group === 'character') {
        const span = typingSourceSpan(row.text, t.startUnit);
        if (!span) continue;
        // Core issues the read-only scalar target. Never change the actual caret.
        readTarget = createParagraphSelection(state, {
          section: t.section,
          paragraph: t.paragraph,
          startUnit: span.start,
          endUnit: span.end,
        });
      }
      const q = await editor.queryFormatting(readTarget, { fields });
      guard(state, active);
      if (q.binding.session !== cap.binding.session || q.binding.revision !== cap.binding.revision)
        throw Error('StaleFormattingBinding');
      Object.assign(values, q.observations.aggregate);
    }
    const readReason = (field: string): string | null => {
      const policy = cap.fields[field],
        observation = values[field];
      if (policy?.readable !== true || observation?.state !== 'known')
        return '현재 모양을 확인할 수 없습니다.';
      if (policy.enumValues && !policy.enumValues.includes(observation.value))
        return '이 모양은 아직 복사할 수 없습니다.';
      return null;
    };
    const options = SHAPE_COPY_FIELDS.map((d) => ({
      ...d,
      enabled: d.fields.every((k) => readReason(k) === null),
      reason: d.fields.map(readReason).find((reason) => reason !== null) ?? null,
      values: d.fields.map((k) =>
        values[k]?.state === 'known' ? structuredClone(values[k].value) : undefined,
      ),
    }));
    const captured = Object.freeze({ state, options: immutable(options) });
    issued.add(captured);
    return captured;
  }
  return {
    presentation() {
      discardForeign();
      try {
        if (closed || pending) throw Error('ShapeCopyPending');
        if (
          typeof editor.queryFormatting !== 'function' ||
          typeof editor.getFormattingCapabilities !== 'function'
        )
          throw Error('ShapeCopyAtomicUnavailable');
        const { target: t } = target(editor.getEditorState());
        if (t.startUnit !== t.endUnit && !copied)
          return { enabled: false, reason: '먼저 원본 글자 뒤에 커서를 놓고 모양을 복사하세요.' };
        return { enabled: true };
      } catch {
        return {
          enabled: false,
          reason: '편집 가능한 본문 위치를 선택하고 입력을 마친 뒤 사용하세요.',
        };
      }
    },
    readSource,
    remember(capture: Capture, ids: readonly string[], active: () => boolean) {
      guard(capture.state, active);
      if (pending) throw Error('ShapeCopyPending');
      if (!issued.has(capture) || !ids.length || new Set(ids).size !== ids.length)
        throw Error('InvalidShapeCopyFields');
      const entries = ids.map((id) => {
        const d = capture.options.find((d) => d.id === id);
        if (!d?.enabled) throw Error('ShapeCopyFieldUnavailable');
        return immutable({ id, values: structuredClone(d.values) });
      });
      copied = { token: capture.state.token, entries: Object.freeze(entries) };
    },
    async apply(active: () => boolean) {
      if (pending) throw Error('ShapeCopyPending');
      discardForeign();
      if (!copied) throw Error('ShapeCopySourceUnavailable');
      const buffer = copied,
        state = editor.getEditorState();
      guard(state, active);
      const { target: t } = target(state);
      if (t.startUnit === t.endUnit) throw Error('ShapeCopyTargetRangeRequired');
      pending = true;
      try {
        const cap = await capability(state, active);
        const fields = buffer.entries.flatMap(
          (e) => SHAPE_COPY_FIELDS.find((d) => d.id === e.id)!.fields,
        );
        if (
          fields.some((k) => cap.fields[k]?.writable !== true || cap.fields[k]?.readable !== true)
        )
          throw Error('ShapeCopyFieldNotWritable');
        for (const entry of buffer.entries) {
          const descriptor = SHAPE_COPY_FIELDS.find((d) => d.id === entry.id)!;
          descriptor.fields.forEach((field, i) => {
            const policy = cap.fields[field];
            if (policy.enumValues && !policy.enumValues.includes(entry.values[i] as string))
              throw Error('ShapeCopyValueNotRepresentable');
          });
        }
        const q = await editor.queryFormatting(t, { fields });
        guard(state, active);
        if (
          copied !== buffer ||
          !sameDocument(buffer, state) ||
          q.binding.session !== cap.binding.session ||
          q.binding.revision !== cap.binding.revision
        )
          throw Error('StaleFormattingBinding');
        if (fields.some((k) => q.observations.aggregate[k]?.writable !== true))
          throw Error('ShapeCopyFieldNotWritable');
        const patch: Record<string, any> = {};
        for (const entry of buffer.entries) {
          const d = SHAPE_COPY_FIELDS.find((d) => d.id === entry.id)!;
          d.fields.forEach((field, i) => {
            const path = field.split('.');
            let out = patch;
            for (const part of path.slice(0, -1)) out = out[part] ??= {};
            out[path.at(-1)!] = structuredClone(entry.values[i]);
          });
        }
        guard(state, active);
        return await editor.dispatchCommand(APPLY_FORMATTING_PATCH_COMMAND, {
          target: t,
          selectionVersion: state.stateVersion,
          patch: patch as FormattingPatch,
        });
      } finally {
        pending = false;
      }
    },
    clear() {
      copied = null;
    },
    dispose() {
      closed = true;
      copied = null;
    },
  };
}
export type ShapeCopyPort = ReturnType<typeof createShapeCopyPort>;
