// Public core entry only; no runtime protocol, native facade or private selection helpers.
import {
  getSelectionFormatting,
  SET_CHARACTER_STRIKE_COMMAND,
  SET_CHARACTER_UNDERLINE_COMMAND,
  SET_CHARACTER_PROPERTIES_COMMAND,
  SET_PARAGRAPH_ALIGNMENT_COMMAND,
  type HeadlessEditor,
  type CommandResult,
  type SelectionFormatting,
} from '@hwpjs/core';
// @ts-ignore Shared alignment enum; no independent Native ordinal model.
import { paragraphAlignmentValue } from '../../../web/preview/paragraph-alignments.mjs';
import type {
  DemoAction,
  DemoCommand,
  DemoShellState,
  ActionAvailability,
} from './shell-contract.ts';

export type FormattingDialogKind = 'character' | 'paragraph';
export type DialogField<T> = {
  readonly enabled: boolean;
  readonly reason: string | null;
  readonly value: T | 'mixed' | null;
};
export interface FormattingDialogObservation {
  readonly kind: FormattingDialogKind;
  readonly state: ReturnType<HeadlessEditor['getEditorState']>;
  readonly formatting: SelectionFormatting;
  readonly fields: {
    readonly size: DialogField<number>;
    readonly bold: DialogField<boolean>;
    readonly italic: DialogField<boolean>;
    readonly alignment: DialogField<string>;
  };
}
export type FormattingDialogPatch =
  | {
      readonly kind: 'character';
      readonly properties: Readonly<{ size?: number; bold?: boolean; italic?: boolean }>;
    }
  | { readonly kind: 'paragraph'; readonly alignment?: string };
export type FormattingDialogApplyResult =
  | { readonly kind: 'unchanged' }
  | { readonly kind: 'command'; readonly result: CommandResult }
  | { readonly kind: 'rejected'; readonly error: string };
/** Same unit/range policy as the existing toolbar; never infer unknown source size. */
export function characterSizeFromPoints(points: number): number {
  const size = Math.round(points * 100);
  if (
    !Number.isFinite(points) ||
    points <= 0 ||
    points > 4096 ||
    Math.abs(size / 100 - points) > 1e-9
  )
    throw Error('InvalidCharacterSize');
  return size;
}

