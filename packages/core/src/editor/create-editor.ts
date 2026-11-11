import type { PageSettingsCapabilities } from '../commands/page-settings-dto.ts';
import { EDIT_PAGE_SETTINGS_COMMAND } from '../commands/commands.ts';
import { capturePageSettingsPayload } from '../commands/page-settings.ts';
import type {
  EditPageSettingsPayload,
  PageSettingsTarget,
  PageSettingsRead,
} from '../commands/page-settings.ts';
import {
  checkedPageSettingsCapabilities,
  pageSettingsSource,
} from '../../../../js/page-settings-edit.mjs';
// @ts-ignore Shared strict SDK capability decoder.
import { decodeSourceTableCellSplitCapability } from '../../../../js/source-table-cell-split-capability.mjs';
import type { SourceTableCellSplitCapabilities } from '../commands/source-table-cell-split.ts';
// @ts-ignore Shared HWPX metadata boundary validation.
import { checkedNamedFieldParameterValues } from '../../../../js/named-field-parameters.mjs';
import {
  sourceTableCellHeightRequest,
  type SourceTableCellHeightTarget,
  type SourceTableCellHeightMinimum,
} from '../commands/source-table-cell-height.ts';
import {
  sourceTableCellWidthRequest,
  type SourceTableCellWidthTarget,
} from '../commands/source-table-cell-width.ts';
import {
  checkedNamedFieldInventory,
  checkedNamedFieldSelector,
  resolveNamedField,
} from './named-fields.ts';
// @ts-ignore Shared Native DTO validator, with no source reader or state.
import { checkedBulletDefinitionEdit } from '../../../../js/paragraph-bullet-definition-write.mjs';
import type { EditParagraphBulletDefinitionPayload } from '../commands/paragraph-bullet-definition.ts';
import { checkedParagraphBulletDefinitions } from '../../../../js/paragraph-bullet-definitions.mjs';
import type {
  ParagraphBulletDefinitions,
  ParagraphBulletDefinitionsOptions,
} from './paragraph-bullet-definitions.ts';
import type {
  NamedFieldInventory,
  NamedFieldNavigation,
  NamedFieldOptions,
  NamedFieldResolution,
  NamedFieldSelector,
  SetNamedFieldValuePayload,
  RenameNamedFieldPayload,
  CreateNamedFieldPayload,
  NamedFieldParameters,
  SetNamedFieldParametersPayload,
  NamedFieldParametersRead,
} from './named-fields.ts';
import {
  captureDocumentInsertPayload,
  checkedDocumentInsertCapability,
  currentDocumentInsertCaret,
  documentInsertMessage,
} from '../commands/document-insert.ts';
import type {
  DocumentInsertionCapabilities,
  DocumentInsertionCapabilityOptions,
  InsertDocumentPayload,
} from '../commands/document-insert.ts';
import { planReplaceAll } from '../commands/replace-all.ts';
import type { ReplaceAllPlanRequest, ReplaceAllCapabilities } from '../commands/replace-all.ts';
import { mergeExclusiveOwnerWindow, isPlainOwnerBaseline } from '../internal/owner-window-cow.ts';
import {
  hasRuntimeAdmission,
  requestAtRuntimeAdmission,
  RuntimeAdmissionRejected,
} from '../internal/runtime-admission.ts';
import {
  atomicSelector,
  validateFormattingPatch,
  formattingPatchNeedsCharacter,
} from '../commands/atomic-formatting.ts';
import { assertFormattingAdmission } from '../commands/formatting-patch.ts';
import type {
  ApplyFormattingPatchPayload,
  FormattingCapabilities,
  FormattingCapabilityOptions,
  FormattingQueryResult,
  QueryFormattingOptions,
  SelectionAdmissionFence,
} from '../commands/formatting-patch.ts';
import { consumeNativeRuntimeOrigin } from '../internal/native-runtime-origin.ts';
import {
  createGeometryEvidenceController,
  bindGeometryProjectionPort,
} from '../internal/native-geometry-evidence.ts';
import type { NativeRuntimeOrigin } from '../internal/native-runtime-origin.ts';
import type { HistoryOptions } from '../history-options.ts';
import { EditorWritePolicy } from './write-policy.ts';
import type { SynchronousCallback, UpdateCallback } from '../state/synchronous-callback.ts';
import { SelectionHistory } from '../state/selection-history.ts';
import { createNewDocumentSelection } from './new-document-selection.ts';
import { loadSourceOptions } from './load-source-options.ts';
import { isWellFormedText } from '../state/text-scalar.ts';
import type {
  EditorRuntime,
  RuntimeFactory,
  RuntimeMessage,
  RuntimeReply,
  RuntimeRequestContext,
} from '../contracts.ts';
import { EditorState } from '../state/editor-state.ts';
import type { StateData, StateToken } from '../state/editor-state.ts';
import {
  copyOwned,
  discardPromise,
  freezeDTO,
  isPromiseLike,
  isOwnedImmutableObservation,
  ownObservation,
} from '../state/owned.ts';
import type {
  InputSurfaceHooks,
  InputSurfaceLease,
  SurfaceRequestOptions,
} from '../host-contracts.ts';
import { surfaceOperation } from '../commands/surface-protocol.ts';
import { CancellationFence, interruptible } from '../scheduler/cancellation.ts';
import { FifoScheduler } from '../scheduler/fifo.ts';
import { CommandRegistry } from '../commands/registry.ts';
import {
  SPLICE_TEXT_COMMAND,
  SET_NAMED_FIELD_VALUE_COMMAND,
  RENAME_NAMED_FIELD_COMMAND,
  EDIT_PARAGRAPH_BULLET_DEFINITION_COMMAND,
  CREATE_NAMED_FIELD_COMMAND,
  SET_NAMED_FIELD_PARAMETERS_COMMAND,
  INSERT_TABLE_COMMAND,
  EDIT_CREATED_TABLE_GRID_COMMAND,
  EDIT_SOURCE_TABLE_GRID_COMMAND,
  MERGE_SOURCE_TABLE_CELLS_COMMAND,
  SPLIT_SOURCE_TABLE_CELLS_COMMAND,
  EQUALIZE_SOURCE_TABLE_CELL_WIDTH_COMMAND,
  EQUALIZE_SOURCE_TABLE_CELL_HEIGHT_COMMAND,
  UNDO_COMMAND,
  REDO_COMMAND,
  SET_CHARACTER_PROPERTIES_COMMAND,
  SET_PARAGRAPH_ALIGNMENT_COMMAND,
  SET_CHARACTER_UNDERLINE_COMMAND,
  SET_CHARACTER_STRIKE_COMMAND,
  SET_CHARACTER_TEXT_COLOR_COMMAND,
  SET_CHARACTER_FONT_NAME_COMMAND,
  APPLY_FORMATTING_PATCH_COMMAND,
  REPLACE_ALL_COMMAND,
  INSERT_DOCUMENT_COMMAND,
} from '../commands/commands.ts';
import type {
  EditorCommand,
  SpliceTextPayload,
  HistoryPayload,
  SelectionTarget,
  SetCharacterPropertiesPayload,
  SetParagraphAlignmentPayload,
  SetCharacterUnderlinePayload,
  SetCharacterStrikePayload,
  SetCharacterTextColorPayload,
  SetCharacterFontNamePayload,
} from '../commands/commands.ts';
import { retryablePasswordReply, PasswordAttemptError } from './unlock-policy.ts';
import { formattingSelection } from '../state/formatting-selection.ts';
import { formattingMessage } from '../commands/formatting.ts';
import { underlineMessage } from '../commands/underline.ts';
import { fontNameMessage } from '../commands/font-name.ts';
import { tableInsertMessage } from '../commands/table-insert.ts';
import { captureSourceTableCellSplitPayload } from '../commands/source-table-cell-split.ts';
import type {
  SplitSourceTableCellsPayload,
  SourceTableCellSplitTarget,
} from '../commands/source-table-cell-split.ts';
import {
  sourceTableCellMergePlan,
  sourceTableCellSplitPlan,
} from '../commands/source-table-cell-merge.ts';
import type {
  SourceTableCellBlockWitness,
  SourceTableCellMergeTarget,
} from '../commands/source-table-cell-merge.ts';
import { sourceTableGridMessage } from '../commands/source-table-grid.ts';
import type { EditSourceTableGridPayload } from '../commands/source-table-grid.ts';
// @ts-ignore Preserve strict descriptors before the general payload copier normalizes them.
import { captureSourceTableGridRequest } from '../../../../js/source-table-grid.mjs';
import { createdTableGridMessage } from '../commands/created-table-grid.ts';
import type { EditCreatedTableGridPayload } from '../commands/created-table-grid.ts';
import type { InsertTablePayload } from '../commands/table-insert.ts';
import { textColorMessage } from '../commands/text-color.ts';
import { strikeMessage } from '../commands/strike.ts';
import { selectionMessage, validateSelection, validateToken } from '../commands/selection.ts';

export type CommandStatus =
  | 'rejected-unapplied'
  | 'committed-with-snapshot'
  | 'committed-refresh-required'
  | 'known-no-op'
  | 'handled-without-runtime';
export interface CommandResult {
  readonly status: CommandStatus;
  readonly context: RuntimeRequestContext;
  readonly state: EditorState;
  readonly error?: string;
  readonly changed: boolean | null;
  readonly reply?: RuntimeReply;
}
export interface UpdateResult {
  readonly results: readonly CommandResult[];
  readonly stoppedIndex: number | null;
  readonly state: EditorState;
}
export interface EditorError {
  readonly error: unknown;
  readonly context?: RuntimeRequestContext;
  readonly applied: boolean | 'unknown';
}
export interface LoadOptions {
  readonly format: 'hwp5' | 'hwpx';
  readonly history?: HistoryOptions;
  readonly editable?: boolean;
  readonly password?: string;
  readonly allowObservedChartOleDeviations?: boolean;
  readonly availableSectionCopy?: boolean;
  readonly enableOptions?: Readonly<Record<string, unknown>>;
}
export interface CreateDocumentOptions {
  readonly format?: 'hwp5' | 'hwpx';
  readonly history?: HistoryOptions;
  readonly editable?: boolean;
  readonly enableOptions?: Readonly<Record<string, unknown>>;
}
export interface SaveOptions {
  readonly token?: StateToken;
  readonly recovery?: boolean;
  readonly allowStaleLayout?: boolean;
  readonly allowUnprotectedOutput?: boolean;
}
export interface SelectionOptions {
  readonly stateVersion?: number;
}
export interface SaveResult {
  readonly bytes: Uint8Array;
  readonly documentId: string;
  readonly generation: number;
  readonly operationRevision: number;
  readonly nativeHistoryRevision?: number;
  readonly format: 'hwp5' | 'hwpx';
  readonly staleSnapshot: boolean;
  readonly layoutRequiresReflow?: boolean;
  readonly reply: RuntimeReply;
}
export interface ExperimentalOptions {
  readonly mutation: boolean;
  readonly token: StateToken;
}
export interface UpdateCollector {
  dispatchCommand<T>(command: EditorCommand<T>, payload: T): void;
}
export interface CreateEditorOptions {
  readonly runtimeFactory: RuntimeFactory;
  readonly editorId?: string;
  readonly onError?: (error: EditorError) => void;
}
interface PendingCommand {
  command: EditorCommand<unknown>;
  payload: unknown;
  token: StateToken;
  handlers: ReturnType<CommandRegistry['capture']>;
}
let nextEditorId = 0;
let nextEditorInstance = 0;
const usedRuntimes = new WeakSet<object>();
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));
const isWellFormed = isWellFormedText;
const isAsyncFunction = (callback: unknown) =>
  Object.prototype.toString.call(callback) === '[object AsyncFunction]';

