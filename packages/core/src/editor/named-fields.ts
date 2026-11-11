import type { EditorRuntime, RuntimeRequestContext } from '../contracts.ts';
import type { SelectionTarget } from '../commands/commands.ts';
import { validateSelection } from '../commands/selection.ts';
import type { EditorState, StateToken } from '../state/editor-state.ts';
import { isWellFormedText } from '../state/text-scalar.ts';

export type NamedFieldFormat = SelectionTarget['format'];
export type NamedFieldLocation = Readonly<
  Pick<SelectionTarget, 'owner' | 'section' | 'paragraph' | 'startUnit' | 'endUnit'> & {
    /** Optional index of the exact native display spelling for this paragraph. */
    projectionView?: number;
  }
>;
export type NamedFieldValue =
  | { readonly status: 'available'; readonly text: string }
  | { readonly status: 'unavailable' };

export interface NamedFieldSourceRow {
  /** Opaque and unique within this observation. */
  readonly id: string;
  readonly name: string | null;
  readonly kind: string;
  readonly value: NamedFieldValue;
  readonly protection: 'protected' | 'unprotected' | 'unknown';
  /** This current field has a supported value-write target. Document write policy still applies. */
  readonly canSetValue?: boolean;
  /** Current display coordinates proven by the runtime, or null if unmappable. */
  readonly location: NamedFieldLocation | null;
}

/** Rows are in native document order. Partial coverage cannot prove an ordinal or absence. */
export interface NamedFieldSource {
  readonly format: NamedFieldFormat;
  readonly coverage: 'complete' | 'partial';
  readonly rows: readonly NamedFieldSourceRow[];
  /** Native display witnesses are shared by all rows in a paragraph and discarded by Core. */
  readonly projectionViews?: readonly {
    readonly section: number;
    readonly paragraph: number;
    readonly text: string;
  }[];
}

export interface NamedField extends Omit<NamedFieldSourceRow, 'location'> {
  readonly target: Readonly<SelectionTarget> | null;
}

export interface NamedFieldInventory extends Omit<NamedFieldSource, 'rows' | 'projectionViews'> {
  readonly token: Readonly<StateToken>;
  readonly rows: readonly NamedField[];
}

export interface NamedFieldSelector {
  readonly name: string;
  /** Zero-based occurrence in document order, including protected and unreadable fields. */
  readonly occurrence?: number;
}

export interface SetNamedFieldValuePayload {
  readonly selector: NamedFieldSelector;
  readonly token: StateToken;
  /** Capture from the same editor observation before dispatch. */
  readonly selectionVersion: number;
  readonly expectedValue: string;
  readonly text: string;
}

export interface NamedFieldParameters {
  /** null means absent from both the scalar parameter and a supported Command. */
  readonly direction: string | null;
  readonly memo: string | null;
}
export interface SetNamedFieldParametersPayload {
  readonly selector: NamedFieldSelector;
  readonly token: StateToken;
  readonly selectionVersion: number;
  readonly expected: NamedFieldParameters;
  readonly direction: string;
  readonly memo: string;
}
export type NamedFieldParametersRead =
  | Exclude<NamedFieldResolution, { status: 'found' }>
  | {
      readonly status: 'found';
      readonly field: NamedField;
      readonly parameters: NamedFieldParameters;
      readonly canEdit: boolean;
      readonly token: StateToken;
      readonly selectionVersion: number;
    };

export interface CreateNamedFieldPayload {
  readonly target: SelectionTarget;
  /** Selection version from the same current editor observation. */
  readonly selectionVersion: number;
  /** Exact selected UTF-16 text. Use an empty string for a caret. */
  readonly expectedText: string;
  readonly name: string;
  /** Stored CLICK_HERE direction parameter. */
  readonly direction?: string;
  /** Stored CLICK_HERE help parameter. */
  readonly memo?: string;
}

export interface RenameNamedFieldPayload {
  /** The current exact name and optional occurrence are the source precondition. */
  readonly selector: NamedFieldSelector;
  readonly token: StateToken;
  readonly selectionVersion: number;
  readonly newName: string;
}

export type NamedFieldResolution =
  | { readonly status: 'found'; readonly field: NamedField }
  | { readonly status: 'ambiguous'; readonly matches: readonly NamedField[] }
  | { readonly status: 'missing' }
  | { readonly status: 'incomplete' };

export type NamedFieldNavigation =
  | Exclude<NamedFieldResolution, { status: 'found' }>
  | { readonly status: 'unavailable'; readonly field: NamedField }
  | { readonly status: 'moved'; readonly field: NamedField; readonly state: EditorState };

export interface NamedFieldOptions {
  readonly token?: StateToken;
}

function validText(value: unknown): value is string {
  return typeof value === 'string' && isWellFormedText(value);
}

