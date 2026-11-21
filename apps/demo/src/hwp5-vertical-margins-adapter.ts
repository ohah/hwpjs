import {
  SET_OBJECT_OUTER_MARGINS_COMMAND,
  SET_HWP5_VERTICAL_MARGINS_COMMAND,
  type HeadlessEditor,
  type Hwp5VerticalMarginsTarget,
  type ObjectOuterMarginsRead,
  type ObjectOuterMarginsTarget,
} from '@hwpjs/core';
import type { ObjectOuterMarginsEditor } from './object-outer-margins-port.ts';

const issuedReads = new WeakSet<object>();
export const isHwp5VerticalMarginsRead = (read: object) => issuedReads.has(read);

/** UI bridge only: its private wrapper is never passed to Core as an outer-margins target. */
export function createHwp5VerticalMarginsAdapter(
  editor: ObjectOuterMarginsEditor,
): ObjectOuterMarginsEditor {
  const verticalEditor = editor as ObjectOuterMarginsEditor &
    Partial<Pick<HeadlessEditor, 'getHwp5VerticalMargins'>>;
  const targets = new WeakMap<
    object,
    { target: Hwp5VerticalMarginsTarget; left: number; right: number; used: boolean }
  >();
  return {
    getEditorState: () => editor.getEditorState(),
    async getObjectOuterMargins(selector, options) {
      const state = editor.getEditorState();
      const read = await editor.getObjectOuterMargins(selector, options);
      if (editor.getEditorState() !== state) throw Error('Hwp5VerticalMarginsStateChanged');
      if (
        read.state === 'available' ||
        read.reason !== 'OuterMarginsTopBottomFollowUpRequired' ||
        (state.content as { format?: unknown } | null)?.format !== 'hwp5' ||
        selector.kind === 'drawing' ||
        typeof verticalEditor.getHwp5VerticalMargins !== 'function'
      )
        return read;
      const vertical = await verticalEditor.getHwp5VerticalMargins(selector, options);
      if (editor.getEditorState() !== state) throw Error('Hwp5VerticalMarginsStateChanged');
      if (vertical.state !== 'available') return read;
      const o = vertical.observation;
      if (
        o.format !== 'hwp5' ||
        o.selector.kind !== selector.kind ||
        o.selector.section !== selector.section ||
        o.selector.node !== selector.node
      )
        throw Error('Hwp5VerticalMarginsBindingMismatch');
      // Copy the signed read-only horizontal words from Core; never derive them from geometry.
      const target = Object.freeze({}) as ObjectOuterMarginsTarget;
      targets.set(target, { target: vertical.target, left: o.left, right: o.right, used: false });
      const result: ObjectOuterMarginsRead = Object.freeze({
        state: 'available',
        target,
        observation: Object.freeze({
          format: 'hwp5',
          kind: selector.kind,
          section: selector.section,
          drawingNode: selector.node,
          margins: Object.freeze({ left: o.left, right: o.right, top: o.top, bottom: o.bottom }),
          verticalOnly: true,
        }),
      });
      issuedReads.add(result);
      return result;
    },
    get dispatchCommand() {
      // Preserve the shared port's final fence after reading the original dispatch getter.
      const dispatch = editor.dispatchCommand;
      const send: ObjectOuterMarginsEditor['dispatchCommand'] = async (command, payload) => {
        const p = payload as {
          target?: object;
          margins?: { left: number; right: number; top: number; bottom: number };
        };
        const owned = p?.target && targets.get(p.target);
        if (!owned) return dispatch.call(editor, command, payload);
        if (
          command !== SET_OBJECT_OUTER_MARGINS_COMMAND ||
          owned.used ||
          !p.margins ||
          p.margins.left !== owned.left ||
          p.margins.right !== owned.right
        )
          throw Error('InvalidHwp5VerticalMarginsAdapterTarget');
        owned.used = true;
        return dispatch.call(editor, SET_HWP5_VERTICAL_MARGINS_COMMAND, {
          target: owned.target,
          top: p.margins.top,
          bottom: p.margins.bottom,
        });
      };
      return send;
    },
  };
}
