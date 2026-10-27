import {
  hasRuntimeAdmission,
  requestAtRuntimeAdmission,
  RuntimeAdmissionRejected,
} from '../internal/runtime-admission.ts';
import { atomicSelector, validateParagraphFormattingPatch } from '../commands/atomic-formatting.ts';
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
  UNDO_COMMAND,
  REDO_COMMAND,
  SET_CHARACTER_PROPERTIES_COMMAND,
  SET_PARAGRAPH_ALIGNMENT_COMMAND,
  SET_CHARACTER_UNDERLINE_COMMAND,
  SET_CHARACTER_STRIKE_COMMAND,
  SET_CHARACTER_TEXT_COLOR_COMMAND,
  SET_CHARACTER_FONT_NAME_COMMAND,
  APPLY_FORMATTING_PATCH_COMMAND,
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
    if (origin) geometry.publish(previousState, state, origin);
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
    const capabilities = reply.capabilities ?? {
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
              'historyPoisoned',
            ].includes(key),
        ),
      ),
    };
    return {
      content: ownObservation(writePolicy.observe(reply.content, observedEditable))(),
      capabilities: ownObservation(writePolicy.capabilities(capabilities, observedEditable))(),
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
    new EditorState(
      {
        editorId,
        viewRevision: state.viewRevision + 1,
        stateVersion: stateVersion + 1,
        ...nextData,
      },
      runRead,
    );
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
    const bytes = copyOwned(input);
    if (!(bytes instanceof Uint8Array) && !(bytes instanceof ArrayBuffer))
      throw TypeError('InvalidDocumentBytes');
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
          );
        } catch (error) {
          if (!terminal) install({ status: previousState.status });
          notifyError(error, ctx);
          throw error;
        } finally {
          if (candidate && candidate !== active && !keepLocked) await release(candidate);
          if (bytes instanceof Uint8Array) bytes.fill(0);
          else new Uint8Array(bytes).fill(0);
          delete message.password;
          loads.delete(job);
        }
      },
      { replace: 'load', abort: cancellation, guard },
    ).finally(() => {
      loads.delete(job);
      if (bytes instanceof Uint8Array) bytes.fill(0);
      else new Uint8Array(bytes).fill(0);
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
      admissionGuard?.();
      reserved = ++revisionClock;
      // Once request() begins, an exception cannot prove that Native did not apply.
      try {
        reply = admissionGuard
          ? await requestAtRuntimeAdmission(active!, message, ctx, admissionGuard)
          : await active!.request(message, ctx);
        verifyReply(reply, ctx);
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
        if (message.kind === 'formatting-patch' && reply.formattingRefreshRequired === true)
          install({ status: 'refresh-required' });
        if (message.kind === 'formatting-patch' && reply.formattingNativeCode === 2) {
          if (reply.error) notifyError(reply.error, ctx, false);
          return result('known-no-op', ctx, reply.error, reply);
        }
        if (message.kind === 'formatting-patch' && reply.error) {
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
        const patch = contentPatch(reply);
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
          takeGeometryOrigin(active!, reply, ctx),
        );
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
  function capture<T>(
    command: EditorCommand<T>,
    payload: T,
    snapshot: EditorState = state,
  ): PendingCommand {
    if (!command || typeof command.id !== 'symbol') throw Error('InvalidCommand');
    const owned = copyOwned(payload);
    return {
      command: command as EditorCommand<unknown>,
      payload: owned,
      token:
        (owned as { target?: StateToken; token?: StateToken })?.target ??
        (owned as { token?: StateToken })?.token ??
        snapshot.token,
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
      if (pending.command.id === APPLY_FORMATTING_PATCH_COMMAND.id) {
        const payload = pending.payload as ApplyFormattingPatchPayload;
        if (
          !payload ||
          Object.keys(payload).some((key) => !['target', 'patch', 'selectionVersion'].includes(key))
        )
          throw Error('InvalidFormattingPatch');
        validateParagraphFormattingPatch(payload.patch);
        const selector = atomicSelector(payload.target, state, true, false);
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
    const owned = copyOwned(message),
      settings = copyOwned(experimental);
    if (!owned || typeof owned.kind !== 'string' || typeof settings.mutation !== 'boolean')
      throw Error('InvalidExperimentalRequest');
    if (
      ['load', 'unlock', 'enable', 'save', 'refresh', 'undo', 'redo', 'splice'].includes(owned.kind)
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
    unlock: geometryGuard(unlock),
    cancelLoad: geometryGuard(cancelLoad),
    dispatchCommand: geometryGuard(dispatchCommand),
    update: geometryGuard(update),
    save: geometryGuard(save),
    refresh: geometryGuard(refresh),
    requestExperimental: geometryGuard(requestExperimental),
    readResource: geometryGuard(readResource),
    getFormattingCapabilities: geometryGuard(getFormattingCapabilities),
    queryFormatting: geometryGuard(queryFormatting),
    setSelection: geometryGuard(setSelection),
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