export function checkedNamedFieldSelector(selector: NamedFieldSelector): NamedFieldSelector {
  if (
    !selector ||
    !validText(selector.name) ||
    selector.name.length === 0 ||
    (selector.occurrence !== undefined &&
      (!Number.isSafeInteger(selector.occurrence) || selector.occurrence < 0))
  )
    throw Error('InvalidNamedFieldSelector');
  return Object.freeze({ name: selector.name, occurrence: selector.occurrence });
}

export function resolveNamedField(
  inventory: NamedFieldInventory,
  selector: NamedFieldSelector,
): NamedFieldResolution {
  const { name, occurrence } = checkedNamedFieldSelector(selector);
  if (inventory.coverage === 'partial') return { status: 'incomplete' };
  const matches = inventory.rows.filter((row) => row.name === name);
  if (occurrence === undefined && matches.length > 1)
    return { status: 'ambiguous', matches: Object.freeze(matches) };
  const field = matches[occurrence ?? 0];
  return field ? { status: 'found', field } : { status: 'missing' };
}

export function checkedNamedFieldInventory(
  source: NamedFieldSource,
  state: EditorState,
): NamedFieldInventory {
  const format = (state.content as { format?: unknown } | undefined)?.format;
  if (
    !source ||
    (source.format !== 'hwp5' && source.format !== 'hwpx') ||
    source.format !== format ||
    (source.coverage !== 'complete' && source.coverage !== 'partial') ||
    !Array.isArray(source.rows)
  )
    throw Error('InvalidNamedFieldInventory');

  const views = source.projectionViews;
  if (views !== undefined && !Array.isArray(views)) throw Error('InvalidNamedFieldInventory');
  const token = Object.freeze({ ...state.token });
  const ids = new Set<string>();
  const rows: NamedField[] = [];
  for (const row of source.rows as readonly NamedFieldSourceRow[]) {
    if (
      !row ||
      !validText(row.id) ||
      !row.id ||
      ids.has(row.id) ||
      (row.name !== null && !validText(row.name)) ||
      !validText(row.kind) ||
      !row.kind ||
      !['protected', 'unprotected', 'unknown'].includes(row.protection) ||
      (row.canSetValue !== undefined && typeof row.canSetValue !== 'boolean') ||
      !row.value ||
      (row.value.status !== 'unavailable' &&
        (row.value.status !== 'available' || !validText(row.value.text)))
    )
      throw Error('InvalidNamedFieldInventory');
    ids.add(row.id);
    let target: SelectionTarget | null = null;
    if (row.location !== null) {
      if (!row.location || !validText(row.location.owner))
        throw Error('InvalidNamedFieldInventory');
      const { owner, section, paragraph, startUnit, endUnit, projectionView } = row.location;
      target = {
        ...token,
        coordinateSpace: 'display',
        format: source.format,
        owner,
        section,
        paragraph,
        startUnit,
        endUnit,
        affinity: 'forward',
      };
      if (projectionView === undefined) {
        validateSelection(target, state);
      } else {
        const witness = views?.[projectionView];
        if (
          !Number.isSafeInteger(projectionView) ||
          projectionView < 0 ||
          !witness ||
          witness.section !== section ||
          witness.paragraph !== paragraph ||
          typeof witness.text !== 'string'
        )
          throw Error('InvalidNamedFieldInventory');
        // A native range can have no equivalent in a clipped/alternate display.
        try {
          if (validateSelection(target, state).text !== witness.text) target = null;
        } catch (error) {
          if (
            !(error instanceof Error) ||
            !['InvalidSelectionOwner', 'InvalidTextPosition', 'InvalidScalarBoundary'].includes(
              error.message,
            )
          )
            throw error;
          target = null;
        }
      }
      if (target) Object.freeze(target);
    }
    const value =
      row.value.status === 'available'
        ? Object.freeze({ status: 'available' as const, text: row.value.text })
        : Object.freeze({ status: 'unavailable' as const });
    rows.push(
      Object.freeze({
        id: row.id,
        name: row.name,
        kind: row.kind,
        protection: row.protection,
        value,
        target,
        ...(row.canSetValue === undefined
          ? {}
          : {
              canSetValue: row.canSetValue && target !== null && source.coverage === 'complete',
            }),
      }),
    );
  }
  return Object.freeze({
    token,
    format: source.format,
    coverage: source.coverage,
    rows: Object.freeze(rows),
  });
}

/** Both built-in transports carry the same read-only backend message. */
export async function requestNamedFields(
  request: EditorRuntime['request'],
  context: RuntimeRequestContext,
): Promise<NamedFieldSource> {
  const kind = 'named-fields';
  const reply = await request({ kind }, context);
  if (reply.kind !== kind) throw Error('InvalidRuntimeReply');
  if (reply.error) throw Error(reply.error);
  return reply.namedFields as NamedFieldSource;
}
