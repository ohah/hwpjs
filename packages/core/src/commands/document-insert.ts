import type { SelectionTarget } from './commands.ts';
import type { EditorState, StateToken } from '../state/editor-state.ts';
import type { RuntimeMessage } from '../contracts.ts';
import { validateSelection } from './selection.ts';

export interface InsertDocumentPayload {
  readonly target: SelectionTarget;
  /** The current EditorState.stateVersion captured with the caret. */
  readonly selectionVersion: number;
  /** Owned on admission. Only the view's bytes are read. */
  readonly bytes: Uint8Array;
}

export interface DocumentInsertionCapabilityOptions {
  readonly token?: StateToken;
}

export type DocumentInsertionCapabilities =
  | Readonly<{
      available: true;
      atomic: true;
      sourceFormat: 'hwpx';
      sourceProfile:
        | 'single-section-ordinary-body'
        | 'single-section-body-with-inline-static-tables';
      maxSourceBytes: number;
    }>
  | Readonly<{
      available: false;
      reason: string;
    }>;

interface InsertionBinding {
  readonly session: string;
  readonly revision: number;
  readonly serial: string;
}

// Enforced before cloning a caller's donor, independently
// of the (also validated) live Native capability response.
const maxSourceBytes = 8 * 1024 * 1024;
const typedArray = Object.getPrototypeOf(Uint8Array.prototype);
const getByteLength = Object.getOwnPropertyDescriptor(typedArray, 'byteLength')!.get!;
const getBuffer = Object.getOwnPropertyDescriptor(typedArray, 'buffer')!.get!;
const targetKeys = [
  'editorId',
  'documentId',
  'generation',
  'operationRevision',
  'viewRevision',
  'coordinateSpace',
  'format',
  'owner',
  'section',
  'paragraph',
  'startUnit',
  'endUnit',
  'affinity',
] as const;

function fields(input: unknown, keys: readonly string[], error: string) {
  if (
    !input ||
    typeof input !== 'object' ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(input))
  )
    throw Error(error);
  const descriptors = Object.getOwnPropertyDescriptors(input);
  if (Reflect.ownKeys(descriptors).length !== keys.length) throw Error(error);
  const own: Record<string, unknown> = Object.create(null);
  for (const key of keys) {
    const field = descriptors[key];
    if (!field || !Object.hasOwn(field, 'value')) throw Error(error);
    own[key] = field.value;
  }
  return own;
}

export function captureDocumentInsertPayload(input: unknown): InsertDocumentPayload {
  const { target, selectionVersion, bytes } = fields(
    input,
    ['target', 'selectionVersion', 'bytes'],
    'InvalidDocumentInsertPayload',
  );
  if (!Number.isSafeInteger(selectionVersion) || (selectionVersion as number) < 0)
    throw Error('InvalidDocumentInsertSelectionVersion');
  if (
    !(bytes instanceof Uint8Array) ||
    !ArrayBuffer.isView(bytes) ||
    (typeof SharedArrayBuffer !== 'undefined' && getBuffer.call(bytes) instanceof SharedArrayBuffer)
  )
    throw Error('InvalidDocumentInsertSource');
  const length = getByteLength.call(bytes);
  if (length === 0 || length > maxSourceBytes) throw Error('DocumentInsertSourceLimitExceeded');
  const ownedTarget = fields(target, targetKeys, 'InvalidDocumentInsertTarget');
  if (
    Object.values(ownedTarget).some(
      (value) => value !== null && typeof value !== 'string' && !Number.isSafeInteger(value),
    )
  )
    throw Error('InvalidDocumentInsertTarget');
  return {
    target: ownedTarget as unknown as SelectionTarget,
    selectionVersion: selectionVersion as number,
    bytes: new Uint8Array(bytes),
  };
}