export interface FormattingBridgeOptions {
  readonly editor: Pick<HeadlessEditor, 'getEditorState' | 'dispatchCommand'> &
    Partial<Pick<HeadlessEditor, 'update'>>;
  readonly onStatus: (message: string) => void;
  readonly onResult?: (result: CommandResult) => void;
}
/** A partial shell API: caller composes this with file/history/zoom actions. */
export function createFormattingBridge({ editor, onStatus, onResult }: FormattingBridgeOptions) {
  const alignments = {
    'align-left': 'LEFT',
    'align-center': 'CENTER',
    'align-right': 'RIGHT',
    'align-justify': 'JUSTIFY',
  } as const;
  const supported = (command: string) =>
    command === 'bold' ||
    command === 'italic' ||
    command === 'underline' ||
    command === 'strike' ||
    command === 'set-font-size' ||
    Object.hasOwn(alignments, command);
  let pending = false;
  function presentation(
    state: SelectionFormatting,
  ): Pick<DemoShellState, 'actions' | 'fontSizePoints'> {
    const availability = (reason: string | null, pressed?: boolean | 'mixed'): ActionAvailability =>
      Object.freeze({
        enabled: !pending && reason === null,
        reason: pending ? 'FormattingPending' : (reason ?? undefined),
        pressed,
      });
    const actions: Partial<Record<DemoCommand, ActionAvailability>> = {
      bold: availability(
        state.characterAvailableReason ??
          (state.bold === null ? 'UnknownCharacterFormatting' : null),
        state.bold ?? undefined,
      ),
      italic: availability(
        state.characterAvailableReason ??
          (state.italic === null ? 'UnknownCharacterFormatting' : null),
        state.italic ?? undefined,
      ),
      underline: availability(
        state.underlineAvailableReason ??
          (state.underline === null ? 'UnknownCharacterFormatting' : null),
        state.underline ?? undefined,
      ),
      strike: availability(state.strikeAvailableReason, state.strike ?? undefined),
      'set-font-size': availability(state.characterAvailableReason),
    };
    for (const [command, alignment] of Object.entries(alignments))
      actions[command as DemoCommand] = availability(
        state.paragraphAvailableReason,
        state.align === 'mixed' ? 'mixed' : state.align === alignment,
      );
    return Object.freeze({
      actions: Object.freeze(actions),
      fontSizePoints: typeof state.size === 'number' ? state.size / 100 : undefined,
    });
  }
  /** Returns false only for commands belonging to another bridge. */
  async function action(action: DemoAction): Promise<boolean> {
    if (!supported(action.command)) return false;
    // Fresh selection/target at invocation; never retain the presentation's token.
    const formatting = getSelectionFormatting(editor.getEditorState());
    const availability = presentation(formatting).actions?.[action.command];
    if (!availability?.enabled || !formatting.target) {
      onStatus(availability?.reason ?? 'MissingSelection');
      return true;
    }
    const target = formatting.target;
    pending = true;
    try {
      let result: CommandResult;
      if (action.command === 'bold' || action.command === 'italic') {
        const property = action.command;
        result = await editor.dispatchCommand(SET_CHARACTER_PROPERTIES_COMMAND, {
          target,
          properties: { [property]: formatting[property] !== true },
        });
      } else if (action.command === 'strike') {
        result = await editor.dispatchCommand(SET_CHARACTER_STRIKE_COMMAND, {
          target,
          enabled: formatting.strike !== true,
        });
      } else if (action.command === 'underline') {
        result = await editor.dispatchCommand(SET_CHARACTER_UNDERLINE_COMMAND, {
          target,
          kind: formatting.underline === true ? 'none' : 'bottom',
        });
      } else if (action.command === 'set-font-size') {
        let size: number;
        try {
          size = characterSizeFromPoints(action.points);
        } catch {
          onStatus('InvalidCharacterSize');
          return true;
        }
        result = await editor.dispatchCommand(SET_CHARACTER_PROPERTIES_COMMAND, {
          target,
          properties: { size },
        });
      } else {
        result = await editor.dispatchCommand(SET_PARAGRAPH_ALIGNMENT_COMMAND, {
          target,
          alignment: alignments[action.command as keyof typeof alignments],
        });
      }
      onStatus(result.error ? `${result.status}: ${result.error}` : result.status);
      onResult?.(result);
    } catch (error) {
      onStatus(error instanceof Error ? error.message : String(error));
    } finally {
      pending = false;
    }
    return true;
  }

  function captureDialog(kind: FormattingDialogKind): FormattingDialogObservation {
    const state = editor.getEditorState(),
      formatting = getSelectionFormatting(state);
    const reason = (value: string | null) =>
      pending
        ? 'FormattingPending'
        : typeof editor.update !== 'function'
          ? 'FormattingBarrierUnavailable'
          : value;
    const field = <T>(value: T | 'mixed' | null, why: string | null): DialogField<T> =>
      Object.freeze({ value, enabled: reason(why) === null, reason: reason(why) });
    return Object.freeze({
      kind,
      state,
      formatting,
      fields: Object.freeze({
        size: field<number>(formatting.size, formatting.characterAvailableReason),
        bold: field<boolean>(formatting.bold, formatting.characterAvailableReason),
        italic: field<boolean>(formatting.italic, formatting.characterAvailableReason),
        alignment: field<string>(formatting.align, formatting.paragraphAvailableReason),
      }),
    });
  }
  async function applyDialog(
    observation: FormattingDialogObservation,
    patch: FormattingDialogPatch,
  ): Promise<FormattingDialogApplyResult> {
    if (pending) return { kind: 'rejected', error: 'FormattingPending' };
    try {
      if (patch.kind !== observation.kind) throw Error('InvalidFormattingDialogPatch');
      if (editor.getEditorState() !== observation.state) throw Error('StaleFormattingDialog');
      const why =
        patch.kind === 'character'
          ? observation.fields.size.reason
          : observation.fields.alignment.reason;
      if (why) throw Error(why);
      const target = observation.formatting.target;
      if (!target) throw Error('MissingSelection');
      let properties: { size?: number; bold?: boolean; italic?: boolean } | undefined,
        alignment: string | undefined;
      if (patch.kind === 'character') {
        properties = {};
        if (!patch.properties || Object.getPrototypeOf(patch.properties) !== Object.prototype)
          throw Error('InvalidCharacterProperties');
        for (const key of Reflect.ownKeys(patch.properties)) {
          if (!['size', 'bold', 'italic'].includes(String(key)))
            throw Error('InvalidCharacterProperties');
          const descriptor = Object.getOwnPropertyDescriptor(patch.properties, key)!;
          if (!('value' in descriptor)) throw Error('InvalidCharacterProperties');
          const value = descriptor.value;
          if (key === 'size') {
            if (!Number.isInteger(value) || value <= 0 || value > 409600)
              throw Error('InvalidCharacterSize');
          } else if (typeof value !== 'boolean') throw Error('InvalidCharacterProperties');
          if (value !== observation.fields[key as 'size' | 'bold' | 'italic'].value)
            (properties as Record<string, unknown>)[key as string] = value;
        }
        if (!Object.keys(properties).length) return { kind: 'unchanged' };
      } else {
        if (Reflect.ownKeys(patch).some((key) => key !== 'kind' && key !== 'alignment'))
          throw Error('InvalidParagraphAlignment');
        if (patch.alignment === undefined) return { kind: 'unchanged' };
        if (paragraphAlignmentValue(patch.alignment) === undefined)
          throw Error('InvalidParagraphAlignment');
        if (patch.alignment === observation.fields.alignment.value) return { kind: 'unchanged' };
        alignment = patch.alignment;
      }
      pending = true;
      // Flush earlier admissions, then recheck exact snapshot. This is not a core
      // selectionVersion admission fence for a later selection-only queue race.
      if (!editor.update) throw Error('FormattingBarrierUnavailable');
      await editor.update(() => {});
      if (editor.getEditorState() !== observation.state) throw Error('StaleFormattingDialog');
      const result = properties
        ? await editor.dispatchCommand(SET_CHARACTER_PROPERTIES_COMMAND, { target, properties })
        : await editor.dispatchCommand(SET_PARAGRAPH_ALIGNMENT_COMMAND, {
            target,
            alignment: alignment!,
          });
      return { kind: 'command', result };
    } catch (error) {
      return { kind: 'rejected', error: error instanceof Error ? error.message : String(error) };
    } finally {
      pending = false;
    }
  }

  const getPresentation = () => presentation(getSelectionFormatting(editor.getEditorState()));
  return Object.freeze({ action, getPresentation, captureDialog, applyDialog });
}
