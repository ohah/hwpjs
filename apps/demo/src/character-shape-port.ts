import {
  getSelectionFormatting,
  APPLY_FORMATTING_PATCH_COMMAND,
  type CharacterFormattingPatch,
  type FormattingReset,
  type FormattingQueryResult,
  type FormattingCapabilities,
  SET_CHARACTER_PROPERTIES_COMMAND,
  SET_CHARACTER_TEXT_COLOR_COMMAND,
  SET_CHARACTER_FONT_NAME_COMMAND,
  SET_CHARACTER_UNDERLINE_COMMAND,
  SET_CHARACTER_STRIKE_COMMAND,
  type HeadlessEditor,
  type CharacterFontLanguage,
  type CommandResult,
} from '@hwpjs/core';
// @ts-ignore Existing public setter validator; no second RGB/name authority.
import { characterColorArg } from '../../../js/character-color-args.mjs';
// @ts-ignore The same language/UTF-16/byte validator as the existing font tool.
import { characterFontNameArgs } from '../../../js/character-font-name-args.mjs';

export interface CharacterShapeDraft {
  atomic?: CharacterFormattingPatch;
  reset?: FormattingReset;
  properties?: { size?: number; bold?: boolean; italic?: boolean };
  color?: string;
  font?: { language: CharacterFontLanguage; name: string };
  underline?: 'none' | 'bottom';
  strike?: boolean;
}
export interface CharacterShapeObservation {
  readonly state: ReturnType<HeadlessEditor['getEditorState']>;
  readonly formatting: ReturnType<typeof getSelectionFormatting>;
}
export type CharacterShapeResult =
  | { kind: 'unchanged' }
  | { kind: 'rejected'; error: string }
  | { kind: 'command'; result: CommandResult };