export function currentDocumentInsertCaret(
  state: EditorState,
  target: SelectionTarget,
  selectionVersion: number,
): SelectionTarget {
  if (selectionVersion !== state.stateVersion) throw Error('StaleDocumentInsertSelection');
  const live = state.selection as SelectionTarget | undefined;
  if (!live) throw Error('DocumentInsertionRequiresCaret');
  if (target?.startUnit !== target?.endUnit || live.startUnit !== live.endUnit)
    throw Error('DocumentInsertionRequiresCaret');
  const row = validateSelection(target, state, true);
  validateSelection(live, state, true);
  if (
    live.section !== target.section ||
    live.paragraph !== target.paragraph ||
    live.startUnit !== target.startUnit ||
    live.owner !== target.owner ||
    live.affinity !== target.affinity
  )
    throw Error('StaleDocumentInsertSelection');
  if (
    target.format !== 'hwpx' ||
    target.section !== 0 ||
    target.owner !== 'section:0:body' ||
    !('plainEditable' in row) ||
    row.plainEditable !== true ||
    row.createdCell
  )
    throw Error('UnsupportedDocumentInsertOwner');
  return target;
}

export function checkedDocumentInsertCapability(
  input: unknown,
  revision: number | undefined,
): {
  capabilities: Extract<DocumentInsertionCapabilities, { available: true }>;
  binding: InsertionBinding;
} {
  const invalid = 'MalformedDocumentInsertionCapabilities';
  const version =
    input && typeof input === 'object'
      ? Object.getOwnPropertyDescriptor(input, 'schemaVersion')?.value
      : undefined;
  const keys = ['schemaVersion', 'maxSourceBytes', 'binding'];
  const {
    schemaVersion,
    maxSourceBytes: limit,
    binding,
    sourceProfile,
  } = fields(input, version === 2 ? [...keys, 'sourceProfile'] : keys, invalid);
  const native = fields(binding, ['session', 'revision', 'serial'], invalid);
  const decimal = (value: unknown) =>
    typeof value === 'string' &&
    /^(?:0|[1-9]\d{0,19})$/.test(value) &&
    BigInt(value) <= 0xffff_ffff_ffff_ffffn;
  if (
    schemaVersion !== version ||
    (schemaVersion !== 1 &&
      (schemaVersion !== 2 || sourceProfile !== 'single-section-body-with-inline-static-tables')) ||
    !Number.isSafeInteger(limit) ||
    (limit as number) <= 0 ||
    (limit as number) > maxSourceBytes ||
    typeof native.session !== 'string' ||
    !/^[a-z0-9-]{1,64}:s[1-9]\d{0,19}$/.test(native.session) ||
    !decimal(native.session.slice(native.session.lastIndexOf(':') + 2)) ||
    !decimal(native.serial) ||
    !Number.isInteger(native.revision) ||
    (native.revision as number) < 0 ||
    (native.revision as number) >= 0xffff_ffff ||
    native.revision !== revision
  )
    throw Error(invalid);
  return {
    capabilities: Object.freeze({
      available: true,
      atomic: true,
      sourceFormat: 'hwpx',
      sourceProfile:
        sourceProfile === 'single-section-body-with-inline-static-tables'
          ? sourceProfile
          : 'single-section-ordinary-body',
      maxSourceBytes: limit as number,
    }),
    binding: {
      session: native.session,
      revision: native.revision as number,
      serial: native.serial as string,
    },
  };
}

export function documentInsertMessage(
  payload: InsertDocumentPayload,
  admission: ReturnType<typeof checkedDocumentInsertCapability>,
): RuntimeMessage {
  if (payload.bytes.byteLength > admission.capabilities.maxSourceBytes)
    throw Error('DocumentInsertSourceLimitExceeded');
  return {
    kind: 'insert-document',
    section: payload.target.section,
    paragraph: payload.target.paragraph,
    unit: payload.target.startUnit,
    binding: admission.binding,
    bytes: payload.bytes,
  };
}