/** Headless controller. Native sessions remain the sole document/save/history authority. */
export function createEditor(options: CreateEditorOptions) {
  const editorId = options.editorId ?? `hwpjs-editor-${++nextEditorId}`;
  if (nextEditorInstance >= Number.MAX_SAFE_INTEGER) throw Error('EditorIdentityExhausted');
  const instanceId = String(++nextEditorInstance);
  const queue = new FifoScheduler(),
    admission = new FifoScheduler(),
    registry = new CommandRegistry();
  const geometry = createGeometryEvidenceController();
  const takeGeometryOrigin = (
    runtime: EditorRuntime,
    reply: RuntimeReply,
    ctx: RuntimeRequestContext,
  ): NativeRuntimeOrigin | undefined => consumeNativeRuntimeOrigin(runtime, reply, ctx);
  const selectionHistory = new SelectionHistory();
  const writePolicy = new EditorWritePolicy();
  let active: EditorRuntime | undefined,
    locked:
      | {
          runtime: EditorRuntime;
          message: RuntimeMessage;
          context: RuntimeRequestContext;
          editable: boolean;
          enableOptions?: Readonly<Record<string, unknown>>;
          cancelled?: boolean;
        }
      | undefined;
  let terminal = false,
    disposePromise: Promise<void> | undefined,
    requestId = 0,
    nextGeneration = 0,
    revisionClock = 0,
    stateVersion = 0;
  let readDepth = 0,
    collecting = false,
    handling = false;
  const stateListeners = new Set<(state: EditorState) => unknown>(),
    updateListeners = new Set<(state: EditorState) => unknown>(),
    errorListeners = new Set<(event: EditorError) => unknown>();
  const released = new WeakSet<object>();
  const loads = new Set<{ cancelled: boolean; fence: CancellationFence }>();
  let surfaceEpoch = 0;
  type SurfaceRecord = {
    id: string;
    generation: number;
    active: boolean;
    hooks: InputSurfaceHooks;
    fence: CancellationFence;
  };
  let surface: SurfaceRecord | undefined;
  const disposedFence = new CancellationFence();
  const runRead = <T>(callback: (state: EditorState) => T, snapshot: EditorState): T => {
    if (typeof callback !== 'function') throw TypeError('InvalidReadCallback');
    if (isAsyncFunction(callback)) throw Error('AsyncRead');
    readDepth++;
    try {
      const result = callback(snapshot);
      if (isPromiseLike(result)) {
        discardPromise(result);
        throw Error('AsyncRead');
      }
      return result;
    } finally {
      readDepth--;
    }
  };
  let state = new EditorState(
    {
      editorId,
      documentId: null,
      generation: 0,
      operationRevision: 0,
      viewRevision: 0,
      stateVersion: 0,
      status: 'empty',
    },
    runRead,
  );
  function assertPublicMutation() {
    if (readDepth) {
      geometry.invalidate();
      throw Error('ReadMutation');
    }
    if (collecting) {
      geometry.invalidate();
      throw Error('CollectorOnly');
    }
    if (handling) {
      geometry.invalidate();
      throw Error('CommandHandlerMutation');
    }
  }
  function assertLive() {
    if (terminal) throw Error('EditorDisposed');
  }
  function notifyError(
    error: unknown,
    context?: RuntimeRequestContext,
    applied: boolean | 'unknown' = false,
  ) {
    geometry.invalidate();
    if (terminal) return;
    const event = Object.freeze({
      error,
      context: context ? Object.freeze({ ...context }) : undefined,
      applied,
    });
    const final = (cause: unknown) => {
      try {
        const value = options.onError?.(Object.freeze({ ...event, error: cause }));
        discardPromise(value);
      } catch {
        /* terminal sink */
      }
    };
    if (!errorListeners.size) {
      final(error);
      return;
    }
    // oxlint-disable-next-line unicorn/no-useless-spread -- 순회 중 리스너가 등록·해제되어도 접수 시점의 구독 목록을 순회하도록 snapshot을 유지한다.
    for (const listener of [...errorListeners]) {
      if (terminal) break;
      try {
        const result = listener(event);
        if (isPromiseLike(result)) void Promise.resolve(result).catch(final);
      } catch (cause) {
        final(cause);
      }
    }
  }
  function notify(
    listeners: readonly ((state: EditorState) => unknown)[],
    snapshot: EditorState,
    ctx?: RuntimeRequestContext,
    applied = false,
  ) {
    for (const listener of listeners) {
      if (terminal) break;
      try {
        const result = listener(snapshot);
        if (isPromiseLike(result))
          void Promise.resolve(result).catch((error) => notifyError(error, ctx, applied));
      } catch (error) {
        notifyError(error, ctx, applied);
      }
    }
  }
  function install(
    patch: Partial<StateData>,
    mutation = false,
    ctx?: RuntimeRequestContext,
    origin?: NativeRuntimeOrigin,
    transition?: { kind: string; capture?: object },
  ) {
    if (terminal) return;
    // Capture both sets before any callback changes registrations.
    const states = [...stateListeners],
      updates = mutation ? [...updateListeners] : [];
    const next: StateData = {
      editorId,
      documentId: state.documentId,
      generation: state.generation,
      operationRevision: state.operationRevision,
      viewRevision: state.viewRevision,
      stateVersion: ++stateVersion,
      status: state.status,
      content: state.content,
      capabilities: state.capabilities,
      historyRecoveryRequired: state.historyRecoveryRequired,
      nativeHistoryStats: state.nativeHistoryStats,
      nativeHistoryRevision: state.nativeHistoryRevision,
      nativeHistoryRevisions: state.nativeHistoryRevisions,
      savedOperationRevision: state.savedOperationRevision,
      selection: state.selection,
      ...patch,
    };
    const previousState = state;
    state = new EditorState(next, runRead);
    if (origin) geometry.publish(previousState, state, origin, transition);
    else if (!mutation && Object.keys(patch).length === 1 && Object.hasOwn(patch, 'selection'))
      geometry.inherit(previousState, state);
    else geometry.invalidate();
    selectionHistory.observe(state);
    const snapshot = state;
    notify(states, snapshot, ctx, mutation);
    notify(updates, snapshot, ctx, mutation);
  }
  function context(token: StateToken = state.token): RuntimeRequestContext {
    return {
      editorId,
      documentId: token.documentId,
      generation: token.generation,
      requestId: ++requestId,
      operationRevision: token.operationRevision,
    };
  }
  function verifyReply(reply: RuntimeReply, ctx: RuntimeRequestContext) {
    if (!reply || typeof reply !== 'object' || typeof reply.kind !== 'string')
      throw Error('InvalidRuntimeReply');
    const returned = reply.meta?.context;
    if (
      returned &&
      (['editorId', 'documentId', 'generation', 'requestId', 'operationRevision'] as const).some(
        (key) => returned[key] !== ctx[key],
      )
    )
      throw Error('MismatchedRuntimeReply');
  }
  async function release(runtime: EditorRuntime | undefined) {
    if (!runtime || released.has(runtime)) return;
    released.add(runtime);
    await runtime.dispose();
  }
  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    if (terminal) return Promise.reject(Error('EditorDisposed'));
    return queue.enqueue(async () => {
      assertLive();
      return task();
    });
  }
  function assertSurface(record: SurfaceRecord) {
    assertLive();
    if (!record.active || surface !== record) throw Error('InputSurfaceDetached');
  }
  function cancelComposition(
    record: SurfaceRecord,
    reason: 'detach' | 'load' | 'external-replace' | 'dispose',
  ) {
    try {
      record.hooks.cancelComposition(reason);
    } catch (error) {
      notifyError(error);
      if (reason === 'load' || reason === 'external-replace') throw error;
    }
  }
  /** Admission serializes external work, but never occupies Native's queue while flushing input. */
  function admit<T>(
    task: () => Promise<T>,
    settings: {
      replace?: 'load' | 'external-replace';
      abort?: CancellationFence;
      guard?: () => void;
    } = {},
  ): Promise<T> {
    if (terminal) return Promise.reject(Error('EditorDisposed'));
    return admission.enqueue(async () => {
      assertLive();
      settings.guard?.();
      const record = surface;
      if (record) {
        assertSurface(record);
        const settlement = Promise.resolve().then(() => {
          assertSurface(record);
          return record.hooks.commitComposition();
        });
        const interruptions = [
          { fence: disposedFence, error: 'EditorDisposed' },
          { fence: record.fence, error: 'InputSurfaceDetached' },
        ];
        if (settings.abort) interruptions.push({ fence: settings.abort, error: 'LoadCancelled' });
        const outcome = await interruptible(settlement, interruptions);
        assertLive();
        assertSurface(record);
        settings.guard?.();
        if (outcome !== 'committed' && outcome !== 'unchanged') throw Error('CompositionBlocked');
        if (settings.replace) cancelComposition(record, settings.replace);
      }
      assertLive();
      settings.guard?.();
      return enqueue(async () => {
        if (record) assertSurface(record);
        else if (surface) throw Error('InputSurfaceChanged');
        return task();
      });
    });
  }
  async function newRuntime() {
    const runtime = await options.runtimeFactory();
    if (!runtime || typeof runtime.request !== 'function' || typeof runtime.dispose !== 'function')
      throw Error('InvalidRuntime');
    if (usedRuntimes.has(runtime)) throw Error('RuntimeAlreadyOwned');
    usedRuntimes.add(runtime);
    return runtime;
  }
  function history(reply: RuntimeReply) {
    return Number.isSafeInteger(reply.historyRevision) ? reply.historyRevision : undefined;
  }
  function assembleCapabilities(reply: RuntimeReply, inherit = true): unknown {
    return (
      reply.capabilities ?? {
        ...(inherit && state.documentId !== null ? (state.capabilities as object) : {}),
        ...Object.fromEntries(
          Object.entries(reply).filter(
            ([key]) =>
              ![
                'content',
                'kind',
                'error',
                'applied',
                'bytes',
                'meta',
                'origin',
                'requestId',
                'historyRevision',
                'historyRevisions',
                'historyStats',
                'nativeTextDelta',
                'historyPoisoned',
              ].includes(key),
          ),
        ),
      }
    );
  }
  function observeCapabilities(value: unknown, editable?: boolean, reuseCurrent = false): unknown {
    const projected = writePolicy.capabilities(value, editable);
    const previousValue = reuseCurrent ? state.capabilities : undefined;
    const plainRecord = (value: unknown): value is Record<string, unknown> => {
      if (value === null || typeof value !== 'object') return false;
      const proto = Object.getPrototypeOf(value);
      return proto === Object.prototype || proto === null;
    };
    if (
      reuseCurrent &&
      isOwnedImmutableObservation(previousValue) &&
      plainRecord(previousValue) &&
      plainRecord(projected)
    ) {
      const previous = Object.getOwnPropertyDescriptors(previousValue);
      const next = Object.getOwnPropertyDescriptors(projected);
      const keys = Reflect.ownKeys(next);
      if (
        keys.length === Reflect.ownKeys(previous).length &&
        keys.every(
          (key) =>
            Object.hasOwn(previous, key) &&
            'value' in previous[key as string] &&
            'value' in next[key as string] &&
            Object.is(previous[key as string].value, next[key as string].value),
        )
      )
        return previousValue;
    }
    return ownObservation(projected)();
  }
  function contentPatch(
    reply: RuntimeReply,
    inherit = true,
    editable?: boolean,
  ): Partial<StateData> {
    if (reply.content === undefined) throw Error('SnapshotMissing');
    const historyRecoveryRequired =
      (inherit && state.historyRecoveryRequired) ||
      reply.historyPoisoned === true ||
      reply.historyStats?.poisoned === true;
    const observedEditable = historyRecoveryRequired ? false : editable;
    const capabilities = assembleCapabilities(reply, inherit);
    return {
      content: ownObservation(writePolicy.observe(reply.content, observedEditable))(),
      capabilities: observeCapabilities(capabilities, observedEditable),
      historyRecoveryRequired,
      nativeHistoryStats: reply.historyStats,
      nativeHistoryRevision: history(reply),
      nativeHistoryRevisions: reply.historyRevisions,
      selection: undefined,
      viewRevision: state.viewRevision + 1,
    };
  }
  async function finishCandidate(
    runtime: EditorRuntime,
    message: RuntimeMessage,
    ctx: RuntimeRequestContext,
    editable: boolean,
    enableOptions?: Readonly<Record<string, unknown>>,
    first?: RuntimeReply,
    guard: () => void = () => {},
    initializeNewDocument = false,
  ): Promise<EditorState> {
    let publicationContext = ctx;
    let reply = first ?? (await runtime.request(message, ctx));
    verifyReply(reply, ctx);
    if (reply.error) throw Error(reply.error);
    if (editable) {
      const enableContext = { ...ctx, requestId: ++requestId };
      publicationContext = enableContext;
      reply = await runtime.request({ ...enableOptions, kind: 'enable' }, enableContext);
      verifyReply(reply, enableContext);
      if (reply.error) throw Error(reply.error);
    }
    if (reply.historyPoisoned === true || reply.historyStats?.poisoned === true)
      throw Error('HistoryReloadRequired');
    const patch = contentPatch(reply, false, editable);
    assertLive();
    guard();
    // Build/copy the public snapshot before giving up the prior session.
    const nextRevision = ++revisionClock;
    const nextData = {
      ...patch,
      documentId: ctx.documentId,
      generation: ctx.generation,
      operationRevision: nextRevision,
      savedOperationRevision: nextRevision,
      status: 'ready' as const,
    };
    const candidateState = new EditorState(
      {
        editorId,
        viewRevision: state.viewRevision + 1,
        stateVersion: stateVersion + 1,
        ...nextData,
      },
      runRead,
    );
    if (initializeNewDocument && editable)
      nextData.selection = createNewDocumentSelection(candidateState);
    const previous = active;
    writePolicy.publish(editable, () => {
      active = runtime;
      try {
        install(nextData, true, ctx, takeGeometryOrigin(runtime, reply, publicationContext));
      } catch (error) {
        active = previous;
        throw error;
      }
    });
    try {
      await release(previous);
    } catch (error) {
      notifyError(error, ctx);
    }
    return state;
  }
  function load(input: Uint8Array | ArrayBuffer, loadOptions: LoadOptions): Promise<EditorState> {
    assertPublicMutation();
    return loadSource(copyOwned(input), loadOptions);
  }
  function createDocument(createOptions: CreateDocumentOptions = {}): Promise<EditorState> {
    assertPublicMutation();
    const owned = copyOwned(createOptions);
    const format = owned.format ?? 'hwpx';
    if (!['hwp5', 'hwpx'].includes(format)) throw Error('InvalidDocumentFormat');
    const producer = options.runtimeFactory.createDocumentBytes;
    if (typeof producer !== 'function') throw Error('NewDocumentUnsupported');
    return loadSource(undefined, { ...owned, format }, () =>
      producer.call(options.runtimeFactory, format),
    );
  }
  function loadSource(
    input: Uint8Array | ArrayBuffer | undefined,
    loadOptions: LoadOptions,
    producer?: () => Promise<Uint8Array>,
  ): Promise<EditorState> {
    assertPublicMutation();
    let bytes = input;
    if (!producer && !(bytes instanceof Uint8Array) && !(bytes instanceof ArrayBuffer))
      throw TypeError('InvalidDocumentBytes');
    const clearBytes = () => {
      if (bytes instanceof Uint8Array) bytes.fill(0);
      else if (bytes instanceof ArrayBuffer) new Uint8Array(bytes).fill(0);
    };
    const owned = copyOwned(loadOptions);
    if (!owned || !['hwp5', 'hwpx'].includes(owned.format)) throw Error('InvalidDocumentFormat');
    if (owned.history !== undefined && Object.hasOwn(owned.enableOptions ?? {}, 'history'))
      throw Error('DuplicateHistoryOptions');
    const enableOptions =
      owned.history === undefined
        ? owned.enableOptions
        : { ...owned.enableOptions, history: owned.history };
    const sourceOptions = loadSourceOptions(owned);
    const cancellation = new CancellationFence();
    const job = { cancelled: false, fence: cancellation };
    loads.add(job);
    const guard = () => {
      if (job.cancelled) throw Error('LoadCancelled');
    };
    const tokenGeneration = ++nextGeneration,
      documentId = `${editorId}:instance:${instanceId}:document:${tokenGeneration}`;
    const message: RuntimeMessage = {
      kind: 'load',
      bytes,
      format: owned.format,
      ...sourceOptions,
      ...(owned.password === undefined ? {} : { password: owned.password }),
      ...(owned.allowObservedChartOleDeviations === undefined
        ? {}
        : { allowObservedChartOleDeviations: owned.allowObservedChartOleDeviations }),
    };
    return admit(
      async () => {
        const previousState = state;
        install({ status: 'loading' });
        let candidate: EditorRuntime | undefined,
          keepLocked = false;
        const ctx: RuntimeRequestContext = {
          editorId,
          documentId,
          generation: tokenGeneration,
          requestId: ++requestId,
          operationRevision: 0,
        };
        try {
          if (locked) {
            const old = locked;
            locked = undefined;
            await release(old.runtime);
          }
          guard();
          if (producer) {
            const producing = Promise.resolve()
              .then(producer)
              .then((result) => {
                if (!(result instanceof Uint8Array)) throw TypeError('InvalidDocumentBytes');
                bytes = result;
                if (job.cancelled || terminal) {
                  result.fill(0);
                  throw Error(terminal ? 'EditorDisposed' : 'LoadCancelled');
                }
                return result;
              });
            bytes = await interruptible(producing, [
              { fence: cancellation, error: 'LoadCancelled' },
              { fence: disposedFence, error: 'EditorDisposed' },
            ]);
            message.bytes = bytes;
            assertLive();
            guard();
          }
          candidate = await newRuntime();
          assertLive();
          guard();
          const reply = await candidate.request(message, ctx);
          verifyReply(reply, ctx);
          assertLive();
          guard();
          if (reply.error) {
            if (reply.passwordRequired === true) {
              locked = {
                runtime: candidate,
                message: { ...message, password: undefined },
                context: ctx,
                editable: owned.editable !== false,
                enableOptions,
              };
              keepLocked = true;
            }
            throw Error(reply.error);
          }
          return await finishCandidate(
            candidate,
            message,
            ctx,
            owned.editable !== false,
            enableOptions,
            reply,
            guard,
            producer !== undefined,
          );
        } catch (error) {
          if (!terminal) install({ status: previousState.status });
          notifyError(error, ctx);
          throw error;
        } finally {
          if (candidate && candidate !== active && !keepLocked) await release(candidate);
          clearBytes();
          delete message.password;
          loads.delete(job);
        }
      },
      { replace: 'load', abort: cancellation, guard },
    ).finally(() => {
      loads.delete(job);
      clearBytes();
      delete message.password;
    });
  }
  function unlock(
    password: string,
    unlockOptions: Readonly<Record<string, unknown>> = {},
  ): Promise<EditorState> {
    assertPublicMutation();
    if (typeof password !== 'string') throw TypeError('InvalidPassword');
    const owned = copyOwned(unlockOptions);
    return admit(
      async () => {
        const candidate = locked;
        if (!candidate) throw Error('NoLockedCandidate');
        const ctx = { ...candidate.context, requestId: ++requestId };
        let retryable = false;
        try {
          const reply = await candidate.runtime.request(
            { ...owned, kind: 'unlock', password },
            ctx,
          );
          verifyReply(reply, ctx);
          if (reply.error) {
            retryable = retryablePasswordReply(reply);
            throw Error(reply.error);
          }
          assertLive();
          const result = await finishCandidate(
            candidate.runtime,
            candidate.message,
            ctx,
            candidate.editable,
            candidate.enableOptions,
            reply,
            () => {
              if (candidate.cancelled) throw Error('LoadCancelled');
            },
          );
          locked = undefined;
          return result;
        } catch (error) {
          if (retryable && locked === candidate && !candidate.cancelled && !terminal) {
            const retry = new PasswordAttemptError(errorText(error));
            notifyError(retry, ctx, false);
            throw retry;
          }
          if (locked === candidate) locked = undefined;
          await release(candidate.runtime);
          notifyError(error, ctx);
          throw error;
        }
      },
      { replace: 'external-replace' },
    );
  }
  function cancelLoad(): Promise<void> {
    assertPublicMutation();
    for (const job of loads) {
      job.cancelled = true;
      job.fence.cancel();
    }
    if (locked) locked.cancelled = true;
    return enqueue(async () => {
      const candidate = locked;
      locked = undefined;
      await release(candidate?.runtime);
    });
  }
  function result(
    status: CommandStatus,
    ctx: RuntimeRequestContext,
    error?: unknown,
    reply?: RuntimeReply,
  ): CommandResult {
    let ownedReply: RuntimeReply | undefined;
    try {
      if (reply !== undefined) ownedReply = freezeDTO(copyOwned(reply, true));
    } catch (metadataError) {
      notifyError(metadataError, ctx, status.startsWith('committed'));
    }
    const answer = {
      status,
      context: Object.freeze({ ...ctx }),
      state,
      error: error === undefined ? undefined : errorText(error),
      changed: reply?.meta?.changed ?? null,
      reply: ownedReply,
    };
    return Object.freeze(answer);
  }
  function reject(ctx: RuntimeRequestContext, error: unknown) {
    notifyError(error, ctx, false);
    return result('rejected-unapplied', ctx, error);
  }
  function requireReady(token: StateToken, view = false) {
    assertLive();
    if (state.historyRecoveryRequired || state.nativeHistoryStats?.poisoned === true)
      throw Error('HistoryReloadRequired');
    if (!active || state.status !== 'ready')
      throw Error(state.status === 'refresh-required' ? 'RefreshRequired' : 'EditorNotReady');
    validateToken(token, state, view);
  }
  async function mutate(
    message: RuntimeMessage,
    token: StateToken,
    preserveFormattingSelection = false,
    admissionGuard?: () => void,
  ): Promise<CommandResult> {
    const ctx = context(token);
    let reserved: number | undefined, reply: RuntimeReply | undefined;
    try {
      requireReady(token);
      writePolicy.assertWritable();
      if (message.kind === 'source-table-grid') {
        requireReady(token, true);
        if ((state.content as any)?.sourceTableGridAvailable !== true)
          throw Error('SourceTableGridUnavailable');
      }
      admissionGuard?.();
      reserved = ++revisionClock;
      const historyCapture = geometry.captureHistory(state, message.kind);
      const exclusiveCapture = geometry.captureExclusive(state);
      const priorProjection = exclusiveCapture?.projection;
      const historyProjection = geometry.historyWindowHint(state, historyCapture);
      const projectionPreference =
        historyProjection &&
        isPlainOwnerBaseline(
          state.content,
          historyProjection.owner.section,
          historyProjection.owner.paragraph,
        )
          ? historyProjection
          : undefined;
      const projectionRequested =
        ['splice', 'splice-current'].includes(message.kind) &&
        !!priorProjection &&
        !(state.content as any)?.readOnly &&
        !(state.content as any)?.window &&
        isPlainOwnerBaseline(state.content, (message as any).section, (message as any).paragraph);
      // Once request() begins, an exception cannot prove that Native did not apply.
      try {
        reply =
          admissionGuard ||
          ((projectionRequested || projectionPreference) && hasRuntimeAdmission(active!))
            ? await requestAtRuntimeAdmission(
                active!,
                message,
                ctx,
                admissionGuard ?? (() => {}),
                projectionPreference ?? projectionRequested,
              )
            : await active!.request(message, ctx);
        verifyReply(reply, ctx);
        if (
          [
            'insert-document',
            'source-table-grid',
            'source-table-cell-merge',
            'source-table-cell-split',
            'source-table-cell-width',
            'source-table-cell-height',
          ].includes(message.kind) &&
          reply.kind !== message.kind
        )
          throw Error('MismatchedRuntimeReply');
      } catch (error) {
        if (error instanceof RuntimeAdmissionRejected) return reject(ctx, error);
        install({ operationRevision: reserved, status: 'refresh-required' });
        notifyError(error, ctx, 'unknown');
        return result('committed-refresh-required', ctx, error);
      }
      const application =
        reply.meta?.application ??
        (reply.applied === true
          ? 'applied'
          : reply.error && reply.applied === false
            ? 'unapplied'
            : undefined);
      if (reply.historyPoisoned === true || reply.historyStats?.poisoned === true) {
        install({
          content: ownObservation(writePolicy.observe(state.content, false))(),
          capabilities: ownObservation(writePolicy.capabilities(state.capabilities, false))(),
          operationRevision: application === 'unapplied' ? state.operationRevision : reserved,
          status: 'refresh-required',
          historyRecoveryRequired: true,
          nativeHistoryStats: reply.historyStats,
          nativeHistoryRevision: history(reply),
        });
        const failure = reply.error ?? 'HistoryReloadRequired';
        notifyError(failure, ctx, application === 'unapplied' ? false : 'unknown');
        return result(
          application === 'unapplied' ? 'rejected-unapplied' : 'committed-refresh-required',
          ctx,
          failure,
          reply,
        );
      }
      if (application === 'unapplied') {
        if (
          [
            'formatting-patch',
            'independent-text',
            'splice-rich-character',
            'insert-document',
          ].includes(message.kind) &&
          reply.formattingRefreshRequired === true
        )
          install({ status: 'refresh-required' });
        if (
          [
            'formatting-patch',
            'independent-text',
            'splice-rich-character',
            'insert-document',
          ].includes(message.kind) &&
          reply.formattingNativeCode === 2
        ) {
          if (reply.error) notifyError(reply.error, ctx, false);
          return result('known-no-op', ctx, reply.error, reply);
        }
        if (
          [
            'formatting-patch',
            'independent-text',
            'splice-rich-character',
            'insert-document',
          ].includes(message.kind) &&
          reply.error
        ) {
          notifyError(reply.error, ctx, false);
          return result('rejected-unapplied', ctx, reply.error, reply);
        }
        if (reply.error) return reject(ctx, reply.error);
        return result('known-no-op', ctx, undefined, reply);
      }
      const noOp = !reply.error && (reply.meta?.changed === false || reply.changed === false);
      if (noOp) {
        geometry.invalidate();
        return result('known-no-op', ctx, undefined, reply);
      }
      if (reply.error || reply.content === undefined) {
        install({
          operationRevision: reserved,
          status: 'refresh-required',
          nativeHistoryStats: reply.historyStats,
          nativeHistoryRevision: history(reply),
        });
        notifyError(
          reply.error ?? 'SnapshotMissing',
          ctx,
          application === 'applied' ? true : 'unknown',
        );
        return result('committed-refresh-required', ctx, reply.error ?? 'SnapshotMissing', reply);
      }
      try {
        const mutationReply = reply;
        let origin = takeGeometryOrigin(active!, reply, ctx);
        let merged: any;
        if ((reply.content as any)?.viewKind === 'history-owner-window') {
          requireReady(token);
          merged = geometry.mergeHistoryWindow(state, reply.content, origin, historyCapture, reply);
          if (!merged) {
            geometry.invalidate();
            // The history mutation already ran once. Only read the actual full Native view.
            reply = await active!.request({ kind: 'refresh' }, ctx);
            verifyReply(reply, ctx);
            requireReady(token);
            if (reply.error || !reply.content || (reply.content as any).viewKind)
              throw Error('HistoryWindowFallbackFailed');
            origin = takeGeometryOrigin(active!, reply, ctx);
          }
        }
        if ((reply.content as any)?.viewKind === 'owner-window-patch') {
          requireReady(token);
          if (priorProjection && origin)
            merged = mergeExclusiveOwnerWindow(state, reply.content as any, origin, {
              context: ctx,
              sequence: exclusiveCapture!.sequence + 1,
              revision: state.nativeHistoryRevision,
              epoch: priorProjection.evidence.nativeEpoch,
              referenceScope: priorProjection.evidence.scope.referenceScope,
            });
          if (!merged) {
            reply = await active!.request({ kind: 'refresh' }, ctx);
            verifyReply(reply, ctx);
            requireReady(token);
            if (reply.error || !reply.content || (reply.content as any).viewKind)
              throw Error('OwnerProjectionFallbackFailed');
            origin = takeGeometryOrigin(active!, reply, ctx);
          }
        }
        const patch = merged
          ? {
              content: merged,
              capabilities: observeCapabilities(assembleCapabilities(reply), undefined, true),
              historyRecoveryRequired: false,
              nativeHistoryStats: reply.historyStats,
              nativeHistoryRevision: history(reply),
              nativeHistoryRevisions: reply.historyRevisions,
              selection: undefined,
              viewRevision: state.viewRevision + 1,
            }
          : contentPatch(reply);
        let selection: SelectionTarget | null | undefined = preserveFormattingSelection
          ? formattingSelection(state, patch, reserved)
          : undefined;
        if (message.kind === 'undo' || message.kind === 'redo') {
          const provisional = new EditorState(
            {
              ...state.token,
              ...patch,
              operationRevision: reserved,
              stateVersion: state.stateVersion + 1,
              status: 'ready',
            },
            runRead,
          );
          selection = selectionHistory.restore(provisional);
        }
        install(
          { ...patch, selection, operationRevision: reserved, status: 'ready' },
          true,
          ctx,
          origin,
          { kind: message.kind, capture: historyCapture },
        );
        // Canonical origin was consumed from raw reply once. Compatibility receives full DTO.
        if (
          ['owner-window-patch', 'history-owner-window'].includes(
            (mutationReply.content as any)?.viewKind,
          )
        ) {
          reply = {
            ...mutationReply,
            content: state.content,
            ...(reply.historyStats === undefined ? {} : { historyStats: reply.historyStats }),
            ...(reply.historyRevision === undefined
              ? {}
              : { historyRevision: reply.historyRevision }),
            ...(reply.historyRevisions === undefined
              ? {}
              : { historyRevisions: reply.historyRevisions }),
            ...(reply.historyPoisoned === undefined
              ? {}
              : { historyPoisoned: reply.historyPoisoned }),
          };
        }
      } catch (error) {
        install({ operationRevision: reserved, status: 'refresh-required' });
        notifyError(error, ctx, true);
        return result('committed-refresh-required', ctx, error);
      }
      return result('committed-with-snapshot', ctx, undefined, reply);
    } catch (error) {
      return reject(ctx, error);
    }
  }
  const mergeTargets = new WeakMap<
    object,
    {
      kind: 'merge' | 'split';
      state: EditorState;
      plan: ReturnType<typeof sourceTableCellSplitPlan>;
      current: () => boolean;
    }
  >();
  const widthTargets = new WeakMap<
    SourceTableCellWidthTarget,
    {
      state: EditorState;
      plan: ReturnType<typeof sourceTableCellWidthRequest>;
      current: () => boolean;
    }
  >();
  const heightTargets = new WeakMap<
    SourceTableCellHeightTarget,
    {
      state: EditorState;
      plan: ReturnType<typeof sourceTableCellHeightRequest>;
      current: () => boolean;
    }
  >();
  const pageSettingsTargets = new WeakMap<
    PageSettingsTarget,
    { state: EditorState; native: PageSettingsCapabilities; section: number | null }
  >();
  function capture<T>(
    command: EditorCommand<T>,
    payload: T,
    snapshot: EditorState = state,
  ): PendingCommand {
    if (!command || typeof command.id !== 'symbol') throw Error('InvalidCommand');
    const split = command.id === SPLIT_SOURCE_TABLE_CELLS_COMMAND.id;
    const merge = command.id === MERGE_SOURCE_TABLE_CELLS_COMMAND.id;
    const width = command.id === EQUALIZE_SOURCE_TABLE_CELL_WIDTH_COMMAND.id;
    const height = command.id === EQUALIZE_SOURCE_TABLE_CELL_HEIGHT_COMMAND.id;
    const pageSettings = command.id === EDIT_PAGE_SETTINGS_COMMAND.id;
    const tableCell = merge || split || width || height || pageSettings;
    const owned = pageSettings
      ? capturePageSettingsPayload(payload)
      : split
        ? captureSourceTableCellSplitPayload(payload)
        : merge || width || height
          ? payload
          : command.id === EDIT_SOURCE_TABLE_GRID_COMMAND.id
            ? captureSourceTableGridRequest(payload, (snapshot.content as any)?.format)
            : command.id === INSERT_DOCUMENT_COMMAND.id
              ? captureDocumentInsertPayload(payload)
              : copyOwned(payload);
    return {
      command: command as EditorCommand<unknown>,
      payload: owned,
      token: tableCell
        ? snapshot.token
        : ((owned as { target?: StateToken; token?: StateToken })?.target ??
          (owned as { token?: StateToken })?.token ??
          snapshot.token),
      handlers: registry.capture(command),
    };
  }
  async function execute(pending: PendingCommand): Promise<CommandResult> {
    const ctx = context(pending.token);
    try {
      requireReady(pending.token);
      handling = true;
      let handled: boolean;
      try {
        handled = registry.run(pending.handlers, pending.payload, (v) => copyOwned(v));
      } finally {
        handling = false;
      }
      assertLive();
      if (handled) return result('handled-without-runtime', ctx);
      writePolicy.assertWritable();
      if (pending.command.id === INSERT_DOCUMENT_COMMAND.id) {
        const payload = pending.payload as InsertDocumentPayload;
        const guard = () => {
          requireReady(payload.target, true);
          currentDocumentInsertCaret(state, payload.target, payload.selectionVersion);
        };
        guard();
        const admission = await readDocumentInsertCapability(payload.target, guard);
        if ('reason' in admission) throw Error(admission.reason);
        return await mutate(
          documentInsertMessage(payload, admission),
          payload.target,
          false,
          guard,
        );
      }
      if (pending.command.id === REPLACE_ALL_COMMAND.id) {
        const payload = pending.payload as ReplaceAllPlanRequest;
        const guard = () => {
          requireReady(payload.layoutToken, true);
          if (state.stateVersion !== payload.stateVersion) throw Error('StaleReplaceAllPlan');
        };
        guard();
        const plan = planReplaceAll(state, payload);
        const prepared = await readRequest(
          { kind: 'prepare-replace-all', plan },
          payload.layoutToken,
          guard,
          true,
        );
        guard();
        // Coverage is still verified for zero matches. A no-op must retain redo.
        if (plan.status === 'known-no-op') return result('known-no-op', ctx, undefined, prepared);
        if (!prepared.textTransaction) throw Error('MalformedTextTransactionQuery');
        return await mutate(
          { kind: 'independent-text', request: prepared.textTransaction },
          payload.layoutToken,
          false,
          guard,
        );
      }
      if (pending.command.id === APPLY_FORMATTING_PATCH_COMMAND.id) {
        const payload = pending.payload as ApplyFormattingPatchPayload;
        if (
          !payload ||
          Object.keys(payload).some((key) => !['target', 'patch', 'selectionVersion'].includes(key))
        )
          throw Error('InvalidFormattingPatch');
        validateFormattingPatch(payload.patch);
        const selector = atomicSelector(
          payload.target,
          state,
          true,
          formattingPatchNeedsCharacter(payload.patch),
        );
        const capability = await readFormattingCapabilities(payload.target);
        if (!capability.atomic) throw Error(capability.reason);
        const guard = () => {
          requireReady(payload.target, true);
          assertFormattingAdmission(
            payload,
            state.stateVersion,
            capability.selectionAdmissionFence,
          );
        };
        guard();
        const prepared = await readRequest(
          { kind: 'query-formatting', selector, fields: [] },
          payload.target,
          guard,
          true,
        );
        guard();
        const value = checkedFormattingQuery(prepared.formatting);
        if (value.binding.revision === null) throw Error('InvalidFormattingBinding');
        return await mutate(
          {
            kind: 'formatting-patch',
            request: {
              schemaVersion: 1,
              binding: value.binding,
              targets: value.targets,
              patch: payload.patch,
            },
          },
          payload.target,
          true,
          guard,
        );
      }
      if (pending.command.id === SET_NAMED_FIELD_PARAMETERS_COMMAND.id) {
        const payload = pending.payload as SetNamedFieldParametersPayload;
        if (
          !payload?.token ||
          !Number.isSafeInteger(payload.selectionVersion) ||
          payload.selectionVersion < 0 ||
          typeof payload.direction !== 'string' ||
          typeof payload.memo !== 'string' ||
          !isWellFormedText(payload.direction) ||
          !isWellFormedText(payload.memo)
        )
          throw Error('InvalidNamedFieldParametersCommand');
        const expected = checkedNamedFieldParameterValues(payload.expected);
        const kind = 'set-named-field-parameters';
        if ((state.content as any)?.format !== 'hwpx' || !hasRuntimeAdmission(active, kind))
          throw Error('NamedFieldParametersUnavailable');
        const selector = checkedNamedFieldSelector(payload.selector);
        const guard = () => {
          requireReady(payload.token, true);
          if (state.stateVersion !== payload.selectionVersion)
            throw Error('StaleNamedFieldSelection');
        };
        guard();
        const inventory = await readNamedFieldInventory(payload.token);
        guard();
        const resolved = resolveNamedField(inventory, selector);
        if (resolved.status === 'incomplete') throw Error('IncompleteNamedFieldInventory');
        if (resolved.status === 'ambiguous') throw Error('AmbiguousNamedField');
        if (resolved.status === 'missing') throw Error('NamedFieldMissing');
        const { field } = resolved;
        if (field.protection === 'protected') throw Error('NamedFieldProtected');
        if (!field.canSetValue || !field.target) throw Error('NamedFieldParametersUnavailable');
        validateSelection(field.target, state, true);
        const { section, paragraph, startUnit, endUnit } = field.target;
        return await mutate(
          {
            kind,
            id: field.id,
            name: selector.name,
            occurrence: selector.occurrence,
            section,
            paragraph,
            startUnit,
            endUnit,
            expected,
            direction: payload.direction,
            memo: payload.memo,
          },
          payload.token,
          false,
          guard,
        );
      }
      if (pending.command.id === EDIT_PAGE_SETTINGS_COMMAND.id) {
        const payload = pending.payload as EditPageSettingsPayload;
        const capture = pageSettingsTargets.get(payload.target);
        if (!capture) throw Error('ForeignPageSettingsTarget');
        const guard = () => {
          requireReady(capture.state.token, true);
          if (state !== capture.state) throw Error('StalePageSettingsTarget');
        };
        guard();
        if (!hasRuntimeAdmission(active, 'write-page-settings'))
          throw Error('UnsupportedAtomicRuntime');
        const rows = capture.native.sections;
        const selected =
          payload.scope === 'document' ? rows : rows.filter((r) => r.section === capture.section);
        if (selected.length === 0 || selected.some((r) => !r.target))
          throw Error('UnsupportedPageSettingsOwner');
        return await mutate(
          {
            kind: 'write-page-settings',
            request: {
              binding: capture.native.binding,
              scope: payload.scope,
              targets: selected.map((r) => r.target),
              values: payload.values,
            },
          },
          capture.state.token,
          true,
          guard,
        );
      }
      if (pending.command.id === EDIT_PARAGRAPH_BULLET_DEFINITION_COMMAND.id) {
        const payload = pending.payload as EditParagraphBulletDefinitionPayload;
        if (
          !payload?.target ||
          Object.keys(payload).some((k) => !['target', 'selectionVersion', 'edit'].includes(k)) ||
          !Number.isSafeInteger(payload.selectionVersion) ||
          payload.selectionVersion < 0
        )
          throw Error('InvalidBulletDefinitionRequest');
        checkedBulletDefinitionEdit(payload.edit);
        const kind = 'edit-paragraph-bullet-definition';
        if (!hasRuntimeAdmission(active, kind) || !['hwpx', 'hwp5'].includes(payload.target.format))
          throw Error('BulletDefinitionWriteUnavailable');
        const guard = () => {
          requireReady(payload.target, true);
          if (state.stateVersion !== payload.selectionVersion)
            throw Error('StaleBulletDefinitionSelection');
          const row = validateSelection(payload.target, state);
          if (payload.target.owner !== `section:${payload.target.section}:body` || row.createdCell)
            throw Error('UnsupportedBulletOwner');
        };
        guard();
        return await mutate(
          {
            kind,
            section: payload.target.section,
            paragraph: payload.target.paragraph,
            edit: payload.edit,
          },
          payload.target,
          true,
          guard,
        );
      }
      if (pending.command.id === CREATE_NAMED_FIELD_COMMAND.id) {
        const payload = pending.payload as CreateNamedFieldPayload;
        if (
          !payload?.target ||
          !Number.isSafeInteger(payload.selectionVersion) ||
          payload.selectionVersion < 0 ||
          typeof payload.expectedText !== 'string' ||
          !isWellFormedText(payload.expectedText) ||
          [payload.direction, payload.memo].some(
            (value) =>
              value !== undefined && (typeof value !== 'string' || !isWellFormedText(value)),
          )
        )
          throw Error('InvalidNamedFieldCreateCommand');
        if (
          typeof payload.name !== 'string' ||
          !/[^ \t\r\n]/.test(payload.name) ||
          !isWellFormedText(payload.name)
        )
          throw Error('InvalidNamedFieldName');
        const kind = 'create-named-field';
        if (!hasRuntimeAdmission(active, kind) || payload.target.format !== 'hwpx')
          throw Error('NamedFieldCreateUnavailable');
        const { section, paragraph, startUnit, endUnit } = payload.target;
        const guard = () => {
          requireReady(payload.target, true);
          if (state.stateVersion !== payload.selectionVersion)
            throw Error('StaleNamedFieldSelection');
          const row = validateSelection(payload.target, state);
          if (payload.target.owner !== `section:${section}:body` || row.createdCell)
            throw Error('UnsupportedNamedFieldCreateOwner');
          if (row.text.slice(startUnit, endUnit) !== payload.expectedText)
            throw Error('NamedFieldValueMismatch');
        };
        guard();
        return await mutate(
          {
            kind,
            section,
            paragraph,
            startUnit,
            endUnit,
            expectedText: payload.expectedText,
            name: payload.name,
            direction: payload.direction,
            memo: payload.memo,
          },
          payload.target,
          false,
          guard,
        );
      }
      if (
        pending.command.id === SET_NAMED_FIELD_VALUE_COMMAND.id ||
        pending.command.id === RENAME_NAMED_FIELD_COMMAND.id
      ) {
        const rename = pending.command.id === RENAME_NAMED_FIELD_COMMAND.id;
        const kind = rename ? 'rename-named-field' : 'set-named-field-value';
        const unavailable = rename ? 'NamedFieldRenameUnavailable' : 'NamedFieldValueUnavailable';
        const payload = pending.payload as SetNamedFieldValuePayload | RenameNamedFieldPayload;
        if (
          !payload ||
          !payload.token ||
          !Number.isSafeInteger(payload.selectionVersion) ||
          payload.selectionVersion < 0
        )
          throw Error(rename ? 'InvalidNamedFieldRenameCommand' : 'InvalidNamedFieldValueCommand');
        const operation = rename
          ? { newName: (payload as RenameNamedFieldPayload).newName }
          : {
              expectedValue: (payload as SetNamedFieldValuePayload).expectedValue,
              text: (payload as SetNamedFieldValuePayload).text,
            };
        if ('newName' in operation) {
          if (
            typeof operation.newName !== 'string' ||
            !operation.newName ||
            !isWellFormedText(operation.newName)
          )
            throw Error('InvalidNamedFieldName');
        } else if (
          typeof operation.expectedValue !== 'string' ||
          !isWellFormedText(operation.expectedValue) ||
          typeof operation.text !== 'string' ||
          !isWellFormedText(operation.text)
        )
          throw Error('InvalidNamedFieldValueCommand');

        if (
          (state.content as { format?: string } | undefined)?.format !== 'hwpx' ||
          !hasRuntimeAdmission(active, kind)
        )
          throw Error(unavailable);
        const selector = checkedNamedFieldSelector(payload.selector);
        const guard = () => {
          requireReady(payload.token, true);
          if (state.stateVersion !== payload.selectionVersion)
            throw Error('StaleNamedFieldSelection');
        };
        guard();
        const inventory = await readNamedFieldInventory(payload.token);
        guard();
        const resolved = resolveNamedField(inventory, selector);
        if (resolved.status === 'incomplete') throw Error('IncompleteNamedFieldInventory');
        if (resolved.status === 'ambiguous') throw Error('AmbiguousNamedField');
        if (resolved.status === 'missing') throw Error('NamedFieldMissing');
        const { field } = resolved;
        if (field.protection === 'protected') throw Error('NamedFieldProtected');
        if (!field.canSetValue || !field.target || field.value.status !== 'available')
          throw Error(unavailable);
        if ('newName' in operation) {
          if (
            operation.newName !== selector.name &&
            inventory.rows.some((row) => row.name === operation.newName)
          )
            throw Error('DuplicateNamedFieldName');
        } else if (field.value.text !== operation.expectedValue) {
          throw Error('NamedFieldValueMismatch');
        }
        validateSelection(field.target, state, true);
        const { section, paragraph, startUnit, endUnit } = field.target;
        return await mutate(
          {
            kind,
            id: field.id,
            name: selector.name,
            occurrence: selector.occurrence,
            section,
            paragraph,
            startUnit,
            endUnit,
            ...operation,
          },
          payload.token,
          false,
          guard,
        );
      }
      if (pending.command.id === SPLICE_TEXT_COMMAND.id) {
        const payload = pending.payload as SpliceTextPayload;
        if (
          payload.selectionVersion !== undefined &&
          payload.selectionVersion !== state.stateVersion
        )
          throw Error('StaleClipboardSelection');
        if (typeof payload.text !== 'string' || !isWellFormed(payload.text))
          throw Error('InvalidText');
        const position = selectionMessage(payload.target, state);
        return await mutate({ kind: 'splice', ...position, text: payload.text }, payload.target);
      }
      if (pending.command.id === SPLIT_SOURCE_TABLE_CELLS_COMMAND.id) {
        const payload = pending.payload as SplitSourceTableCellsPayload;
        const target = mergeTargets.get(payload.target);
        if (!target || target.kind !== 'split') throw Error('ForeignSourceTableCellSplitTarget');
        const guard = () => {
          requireReady(pending.token, true);
          if (state !== target.state || !target.current())
            throw Error('StaleSourceTableCellSplitTarget');
        };
        guard();
        if (payload.mode === 'merge-then-split' && target.plan.selectedCells < 2)
          throw Error('InvalidSourceTableSplitMode');
        const admission = await readSourceTableCellSplitCapability(pending.token, guard);
        if ('reason' in admission) throw Error(admission.reason);
        if (
          target.plan.selectedCells > admission.maxSelectedCells ||
          (payload.mode === 'merge-then-split' && !admission.supportsMergeThenSplit)
        )
          throw Error('UnsupportedSourceTableSplitSelection');
        if (!payload.equalizeRows && !admission.supportsPreserveRowHeights)
          throw Error('UnsupportedSourceTableSplitHeights');
        return await mutate(
          {
            kind: 'source-table-cell-split',
            request: {
              ...target.plan,
              splitRows: payload.rows,
              splitColumns: payload.columns,
              mode: payload.mode,
              equalizeRows: payload.equalizeRows,
              binding: admission.binding,
            },
          },
          pending.token,
          false,
          guard,
        );
      }
      if (pending.command.id === EQUALIZE_SOURCE_TABLE_CELL_WIDTH_COMMAND.id) {
        const target = widthTargets.get(pending.payload as SourceTableCellWidthTarget);
        if (!target) throw Error('ForeignSourceTableCellWidthTarget');
        const guard = () => {
          requireReady(pending.token, true);
          if (state !== target.state || target.current() !== true)
            throw Error('StaleSourceTableCellWidthTarget');
        };
        guard();
        return await mutate(
          { kind: 'source-table-cell-width', request: target.plan },
          pending.token,
          false,
          guard,
        );
      }
      if (pending.command.id === EQUALIZE_SOURCE_TABLE_CELL_HEIGHT_COMMAND.id) {
        const target = heightTargets.get(pending.payload as SourceTableCellHeightTarget);
        if (!target) throw Error('ForeignSourceTableCellHeightTarget');
        const guard = () => {
          requireReady(pending.token, true);
          if (state !== target.state || target.current() !== true)
            throw Error('StaleSourceTableCellHeightTarget');
        };
        guard();
        return await mutate(
          { kind: 'source-table-cell-height', request: target.plan },
          pending.token,
          false,
          guard,
        );
      }
      if (pending.command.id === MERGE_SOURCE_TABLE_CELLS_COMMAND.id) {
        const target = mergeTargets.get(pending.payload as SourceTableCellMergeTarget);
        if (!target || target.kind !== 'merge') throw Error('ForeignSourceTableCellMergeTarget');
        const guard = () => {
          requireReady(pending.token, true);
          if (state !== target.state || target.current() !== true)
            throw Error('StaleSourceTableCellMergeTarget');
        };
        guard();
        const admission = await readDocumentInsertCapability(pending.token, guard);
        if ('reason' in admission) throw Error(admission.reason);
        return await mutate(
          {
            kind: 'source-table-cell-merge',
            request: { ...sourceTableMergeWirePlan(target.plan), binding: admission.binding },
          },
          pending.token,
          false,
          guard,
        );
      }
      if (pending.command.id === EDIT_SOURCE_TABLE_GRID_COMMAND.id) {
        requireReady(pending.token, true);
        const message = sourceTableGridMessage(
          pending.payload as EditSourceTableGridPayload,
          state,
        );
        return await mutate(message, pending.token);
      }
      if (pending.command.id === EDIT_CREATED_TABLE_GRID_COMMAND.id) {
        requireReady(pending.token, true);
        const message = createdTableGridMessage(
          pending.payload as EditCreatedTableGridPayload,
          state,
        );
        return await mutate(message, pending.token);
      }
      if (pending.command.id === INSERT_TABLE_COMMAND.id) {
        const payload = pending.payload as InsertTablePayload;
        return await mutate(tableInsertMessage(payload, state), payload.target);
      }
      if (pending.command.id === SET_CHARACTER_FONT_NAME_COMMAND.id) {
        const payload = pending.payload as SetCharacterFontNamePayload;
        return await mutate(fontNameMessage(payload, state), payload.target, true);
      }
      if (pending.command.id === SET_CHARACTER_TEXT_COLOR_COMMAND.id) {
        const payload = pending.payload as SetCharacterTextColorPayload;
        return await mutate(textColorMessage(payload, state), payload.target, true);
      }
      if (pending.command.id === SET_CHARACTER_STRIKE_COMMAND.id) {
        const payload = pending.payload as SetCharacterStrikePayload;
        return await mutate(strikeMessage(payload, state), payload.target, true);
      }
      if (pending.command.id === SET_CHARACTER_UNDERLINE_COMMAND.id) {
        const payload = pending.payload as SetCharacterUnderlinePayload;
        return await mutate(underlineMessage(payload, state), payload.target, true);
      }
      if (
        pending.command.id === SET_CHARACTER_PROPERTIES_COMMAND.id ||
        pending.command.id === SET_PARAGRAPH_ALIGNMENT_COMMAND.id
      ) {
        const payload = pending.payload as
          | SetCharacterPropertiesPayload
          | SetParagraphAlignmentPayload;
        const message = formattingMessage(
          payload,
          state,
          pending.command.id === SET_CHARACTER_PROPERTIES_COMMAND.id,
        );
        return await mutate(message, payload.target, true);
      }
      if (pending.command.id === UNDO_COMMAND.id || pending.command.id === REDO_COMMAND.id) {
        const payload = pending.payload as HistoryPayload;
        validateToken(payload.token, state);
        return await mutate(
          { kind: pending.command.id === UNDO_COMMAND.id ? 'undo' : 'redo' },
          payload.token,
        );
      }
      return reject(ctx, 'UnsupportedCommand');
    } catch (error) {
      return reject(ctx, error);
    }
  }
  function dispatchCommand<T>(command: EditorCommand<T>, payload: T): Promise<CommandResult> {
    assertPublicMutation();
    const pending = capture(command, payload);
    if (command.id === EDIT_PAGE_SETTINGS_COMMAND.id) {
      const found = pageSettingsTargets.get((pending.payload as EditPageSettingsPayload).target);
      if (!found)
        return Promise.resolve(reject(context(pending.token), 'ForeignPageSettingsTarget'));
      if (state !== found.state)
        return Promise.resolve(reject(context(pending.token), 'StalePageSettingsTarget'));
    }
    if (command.id === MERGE_SOURCE_TABLE_CELLS_COMMAND.id) {
      const target = mergeTargets.get(pending.payload as SourceTableCellMergeTarget);
      if (!target || target.kind !== 'merge')
        return Promise.resolve(reject(context(pending.token), 'ForeignSourceTableCellMergeTarget'));
      if (state !== target.state || !target.current())
        return Promise.resolve(reject(context(pending.token), 'StaleSourceTableCellMergeTarget'));
    }
    if (command.id === SPLIT_SOURCE_TABLE_CELLS_COMMAND.id) {
      const target = mergeTargets.get((pending.payload as SplitSourceTableCellsPayload).target);
      if (!target || target.kind !== 'split')
        return Promise.resolve(reject(context(pending.token), 'ForeignSourceTableCellSplitTarget'));
      if (state !== target.state || !target.current())
        return Promise.resolve(reject(context(pending.token), 'StaleSourceTableCellSplitTarget'));
    }
    if (command.id === EQUALIZE_SOURCE_TABLE_CELL_WIDTH_COMMAND.id) {
      const target = widthTargets.get(pending.payload as SourceTableCellWidthTarget);
      if (!target)
        return Promise.resolve(reject(context(pending.token), 'ForeignSourceTableCellWidthTarget'));
      if (state !== target.state || !target.current())
        return Promise.resolve(reject(context(pending.token), 'StaleSourceTableCellWidthTarget'));
    }
    if (command.id === EQUALIZE_SOURCE_TABLE_CELL_HEIGHT_COMMAND.id) {
      const target = heightTargets.get(pending.payload as SourceTableCellHeightTarget);
      if (!target)
        return Promise.resolve(
          reject(context(pending.token), 'ForeignSourceTableCellHeightTarget'),
        );
      if (state !== target.state || !target.current())
        return Promise.resolve(reject(context(pending.token), 'StaleSourceTableCellHeightTarget'));
    }
    return admit(() => execute(pending));
  }
  function update<T>(
    callback: UpdateCallback<[UpdateCollector, EditorState], T>,
  ): Promise<UpdateResult> {
    if (readDepth) {
      geometry.invalidate();
      throw Error('ReadMutation');
    }
    if (collecting) throw Error('NestedUpdate');
    if (handling) {
      geometry.invalidate();
      throw Error('CommandHandlerMutation');
    }
    assertLive();
    if (typeof callback !== 'function') throw TypeError('InvalidUpdateCallback');
    if (isAsyncFunction(callback)) throw Error('AsyncUpdate');
    const snapshot = state,
      pending: PendingCommand[] = [];
    let open = true;
    const collector = Object.freeze({
      dispatchCommand<T>(command: EditorCommand<T>, payload: T) {
        if (!open) throw Error('CollectorClosed');
        pending.push(capture(command, payload, snapshot));
      },
    });
    collecting = true;
    try {
      const returned = callback(collector, snapshot);
      if (isPromiseLike(returned)) {
        discardPromise(returned);
        throw Error('AsyncUpdate');
      }
      if (returned !== undefined) throw Error('InvalidUpdateReturn');
    } finally {
      collecting = false;
      open = false;
    }
    return admit(async () => {
      const results: CommandResult[] = [];
      let stoppedIndex: number | null = null;
      for (const [index, command] of pending.entries()) {
        // Coordinates are never rebased. A second command with stale coordinates stops.
        const answer = await execute(command);
        results.push(answer);
        if (
          answer.status === 'rejected-unapplied' ||
          answer.status === 'committed-refresh-required'
        ) {
          stoppedIndex = index;
          break;
        }
      }
      return Object.freeze({ results: Object.freeze(results), stoppedIndex, state });
    });
  }
  function refresh(): Promise<EditorState> {
    assertPublicMutation();
    const token = state.token;
    return enqueue(async () => {
      if (!active || state.status !== 'refresh-required') throw Error('RefreshNotRequired');
      validateToken(token, state);
      const ctx = context(token);
      try {
        const reply = await active.request({ kind: 'refresh' }, ctx);
        verifyReply(reply, ctx);
        if (reply.error) throw Error(reply.error);
        assertLive();
        const poisoned =
          state.historyRecoveryRequired ||
          reply.historyPoisoned === true ||
          reply.historyStats?.poisoned === true;
        install(
          { ...contentPatch(reply), status: poisoned ? 'refresh-required' : 'ready' },
          true,
          ctx,
        );
        if (poisoned) throw Error('HistoryReloadRequired');
        return state;
      } catch (error) {
        notifyError(error, ctx, false);
        throw error;
      }
    });
  }
  /** Capture a read-only document after the same input and Native barriers as save. */
  function captureDocumentOutput(signal?: AbortSignal) {
    assertPublicMutation();
    const abort = new CancellationFence();
    const cancel = () => abort.cancel();
    const check = () => signal?.throwIfAborted();
    signal?.addEventListener('abort', cancel, { once: true });
    return admit(
      async () => {
        check();
        const captured = state;
        const inputSurface = surface;
        const inputSurfaceEpoch = surfaceEpoch;
        const isCurrent = () =>
          !terminal &&
          surface === inputSurface &&
          surfaceEpoch === inputSurfaceEpoch &&
          state.status === 'ready' &&
          !state.historyRecoveryRequired &&
          state.nativeHistoryStats?.poisoned !== true &&
          state.content === captured.content &&
          state.documentId === captured.documentId &&
          state.generation === captured.generation &&
          state.operationRevision === captured.operationRevision &&
          state.viewRevision === captured.viewRevision &&
          (!inputSurface || inputSurface.hooks.isOutputInputSettled?.() === true);
        if (!active || !isCurrent()) throw Error('DocumentOutputInputUnavailable');
        return Object.freeze({
          state: captured,
          isCurrent,
          confirmCurrent: () =>
            enqueue(async () => {
              if (!isCurrent()) throw Error('StalePrintDocument');
            }),
        });
      },
      { abort, guard: check },
    )
      .catch((error) => {
        check();
        throw error;
      })
      .finally(() => signal?.removeEventListener('abort', cancel));
  }
  function save(saveOptions: SaveOptions = {}): Promise<SaveResult> {
    assertPublicMutation();
    const owned = copyOwned(saveOptions);
    return admit(async () => {
      const token = owned.token ?? state.token;
      if (!active || state.documentId === null) throw Error('EditorNotReady');
      validateToken(token, state);
      const stale =
        state.status === 'refresh-required' ||
        state.historyRecoveryRequired ||
        state.nativeHistoryStats?.poisoned === true;
      if (stale && !owned.recovery) throw Error('RecoverySaveRequired');
      if (!stale && state.status !== 'ready') throw Error('EditorNotReady');
      const ctx = context(token);
      const format = (state.content as { format?: unknown })?.format;
      if (format !== 'hwp5' && format !== 'hwpx') throw Error('UnknownDocumentFormat');
      try {
        const reply = await active.request(
          {
            kind: 'save',
            allowStaleLayout: owned.allowStaleLayout ?? false,
            allowUnprotectedOutput: owned.allowUnprotectedOutput ?? false,
          },
          ctx,
        );
        verifyReply(reply, ctx);
        if (reply.error) throw Error(reply.error);
        if (!(reply.bytes instanceof Uint8Array)) throw Error('SaveBytesMissing');
        const bytes = reply.bytes.slice();
        assertLive();
        install({ savedOperationRevision: token.operationRevision });
        return Object.freeze({
          bytes,
          documentId: token.documentId!,
          generation: token.generation,
          operationRevision: token.operationRevision,
          nativeHistoryRevision: history(reply) ?? state.nativeHistoryRevision,
          format,
          staleSnapshot: stale,
          layoutRequiresReflow:
            typeof reply.layoutRequiresReflow === 'boolean'
              ? reply.layoutRequiresReflow
              : undefined,
          reply: freezeDTO(copyOwned(reply, true)),
        });
      } catch (error) {
        notifyError(error, ctx, false);
        throw error;
      }
    });
  }
  function requestExperimental(
    message: RuntimeMessage,
    experimental: ExperimentalOptions,
  ): Promise<CommandResult | RuntimeReply> {
    assertPublicMutation();
    const kind = Object.getOwnPropertyDescriptor(message ?? {}, 'kind')?.value;
    if (
      [
        'insert-document',
        'document-insert-capabilities',
        'page-settings-capabilities',
        'write-page-settings',
        'source-table-cell-split',
        'source-table-cell-split-capabilities',
      ].includes(kind)
    )
      throw Error('UseTypedEditorOperation');
    const owned = copyOwned(message),
      settings = copyOwned(experimental);
    if (!owned || typeof owned.kind !== 'string' || typeof settings.mutation !== 'boolean')
      throw Error('InvalidExperimentalRequest');
    if (
      [
        'load',
        'unlock',
        'enable',
        'save',
        'refresh',
        'undo',
        'redo',
        'splice',
        'set-named-field-value',
        'rename-named-field',
        'set-named-field-parameters',
        'edit-paragraph-bullet-definition',
        'create-named-field',
        'source-table-cell-width',
        'source-table-cell-height',
      ].includes(owned.kind)
    )
      throw Error('UseTypedEditorOperation');
    const operation = surfaceOperation(owned.kind);
    if (operation && settings.mutation !== (operation === 'mutation'))
      throw Error('OperationClassificationMismatch');
    if (!settings.mutation && operation !== 'read') throw Error('UnsafeExperimentalQuery');
    return (settings.mutation ? admit : enqueue)(async () => {
      if (settings.mutation) return mutate(owned, settings.token);
      requireReady(settings.token);
      const ctx = context(settings.token);
      try {
        const reply = await active!.request(owned, ctx);
        verifyReply(reply, ctx);
        if (reply.error) throw Error(reply.error);
        return freezeDTO(copyOwned(reply, true));
      } catch (error) {
        notifyError(error, ctx, false);
        throw error;
      }
    });
  }
  function setSelection(
    target: SelectionTarget | null,
    options: SelectionOptions = {},
  ): Promise<EditorState> {
    assertPublicMutation();
    const owned = copyOwned(target),
      settings = copyOwned(options);
    if (
      !settings ||
      typeof settings !== 'object' ||
      Array.isArray(settings) ||
      Object.keys(settings).some((key) => key !== 'stateVersion') ||
      (settings.stateVersion !== undefined &&
        (!Number.isSafeInteger(settings.stateVersion) || settings.stateVersion < 0))
    )
      throw Error('InvalidSelectionOptions');
    const version = settings.stateVersion;
    return admit(async () => {
      requireReady(owned ?? state.token);
      if (version !== undefined && version !== state.stateVersion)
        throw Error('StaleSelectionObservation');
      if (owned) validateSelection(owned, state);
      install({ selection: owned });
      return state;
    });
  }
  async function readNamedFieldInventory(token: StateToken): Promise<NamedFieldInventory> {
    requireReady(token, true);
    const runtime = active!;
    const ctx = context(token);
    try {
      if (!runtime.readNamedFields) throw Error('NamedFieldsUnavailable');
      const source = await runtime.readNamedFields(ctx);
      requireReady(token, true);
      return checkedNamedFieldInventory(source, state);
    } catch (error) {
      notifyError(error, ctx, false);
      throw error;
    }
  }
  function namedFieldToken(options: NamedFieldOptions): StateToken {
    const settings = copyOwned(options);
    if (
      !settings ||
      typeof settings !== 'object' ||
      Array.isArray(settings) ||
      Object.keys(settings).some((key) => key !== 'token') ||
      settings.token === null
    )
      throw Error('InvalidNamedFieldOptions');
    return copyOwned(settings.token ?? state.token);
  }
  function getPageSettings(
    options: { token?: StateToken; section?: number } = {},
  ): Promise<PageSettingsRead> {
    assertPublicMutation();
    const settings = copyOwned(options);
    if (
      !settings ||
      typeof settings !== 'object' ||
      Array.isArray(settings) ||
      Object.keys(settings).some((k) => !['token', 'section'].includes(k)) ||
      settings.token === null ||
      (settings.section !== undefined &&
        (!Number.isInteger(settings.section) || settings.section < 0))
    )
      throw Error('InvalidPageSettingsOptions');
    const token = copyOwned(settings.token ?? state.token);
    return enqueue(async () => {
      requireReady(token, true);
      if (!['hwpx', 'hwp5'].includes((state.content as any)?.format))
        return { state: 'unavailable', reason: 'PageSettingsWriteUnavailable' };
      if (
        (state.content as any)?.readOnly === true ||
        (state.capabilities as any)?.readOnly === true
      )
        return { state: 'unavailable', reason: 'ReadOnlyDocument' };
      const before = state;
      const guard = () => {
        requireReady(token, true);
        if (state !== before) throw Error('StalePageSettingsTarget');
      };
      if (!hasRuntimeAdmission(active, 'page-settings-capabilities'))
        throw Error('UnsupportedAtomicRuntime');
      const reply = await readRequest({ kind: 'page-settings-capabilities' }, token, guard, true);
      guard();
      const native = checkedPageSettingsCapabilities(reply.pageSettings);
      if (native.binding.revision !== state.nativeHistoryRevision)
        throw Error('StalePageSettingsBinding');
      const selection = state.selection as any;
      const section =
        settings.section ?? (Number.isInteger(selection?.section) ? selection.section : null);
      if (section !== null && !native.sections.some((r) => r.section === section))
        throw Error('InvalidPageSettingsSection');
      const target = Object.freeze({}) as PageSettingsTarget;
      pageSettingsTargets.set(target, {
        state: before,
        native: freezeDTO(copyOwned(native)),
        section,
      });
      return freezeDTO({
        state: 'available',
        target,
        currentSection: section,
        sections: native.sections.map((r) => ({
          section: r.section,
          source: pageSettingsSource(native, r),
          reason: r.reason,
        })),
      }) as PageSettingsRead;
    });
  }
  function listParagraphBulletDefinitions(
    options: ParagraphBulletDefinitionsOptions = {},
  ): Promise<ParagraphBulletDefinitions> {
    assertPublicMutation();
    const settings = copyOwned(options);
    if (
      !settings ||
      typeof settings !== 'object' ||
      Array.isArray(settings) ||
      Object.keys(settings).some((key) => key !== 'token') ||
      settings.token === null
    )
      throw Error('InvalidParagraphBulletDefinitionsOptions');
    const token = copyOwned(settings.token ?? state.token);
    return enqueue(async () => {
      requireReady(token, true);
      const before = state;
      const guard = () => {
        requireReady(token, true);
        if (state !== before) throw Error('StaleParagraphBulletDefinitions');
      };
      const reply = await readRequest({ kind: 'paragraph-bullet-definitions' }, token, guard);
      guard();
      return freezeDTO(
        checkedParagraphBulletDefinitions(reply.bulletDefinitions),
      ) as ParagraphBulletDefinitions;
    });
  }
  function listNamedFields(options: NamedFieldOptions = {}): Promise<NamedFieldInventory> {
    assertPublicMutation();
    const token = namedFieldToken(options);
    return enqueue(() => readNamedFieldInventory(token));
  }
  function readNamedField(
    selector: NamedFieldSelector,
    options: NamedFieldOptions = {},
  ): Promise<NamedFieldResolution> {
    assertPublicMutation();
    const owned = checkedNamedFieldSelector(copyOwned(selector));
    const token = namedFieldToken(options);
    return enqueue(async () => resolveNamedField(await readNamedFieldInventory(token), owned));
  }
  function readNamedFieldParameters(
    selector: NamedFieldSelector,
    options: NamedFieldOptions = {},
  ): Promise<NamedFieldParametersRead> {
    assertPublicMutation();
    const owned = checkedNamedFieldSelector(copyOwned(selector));
    const token = namedFieldToken(options);
    return enqueue(async () => {
      requireReady(token, true);
      if ((state.content as any)?.format !== 'hwpx') throw Error('NamedFieldParametersUnavailable');
      const resolved = resolveNamedField(await readNamedFieldInventory(token), owned);
      if (resolved.status !== 'found') return resolved;
      const before = state;
      const guard = () => {
        requireReady(token, true);
        if (state.stateVersion !== before.stateVersion) throw Error('StaleNamedFieldSelection');
      };
      const reply = await readRequest(
        {
          kind: 'named-field-parameters',
          id: resolved.field.id,
          name: owned.name,
          occurrence: owned.occurrence,
        },
        token,
        guard,
      );
      guard();
      const value = reply.namedFieldParameters as {
        parameters: NamedFieldParameters;
        canEdit: boolean;
      };
      if (!value || typeof value.canEdit !== 'boolean') throw Error('InvalidNamedFieldParameters');
      const parameters = checkedNamedFieldParameterValues(value.parameters);
      return freezeDTO({
        status: 'found' as const,
        field: resolved.field,
        parameters,
        canEdit:
          value.canEdit &&
          resolved.field.canSetValue === true &&
          (state.content as any)?.readOnly !== true &&
          (state.capabilities as any)?.readOnly !== true,
        token,
        selectionVersion: before.stateVersion,
      });
    });
  }
  function moveToNamedField(
    selector: NamedFieldSelector,
    options: NamedFieldOptions = {},
  ): Promise<NamedFieldNavigation> {
    assertPublicMutation();
    const owned = checkedNamedFieldSelector(copyOwned(selector));
    const token = namedFieldToken(options);
    return admit(async () => {
      const inventory = await readNamedFieldInventory(token);
      requireReady(token, true);
      const result = resolveNamedField(inventory, owned);
      if (result.status !== 'found') return result;
      const { field } = result;
      if (!field.target) return { status: 'unavailable', field };
      validateSelection(field.target, state);
      install({ selection: field.target });
      return { status: 'moved', field, state };
    });
  }
  function historyCommand(
    command: EditorCommand<HistoryPayload>,
    token?: StateToken,
  ): Promise<CommandResult> {
    assertPublicMutation();
    const explicit = token === undefined ? undefined : copyOwned(token),
      handlers = registry.capture(command);
    return admit(() =>
      execute({ ...capture(command, { token: explicit ?? state.token }), handlers }),
    );
  }
  async function readRequest(
    message: RuntimeMessage,
    token: StateToken,
    guard: () => void = () => {},
    admitted = false,
  ): Promise<RuntimeReply> {
    guard();
    requireReady(token, true);
    const ctx = context(token);
    try {
      const reply = admitted
        ? await requestAtRuntimeAdmission(active!, message, ctx, guard)
        : await active!.request(message, ctx);
      verifyReply(reply, ctx);
      if (reply.error) throw Error(reply.error);
      assertLive();
      guard();
      return freezeDTO(copyOwned(reply, true));
    } catch (error) {
      notifyError(error, ctx, false);
      throw error;
    }
  }
  function hostFormattingWritable(): boolean {
    try {
      writePolicy.assertWritable();
      return true;
    } catch (error) {
      if (error instanceof Error && error.message === 'ReadOnlyDocument') return false;
      throw error;
    }
  }
  function checkedFormattingQuery(input: unknown): FormattingQueryResult {
    const v = input as FormattingQueryResult;
    if (
      v?.schemaVersion !== 1 ||
      typeof v.binding?.session !== 'string' ||
      !v.binding.session ||
      !Array.isArray(v.targets) ||
      v.targets.length !== 1 ||
      typeof v.targets[0]?.ref !== 'string' ||
      !v.targets[0].ref ||
      !Array.isArray(v.observations?.perTarget) ||
      v.observations.perTarget.length !== 1 ||
      v.observations.perTarget[0].ref !== v.targets[0].ref ||
      !v.observations.aggregate
    )
      throw Error('MalformedFormattingQuery');
    if (
      v.binding.revision !== null &&
      (!Number.isSafeInteger(v.binding.revision) ||
        v.binding.revision < 0 ||
        v.binding.revision >= 0xffffffff)
    )
      throw Error('InvalidFormattingBinding');
    for (const fields of [v.observations.aggregate, v.observations.perTarget[0].fields]) {
      if (!fields || typeof fields !== 'object' || Array.isArray(fields))
        throw Error('MalformedFormattingQuery');
      for (const observation of Object.values(fields)) {
        const o = observation as Record<string, unknown> | null;
        if (
          !o ||
          typeof o.state !== 'string' ||
          !['known', 'mixed', 'unknown', 'unavailable'].includes(o.state) ||
          typeof o.writable !== 'boolean' ||
          (!o.writable && typeof o.writeUnavailableReason !== 'string') ||
          ((o.state === 'unknown' || o.state === 'unavailable') && typeof o.reason !== 'string') ||
          (o.state === 'known' && !Object.hasOwn(o, 'value')) ||
          (o.unit !== undefined && typeof o.unit !== 'string')
        )
          throw Error('MalformedFormattingQuery');
      }
    }
    if (!hostFormattingWritable()) {
      const observe = (fields: typeof v.observations.aggregate) =>
        Object.fromEntries(
          Object.entries(fields).map(([key, o]) => [
            key,
            o.writable
              ? { ...o, writable: false as const, writeUnavailableReason: 'ReadOnlyDocument' }
              : o,
          ]),
        );
      return freezeDTO(
        copyOwned(
          {
            ...v,
            observations: {
              perTarget: v.observations.perTarget.map((row) => ({
                ...row,
                fields: observe(row.fields),
              })),
              aggregate: observe(v.observations.aggregate),
            },
          },
          true,
        ),
      );
    }
    return freezeDTO(copyOwned(v, true));
  }
  async function readFormattingCapabilities(
    token: StateToken,
    guard: () => void = () => {},
  ): Promise<FormattingCapabilities> {
    requireReady(token, true);
    if (!hasRuntimeAdmission(active))
      return Object.freeze({ atomic: false, reason: 'UnsupportedAtomicRuntime' });
    const ready = () => {
      requireReady(token, true);
      guard();
    };
    const reply = await readRequest({ kind: 'formatting-capabilities' }, token, ready, true);
    const cap = reply.formattingCapabilities as FormattingCapabilities | undefined;
    if (cap?.atomic === false && typeof cap.reason === 'string')
      return freezeDTO(copyOwned(cap, true));
    if (
      cap?.atomic !== true ||
      cap.schemaVersion !== 1 ||
      cap.coordinateSpace !== 'native-source-utf16' ||
      cap.requiresHistoryProtocol !== 2 ||
      cap.format !== (state.content as { format?: string }).format ||
      typeof cap.binding?.session !== 'string' ||
      !cap.binding.session ||
      !cap.fields ||
      !cap.limits
    )
      throw Error('MalformedFormattingCapabilities');
    if (
      cap.binding.revision !== null &&
      (!Number.isSafeInteger(cap.binding.revision) ||
        cap.binding.revision < 0 ||
        cap.binding.revision >= 0xffffffff)
    )
      throw Error('InvalidFormattingBinding');
    for (const n of [
      'requestBytes',
      'replyBytes',
      'targets',
      'ranges',
      'commands',
      'fontNameBytes',
      'projectionBytes',
    ] as const)
      if (!Number.isSafeInteger(cap.limits[n]) || cap.limits[n] <= 0)
        throw Error('MalformedFormattingCapabilities');
    const fence: SelectionAdmissionFence = Object.freeze({
      version: 1,
      commands: Object.freeze(['APPLY_FORMATTING_PATCH'] as const),
      epoch: 'stateVersion',
    });
    const fields = hostFormattingWritable()
      ? cap.fields
      : Object.fromEntries(
          Object.entries(cap.fields).map(([key, field]) => [
            key,
            field.writable
              ? { ...field, writable: false, writeUnavailableReason: 'ReadOnlyDocument' }
              : field,
          ]),
        );
    return freezeDTO(
      copyOwned(
        {
          ...cap,
          fields,
          ...(hasRuntimeAdmission(active) ? { selectionAdmissionFence: fence } : {}),
        },
        true,
      ),
    );
  }
  async function readSourceTableCellSplitCapability(
    token: StateToken,
    guard: () => void,
  ): Promise<SourceTableCellSplitCapabilities> {
    if (!active || !hasRuntimeAdmission(active))
      return { available: false, reason: 'UnsupportedAtomicRuntime' };
    const ctx = context(token);
    const reply = await requestAtRuntimeAdmission(
      active,
      { kind: 'source-table-cell-split-capabilities' },
      ctx,
      guard,
    );
    verifyReply(reply, ctx);
    guard();
    if (reply.kind !== 'source-table-cell-split-capabilities')
      throw Error('InvalidSourceTableSplitCapabilities');
    if (reply.error) {
      if (
        [
          'SourceTableCellSplitUnavailable',
          'HistoryNotEnabled',
          'HistoryProtocolRequired',
        ].includes(reply.error)
      )
        return { available: false, reason: reply.error };
      throw Error(reply.error);
    }
    const cap = decodeSourceTableCellSplitCapability(reply.capabilities);
    if (
      cap.format !== (state.content as { format?: string })?.format ||
      cap.binding.revision !== state.nativeHistoryRevision ||
      (cap.format === 'hwp5' &&
        cap.sourceProfile !==
          (state.content as { sourceTableCellSplitProfile?: string })?.sourceTableCellSplitProfile)
    )
      throw Error('StaleSourceTableSplitBinding');
    return Object.freeze({ available: true as const, ...cap });
  }
  function getSourceTableCellSplitCapabilities(
    options: { token?: StateToken } = {},
  ): Promise<SourceTableCellSplitCapabilities> {
    assertPublicMutation();
    const settings = copyOwned(options);
    if (
      !settings ||
      typeof settings !== 'object' ||
      Array.isArray(settings) ||
      settings.token === null ||
      Object.keys(settings).some((key) => key !== 'token')
    )
      throw Error('InvalidSourceTableSplitCapabilities');
    const token = copyOwned(settings.token ?? state.token);
    return enqueue(() =>
      readSourceTableCellSplitCapability(token, () => requireReady(token, true)),
    );
  }
  async function readDocumentInsertCapability(token: StateToken, guard: () => void) {
    if (!active || !hasRuntimeAdmission(active))
      return { available: false as const, reason: 'UnsupportedAtomicRuntime' };
    const ctx = context(token);
    const reply = await requestAtRuntimeAdmission(
      active,
      { kind: 'document-insert-capabilities' },
      ctx,
      guard,
    );
    verifyReply(reply, ctx);
    guard();
    if (reply.kind !== 'document-insert-capabilities')
      throw Error('MalformedDocumentInsertionCapabilities');
    if (reply.error) {
      if (
        ['DocumentInsertionUnavailable', 'HistoryNotEnabled', 'HistoryProtocol2Required'].includes(
          reply.error,
        )
      )
        return { available: false as const, reason: reply.error };
      throw Error(reply.error);
    }
    return checkedDocumentInsertCapability(reply.capabilities, state.nativeHistoryRevision);
  }
  function getDocumentInsertionCapabilities(
    options: DocumentInsertionCapabilityOptions = {},
  ): Promise<DocumentInsertionCapabilities> {
    assertPublicMutation();
    const settings = copyOwned(options);
    if (
      !settings ||
      typeof settings !== 'object' ||
      Array.isArray(settings) ||
      Object.keys(settings).some((key) => key !== 'token') ||
      settings.token === null
    )
      throw Error('InvalidDocumentInsertionCapabilityOptions');
    const token = copyOwned(settings.token ?? state.token);
    return enqueue(async () => {
      requireReady(token, true);
      if (!hostFormattingWritable())
        return Object.freeze({ available: false, reason: 'ReadOnlyDocument' });
      if ((state.content as { format?: string })?.format !== 'hwpx')
        return Object.freeze({ available: false, reason: 'DocumentInsertionUnavailable' });
      const current = state.selection as SelectionTarget | undefined;
      if (!current)
        return Object.freeze({ available: false, reason: 'DocumentInsertionRequiresCaret' });
      const selectionVersion = state.stateVersion;
      const guard = () => {
        requireReady(token, true);
        currentDocumentInsertCaret(state, current, selectionVersion);
      };
      try {
        guard();
      } catch (error) {
        if (error instanceof Error)
          return Object.freeze({ available: false, reason: error.message });
        throw error;
      }
      const result = await readDocumentInsertCapability(token, guard);
      return 'reason' in result ? Object.freeze(result) : result.capabilities;
    });
  }
  function getReplaceAllCapabilities(
    options: { readonly token?: StateToken } = {},
  ): Promise<ReplaceAllCapabilities> {
    assertPublicMutation();
    const settings = copyOwned(options);
    if (
      !settings ||
      typeof settings !== 'object' ||
      Array.isArray(settings) ||
      Object.keys(settings).some((key) => key !== 'token') ||
      settings.token === null
    )
      throw Error('InvalidReplaceAllCapabilityOptions');
    const token = copyOwned(settings.token ?? state.token);
    return enqueue(async () => {
      requireReady(token, true);
      if (!hostFormattingWritable())
        return Object.freeze({
          available: false,
          reason: 'ReadOnlyDocument',
          supportsNewlines: false,
        });
      const content = state.content as any;
      if (
        !content ||
        !Array.isArray(content.paragraphs) ||
        content.totalParagraphs !== content.paragraphs.length ||
        content.limited === true ||
        content.window
      )
        return Object.freeze({
          available: false,
          reason: 'IncompleteReplaceAllSnapshot',
          supportsNewlines: false,
        });
      if (!hasRuntimeAdmission(active))
        return Object.freeze({
          available: false,
          reason: 'UnsupportedAtomicRuntime',
          supportsNewlines: false,
        });
      const reply = await readRequest(
        { kind: 'text-transaction-capabilities' },
        token,
        () => requireReady(token, true),
        true,
      );
      const cap = reply.textTransactionCapabilities as any;
      if (
        !cap ||
        typeof cap.available !== 'boolean' ||
        typeof cap.supportsNewlines !== 'boolean' ||
        (cap.reason !== undefined && typeof cap.reason !== 'string')
      )
        throw Error('MalformedTextTransactionCapabilities');
      return freezeDTO(copyOwned(cap));
    });
  }
  function getFormattingCapabilities(
    options: FormattingCapabilityOptions = {},
  ): Promise<FormattingCapabilities> {
    assertPublicMutation();
    const settings = copyOwned(options);
    if (
      !settings ||
      typeof settings !== 'object' ||
      Array.isArray(settings) ||
      Object.keys(settings).some((k) => k !== 'token')
    )
      throw Error('InvalidFormattingCapabilityOptions');
    if (settings.token === null) throw Error('InvalidFormattingCapabilityOptions');
    const token = copyOwned(settings.token ?? state.token);
    return enqueue(() => readFormattingCapabilities(token));
  }
  function queryFormatting(
    target: SelectionTarget,
    options: QueryFormattingOptions = {},
  ): Promise<FormattingQueryResult> {
    assertPublicMutation();
    const owned = copyOwned(target),
      settings = copyOwned(options);
    if (
      !settings ||
      typeof settings !== 'object' ||
      Array.isArray(settings) ||
      Object.keys(settings).some((k) => k !== 'fields') ||
      (settings.fields !== undefined &&
        (!Array.isArray(settings.fields) || settings.fields.some((f) => typeof f !== 'string')))
    )
      throw Error('InvalidFormattingQueryOptions');
    return enqueue(async () => {
      requireReady(owned, true);
      if (!hasRuntimeAdmission(active)) throw Error('UnsupportedAtomicRuntime');
      const selector = atomicSelector(owned, state, false, owned.startUnit !== owned.endUnit);
      const reply = await readRequest(
        {
          kind: 'query-formatting',
          selector,
          ...(settings.fields === undefined ? {} : { fields: settings.fields }),
        },
        owned,
        () => requireReady(owned, true),
        true,
      );
      return checkedFormattingQuery(reply.formatting);
    });
  }
  function readResource(
    message: RuntimeMessage,
    requestOptions?: { token: StateToken } | StateToken,
  ): Promise<RuntimeReply> {
    assertPublicMutation();
    const owned = copyOwned(message),
      expected = copyOwned(
        requestOptions === undefined
          ? state.token
          : 'token' in requestOptions
            ? requestOptions.token
            : requestOptions,
      );
    if (surfaceOperation(owned.kind) !== 'read')
      return Promise.reject(Error('UnsupportedReadOperation'));
    return enqueue(() => readRequest(owned, expected));
  }
  function sourceTableMergeWirePlan(plan: ReturnType<typeof sourceTableCellSplitPlan>) {
    const { selectedCells: _, ...wire } = plan;
    return wire;
  }
  function issueTableCellTarget(
    record: SurfaceRecord,
    witness: SourceTableCellBlockWitness,
    current: () => boolean,
    kind: 'merge' | 'split',
  ) {
    const snapshot = state;
    let invalid = false;
    const live = () => {
      if (invalid) return false;
      try {
        assertSurface(record);
        if (snapshot === state && current() === true && snapshot === state) return true;
      } catch {
        // Detached surfaces and invalid witnesses both fail closed.
      }
      invalid = true;
      return false;
    };
    if (state.status !== 'ready' || !hasRuntimeAdmission(active) || !live()) return null;
    try {
      const checked = copyOwned(witness);
      const plan =
        kind === 'split'
          ? sourceTableCellSplitPlan(snapshot, checked)
          : { ...sourceTableCellMergePlan(snapshot, checked), selectedCells: checked.cells.length };
      if (!live()) return null;
      const target = Object.freeze({});
      mergeTargets.set(target, { kind, state: snapshot, plan, current: live });
      return target;
    } catch {
      return null;
    }
  }
  function acquireInputSurface(hooks: InputSurfaceHooks): InputSurfaceLease {
    assertPublicMutation();
    assertLive();
    if (surface) throw Error('InputSurfaceAlreadyAttached');
    if (
      !hooks ||
      typeof hooks.commitComposition !== 'function' ||
      typeof hooks.cancelComposition !== 'function'
    )
      throw Error('InvalidInputSurfaceHooks');
    const fence = new CancellationFence();
    const generation = ++surfaceEpoch;
    const record: SurfaceRecord = {
      id: `${editorId}:surface:${generation}`,
      generation,
      active: true,
      hooks: {
        commitComposition: hooks.commitComposition.bind(hooks),
        isOutputInputSettled: hooks.isOutputInputSettled?.bind(hooks),
        cancelComposition: hooks.cancelComposition.bind(hooks),
      },
      fence,
    };
    surface = record;
    const lease = Object.freeze({
      id: record.id,
      generation,
      isActive: () => !terminal && record.active && surface === record,
      request(
        message: RuntimeMessage,
        requestOptions: SurfaceRequestOptions,
      ): Promise<CommandResult | RuntimeReply> {
        assertPublicMutation();
        let owned: RuntimeMessage,
          expected: SurfaceRequestOptions,
          operation: ReturnType<typeof surfaceOperation>;
        try {
          assertSurface(record);
          owned = copyOwned(message);
          expected = copyOwned(requestOptions);
          if (expected.coordinates !== 'legacy-native') throw Error('InvalidSurfaceCoordinates');
          operation = surfaceOperation(owned.kind);
          if (!operation) throw Error('UnsupportedSurfaceOperation');
        } catch (error) {
          return Promise.reject(error);
        }
        return enqueue(async () => {
          assertSurface(record);
          requireReady(expected.token, true);
          if (operation === 'read')
            return readRequest(owned, expected.token, () => assertSurface(record));
          if (operation === 'view') {
            const ctx = context(expected.token);
            const reply = await active!.request(owned, ctx);
            verifyReply(reply, ctx);
            if (reply.error) throw Error(reply.error);
            install(contentPatch(reply), false, ctx, takeGeometryOrigin(active!, reply, ctx));
            assertSurface(record);
            return freezeDTO(copyOwned(reply, true));
          }
          // Existing controller owns display->raw mapping. Do not use SPLICE_TEXT_COMMAND here.
          const answer = await mutate(owned, expected.token);
          assertSurface(record);
          return answer;
        });
      },
      captureSourceTableCellMerge(witness: SourceTableCellBlockWitness, current: () => boolean) {
        return issueTableCellTarget(
          record,
          witness,
          current,
          'merge',
        ) as SourceTableCellMergeTarget | null;
      },
      captureSourceTableCellSplit(witness: SourceTableCellBlockWitness, current: () => boolean) {
        const target = issueTableCellTarget(
          record,
          witness,
          current,
          'split',
        ) as SourceTableCellSplitTarget | null;
        if (!target) return null;
        const plan = mergeTargets.get(target)!.plan;
        return Object.freeze({
          target,
          selection: Object.freeze({
            profile:
              (state.content as { format?: string })?.format === 'hwp5'
                ? (
                    state.content as {
                      sourceTableCellSplitProfile:
                        | 'single-unmerged-source-cell'
                        | 'single-source-cell-with-spans';
                    }
                  ).sourceTableCellSplitProfile
                : ('static-source-cell-rectangle' as const),
            selectedCells: plan.selectedCells,
            rows: plan.bottom - plan.top,
            columns: plan.right - plan.left,
          }),
        });
      },
      captureSourceTableCellWidth(witness: SourceTableCellBlockWitness, current: () => boolean) {
        const snapshot = state;
        let invalid = false;
        const live = () => {
          if (invalid) return false;
          try {
            assertSurface(record);
            if (snapshot === state && current() === true && snapshot === state) return true;
          } catch {
            // Detached surfaces and changed selections invalidate this observation.
          }
          invalid = true;
          return false;
        };
        if (state.status !== 'ready' || !hasRuntimeAdmission(active) || !live()) return null;
        try {
          const plan = sourceTableCellWidthRequest(snapshot, copyOwned(witness));
          if (!live()) return null;
          const target = Object.freeze({}) as SourceTableCellWidthTarget;
          widthTargets.set(target, { state: snapshot, plan, current: live });
          return target;
        } catch {
          return null;
        }
      },
      captureSourceTableCellHeight(
        witness: SourceTableCellBlockWitness,
        minimums: readonly SourceTableCellHeightMinimum[],
        current: () => boolean,
      ) {
        const snapshot = state;
        let invalid = false;
        const live = () => {
          if (invalid) return false;
          try {
            assertSurface(record);
            if (snapshot === state && current() === true && snapshot === state) return true;
          } catch {
            // Detached surfaces and changed selections invalidate this observation.
          }
          invalid = true;
          return false;
        };
        if (state.status !== 'ready' || !hasRuntimeAdmission(active) || !live()) return null;
        try {
          const plan = sourceTableCellHeightRequest(
            snapshot,
            copyOwned(witness),
            copyOwned(minimums),
          );
          if (!live()) return null;
          const target = Object.freeze({}) as SourceTableCellHeightTarget;
          heightTargets.set(target, { state: snapshot, plan, current: live });
          return target;
        } catch {
          return null;
        }
      },
      publishSelection(target: SelectionTarget | null): Promise<EditorState> {
        assertPublicMutation();
        let owned: SelectionTarget | null;
        const expected = state.token;
        try {
          assertSurface(record);
          owned = copyOwned(target);
        } catch (error) {
          return Promise.reject(error);
        }
        return enqueue(async () => {
          assertSurface(record);
          requireReady(owned ?? expected);
          if (owned) validateSelection(owned, state);
          install({ selection: owned });
          assertSurface(record);
          return state;
        });
      },
      release() {
        if (!record.active) return;
        assertPublicMutation();
        geometry.invalidate();
        record.active = false;
        record.fence.cancel();
        if (surface === record) {
          surface = undefined;
          install({ selection: null });
        }
        cancelComposition(record, 'detach');
      },
    });
    bindGeometryProjectionPort(lease, (snapshot) =>
      !terminal && record.active && surface === record && snapshot === state
        ? geometry.read(snapshot)
        : undefined,
    );
    return lease;
  }
  function register<T>(set: Set<T>, listener: T): () => void {
    assertLive();
    if (typeof listener !== 'function') throw TypeError('InvalidListener');
    set.add(listener);
    let attached = true;
    return () => {
      if (!attached) return;
      attached = false;
      set.delete(listener);
    };
  }
  function dispose(): Promise<void> {
    geometry.invalidate();
    assertPublicMutation();
    if (disposePromise) return disposePromise;
    terminal = true;
    selectionHistory.clear();
    disposedFence.cancel();
    for (const job of loads) job.fence.cancel();
    loads.clear();
    if (surface) {
      const detached = surface;
      surface = undefined;
      detached.active = false;
      detached.fence.cancel();
      cancelComposition(detached, 'dispose');
    }
    state = new EditorState(
      {
        editorId,
        documentId: state.documentId,
        generation: state.generation,
        operationRevision: state.operationRevision,
        viewRevision: state.viewRevision,
        stateVersion: ++stateVersion,
        status: 'disposed',
        content: state.content,
        capabilities: state.capabilities,
        historyRecoveryRequired: state.historyRecoveryRequired,
        nativeHistoryStats: state.nativeHistoryStats,
        nativeHistoryRevision: state.nativeHistoryRevision,
        nativeHistoryRevisions: state.nativeHistoryRevisions,
        savedOperationRevision: state.savedOperationRevision,
        selection: state.selection,
      },
      runRead,
    );
    stateListeners.clear();
    updateListeners.clear();
    errorListeners.clear();
    registry.clear();
    const nativeDisposal = queue.enqueue(async () => {
      const current = active,
        candidate = locked?.runtime;
      active = undefined;
      locked = undefined;
      const failures: unknown[] = [];
      for (const runtime of [candidate, current])
        try {
          await release(runtime);
        } catch (error) {
          failures.push(error);
        }
      if (failures.length) throw new AggregateError(failures, 'RuntimeDisposeFailed');
    });
    disposePromise = Promise.all([nativeDisposal, admission.drain()]).then(() => {});
    return disposePromise;
  }
  function geometryGuard<F extends (...args: any[]) => any>(fn: F): F {
    return ((...args: any[]) => {
      try {
        const value = fn(...args);
        // dispose의 반복 호출은 동일한 Promise를 반환해야 합니다.
        // 거부 관측은 별도로 연결하고 호출자가 받는 Promise는 교체하지 않습니다.
        if (value instanceof Promise) void value.catch(() => geometry.invalidate());
        return value;
      } catch (error) {
        geometry.invalidate();
        throw error;
      }
    }) as F;
  }
  return Object.freeze({
    getEditorState: () => state,
    read: <T>(callback: SynchronousCallback<[EditorState], T>): T => runRead(callback, state),
    load: geometryGuard(load),
    createDocument: geometryGuard(createDocument),
    unlock: geometryGuard(unlock),
    cancelLoad: geometryGuard(cancelLoad),
    dispatchCommand: geometryGuard(dispatchCommand),
    update: geometryGuard(update),
    save: geometryGuard(save),
    captureDocumentOutput,
    refresh: geometryGuard(refresh),
    requestExperimental: geometryGuard(requestExperimental),
    readResource: geometryGuard(readResource),
    getFormattingCapabilities: geometryGuard(getFormattingCapabilities),
    getReplaceAllCapabilities: geometryGuard(getReplaceAllCapabilities),
    getDocumentInsertionCapabilities: geometryGuard(getDocumentInsertionCapabilities),
    getPageSettings: geometryGuard(getPageSettings),
    getSourceTableCellSplitCapabilities: geometryGuard(getSourceTableCellSplitCapabilities),
    queryFormatting: geometryGuard(queryFormatting),
    setSelection: geometryGuard(setSelection),
    listParagraphBulletDefinitions: geometryGuard(listParagraphBulletDefinitions),
    listNamedFields: geometryGuard(listNamedFields),
    readNamedField: geometryGuard(readNamedField),
    readNamedFieldParameters: geometryGuard(readNamedFieldParameters),
    moveToNamedField: geometryGuard(moveToNamedField),
    acquireInputSurface: geometryGuard(acquireInputSurface),
    dispose: geometryGuard(dispose),
    undo: (token?: StateToken) => historyCommand(UNDO_COMMAND, token),
    redo: (token?: StateToken) => historyCommand(REDO_COMMAND, token),
    registerStateListener: (listener: (state: EditorState) => unknown) =>
      register(stateListeners, listener),
    registerUpdateListener: (listener: (state: EditorState) => unknown) =>
      register(updateListeners, listener),
    registerErrorListener: (listener: (event: EditorError) => unknown) =>
      register(errorListeners, listener),
    registerCommand: <T>(
      command: EditorCommand<T>,
      callback: (payload: T) => boolean,
      priority = 0,
    ) => {
      assertLive();
      return registry.register(command, callback, priority);
    },
  });
}
export type HeadlessEditor = ReturnType<typeof createEditor>;