type Editor = Pick<HeadlessEditor, 'getEditorState' | 'dispatchCommand' | 'update'> &
  Partial<Pick<HeadlessEditor, 'getFormattingCapabilities' | 'queryFormatting'>>;
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
function plain(value: unknown, allowed: readonly string[]): void {
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype)
    throw Error('InvalidCharacterDraft');
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !allowed.includes(key))
      throw Error('UnknownCharacterDraftField');
    if (!('value' in Object.getOwnPropertyDescriptor(value, key)!))
      throw Error('InvalidCharacterDraft');
  }
}
/** UI planning only. Native/core remain the selection, permission and writer authority. */
export function characterShapePlan(
  observation: CharacterShapeObservation,
  draft: CharacterShapeDraft,
) {
  plain(draft, ['properties', 'color', 'font', 'underline', 'strike']);
  const f = observation.formatting;
  const groups: string[] = [];
  type Dispatch = Editor['dispatchCommand'];
  const factories: ((dispatch: Dispatch) => Promise<CommandResult>)[] = [];
  const target = f.target;
  const add = (
    group: string,
    reason: string | null,
    run: (dispatch: Dispatch) => Promise<CommandResult>,
  ) => {
    if (reason) throw Error(reason);
    if (!target) throw Error('MissingSelection');
    groups.push(group);
    factories.push(run);
  };
  if (draft.properties !== undefined) {
    plain(draft.properties, ['size', 'bold', 'italic']);
    const properties: { size?: number; bold?: boolean; italic?: boolean } = {};
    for (const key of ['size', 'bold', 'italic'] as const) {
      const value = draft.properties[key];
      if (value === undefined) continue;
      if (key === 'size') {
        if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0 || value > 409600)
          throw Error('InvalidCharacterSize');
        if (value !== f.size) properties.size = value;
      } else {
        if (typeof value !== 'boolean') throw Error('InvalidCharacterProperties');
        if (value !== f[key]) properties[key] = value;
      }
    }
    if (Object.keys(properties).length)
      add('properties', f.characterAvailableReason, (dispatch) =>
        dispatch(SET_CHARACTER_PROPERTIES_COMMAND, { target: target!, properties }),
      );
  }
  if (draft.color !== undefined) {
    characterColorArg(draft.color);
    const color = draft.color.toLowerCase();
    if (color !== f.textColor)
      add('color', f.textColorAvailableReason, (dispatch) =>
        dispatch(SET_CHARACTER_TEXT_COLOR_COMMAND, { target: target!, color }),
      );
  }
  if (draft.font !== undefined) {
    plain(draft.font, ['language', 'name']);
    const { language, name } = draft.font;
    characterFontNameArgs(language, name);
    const value = f.fontNames[language];
    if (!value) throw Error('InvalidFontLanguage');
    if (value.kind !== 'single' || value.name !== name)
      add('font', f.fontNameAvailableReasons[language], (dispatch) =>
        dispatch(SET_CHARACTER_FONT_NAME_COMMAND, { target: target!, language, name }),
      );
  }
  if (draft.underline !== undefined) {
    const kind = draft.underline;
    if (kind !== 'none' && kind !== 'bottom') throw Error('IntegratedUnderlineKindUnavailable');
    // Boolean true never proves a bottom/top/center kind; an explicit kind goes to Native.
    add('underline', f.underlineAvailableReason, (dispatch) =>
      dispatch(SET_CHARACTER_UNDERLINE_COMMAND, { target: target!, kind }),
    );
  }
  if (draft.strike !== undefined) {
    const enabled = draft.strike;
    if (typeof enabled !== 'boolean') throw Error('InvalidCharacterStrikeEnabled');
    if (enabled !== f.strike)
      add('strike', f.strikeAvailableReason, (dispatch) =>
        dispatch(SET_CHARACTER_STRIKE_COMMAND, { target: target!, enabled }),
      );
  }
  if (groups.length > 1) throw Error('AtomicCharacterMultiGroupUnavailable');
  // The closure owns scalar payloads before any asynchronous work.
  return { group: groups[0] ?? null, execute: factories[0] ?? null };
}
export function createCharacterShapePort(editor: Editor) {
  let pending = false;
  const preparationFailures = new WeakMap<CharacterShapeObservation, string>();
  const admissions = new WeakMap<CharacterShapeObservation, boolean>();
  const observations = new WeakMap<
    CharacterShapeObservation,
    { capability: FormattingCapabilities; query: FormattingQueryResult }
  >();
  const atomicPlan = (observation: CharacterShapeObservation, draft: CharacterShapeDraft) => {
    const target = observation.formatting.target;
    if (!target) throw Error('MissingSelection');
    if (target.startUnit === target.endUnit) throw Error('EmptyCharacterSelection');
    if (
      draft.reset &&
      Object.keys(draft).some(
        (k) => k !== 'reset' && draft[k as keyof CharacterShapeDraft] !== undefined,
      )
    )
      throw Error('ConflictingFormattingReset');
    plain(draft, ['properties', 'color', 'font', 'underline', 'strike', 'atomic', 'reset']);
    const atomic = structuredClone(draft.atomic ?? {});
    const finite = (v: unknown): void => {
      if (typeof v === 'number' && !Number.isFinite(v))
        throw Error('InvalidCharacterFormattingValue');
      if (v && typeof v === 'object') for (const child of Object.values(v)) finite(child);
    };
    finite(atomic);
    const reset = draft.reset ? structuredClone(draft.reset) : undefined;
    const character: CharacterFormattingPatch = {
      ...atomic,
      ...draft.properties,
      ...(draft.color !== undefined ? { textColor: characterColorArg(draft.color) } : {}),
      ...(draft.font
        ? { fonts: { ...draft.atomic?.fonts, [draft.font.language]: { name: draft.font.name } } }
        : {}),
      ...(draft.underline !== undefined
        ? { underline: { ...draft.atomic?.underline, kind: draft.underline } }
        : {}),
      ...(draft.strike !== undefined
        ? { strike: { ...draft.atomic?.strike, enabled: draft.strike } }
        : {}),
    };
    if (draft.atomic) {
      const conflicts = [
        ...(draft.properties ? Object.keys(draft.properties) : []),
        ...(draft.color !== undefined ? ['textColor'] : []),
        ...(draft.font ? ['fonts'] : []),
        ...(draft.underline !== undefined ? ['underline'] : []),
        ...(draft.strike !== undefined ? ['strike'] : []),
      ];
      if (conflicts.some((k) => Object.hasOwn(draft.atomic!, k)))
        throw Error('ConflictingCharacterDraft');
    }
    const meaningful = (v: unknown): boolean =>
      v !== undefined && (v === null || typeof v !== 'object' || Object.values(v).some(meaningful));
    if (!reset && !meaningful(character)) return null;
    return (dispatch: Editor['dispatchCommand']) =>
      dispatch(APPLY_FORMATTING_PATCH_COMMAND, {
        target,
        selectionVersion: observation.state.stateVersion,
        patch: reset ? { reset } : { character },
      });
  };
  const planFor = (observation: CharacterShapeObservation, draft: CharacterShapeDraft) => {
    const preparationFailure = preparationFailures.get(observation);
    if (preparationFailure) throw Error(preparationFailure);
    if (admissions.get(observation) === true) return { execute: atomicPlan(observation, draft) };
    if (draft.atomic !== undefined || draft.reset !== undefined)
      throw Error('AtomicCharacterUnavailable');
    return characterShapePlan(observation, draft);
  };
  return {
    atomic(observation: CharacterShapeObservation) {
      return observations.get(observation);
    },
    capture(): CharacterShapeObservation {
      const state = editor.getEditorState();
      return Object.freeze({ state, formatting: getSelectionFormatting(state) });
    },
    prepare(observation: CharacterShapeObservation): Promise<void> | undefined {
      if (!editor.getFormattingCapabilities || !editor.queryFormatting) return;
      const getCaps = editor.getFormattingCapabilities.bind(editor),
        query = editor.queryFormatting.bind(editor);
      return (async () => {
        const cap = await getCaps();
        if (editor.getEditorState() !== observation.state) throw Error('StaleCharacterShape');
        if (!cap.atomic) {
          admissions.set(observation, false);
          return;
        }
        if (
          cap.selectionAdmissionFence?.version !== 1 ||
          cap.selectionAdmissionFence.epoch !== 'stateVersion' ||
          !cap.selectionAdmissionFence.commands.includes('APPLY_FORMATTING_PATCH')
        )
          throw Error('SelectionFenceUnavailable');
        const target = observation.formatting.target;
        if (!target) throw Error('MissingSelection');
        const result = await query(target, {
          fields: Object.keys(cap.fields).filter(
            (k) => cap.fields[k].readable && (k.startsWith('character.') || k === 'reset.style'),
          ),
        });
        if (
          result.binding.session !== cap.binding.session ||
          result.binding.revision !== cap.binding.revision
        )
          throw Error('StaleFormattingBinding');
        observations.set(observation, { capability: cap, query: result });
        if (editor.getEditorState() !== observation.state) throw Error('StaleCharacterShape');
        admissions.set(observation, true);
      })().catch((error) => {
        preparationFailures.set(observation, message(error));
        throw error;
      });
    },
    assess(observation: CharacterShapeObservation, draft: CharacterShapeDraft): string | null {
      try {
        planFor(observation, draft);
        return null;
      } catch (error) {
        return message(error);
      }
    },
    async apply(
      observation: CharacterShapeObservation,
      draft: CharacterShapeDraft,
      active: () => boolean,
    ): Promise<CharacterShapeResult> {
      if (pending) return { kind: 'rejected', error: 'CharacterShapePending' };
      try {
        if (!active()) throw Error('CharacterShapeClosed');
        if (editor.getEditorState() !== observation.state) throw Error('StaleCharacterShape');
        const plan = planFor(observation, draft);
        if (!plan.execute) return { kind: 'unchanged' };
        pending = true;
        // Existing FIFO flush and exact UI snapshot check; NOT a new selectionVersion fence.
        await editor.update(() => {});
        if (!active()) throw Error('CharacterShapeClosed');
        if (editor.getEditorState() !== observation.state) throw Error('StaleCharacterShape');
        return { kind: 'command', result: await plan.execute(editor.dispatchCommand.bind(editor)) };
      } catch (error) {
        return { kind: 'rejected', error: message(error) };
      } finally {
        pending = false;
      }
    },
  };
}
export type CharacterShapePort = ReturnType<typeof createCharacterShapePort>;
