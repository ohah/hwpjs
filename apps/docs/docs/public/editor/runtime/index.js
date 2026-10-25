import {
  sourceTextChange,
  availableSectionCopyRequest,
  characterPropertyArgs,
  paragraphAlignmentKey,
  paragraphAlignmentValue,
  characterUnderlineArg
} from "./index-zatkwww3.js";
import {
  copyOwned,
  freezeDTO,
  isPromiseLike,
  discardPromise,
  ownObservation
} from "./index-d5cy4mj4.js";

function paragraphSelectionOwner(paragraph) {
  const cell = paragraph?.tableCell;
  const drawing = paragraph?.drawingText ?? paragraph?.drawingCaption;
  if (cell && drawing || paragraph?.drawingText && paragraph?.drawingCaption)
    return null;
  if (drawing) {
    if (![paragraph.section, drawing.drawingNode, drawing.listNode].every((value) => Number.isInteger(value) && value >= 0 && value <= 4294967295))
      return null;
    const kind = paragraph.drawingText ? "text" : "caption";
    return `section:${paragraph.section}:drawing:${drawing.drawingNode}:${kind}:list:${drawing.listNode}`;
  }
  if (cell) {
    if (![paragraph.section, cell.tableNode, cell.listNode].every((value) => Number.isInteger(value) && value >= 0))
      return null;
    return `section:${paragraph.section}:table:${cell.tableNode}:list:${cell.listNode}`;
  }
  return paragraph?.selectionOwner ?? null;
}

function validateToken(token, state, view = false) {
  if (!token || token.editorId !== state.editorId || token.documentId !== state.documentId || token.generation !== state.generation || token.operationRevision !== state.operationRevision || view && token.viewRevision !== state.viewRevision)
    throw Error("StaleTarget");
}
function validateSelection(target, state, editable = false) {
  validateToken(target, state, true);
  if (target.coordinateSpace !== "display" || !["hwp5", "hwpx"].includes(target.format) || !["forward", "backward"].includes(target.affinity))
    throw Error("InvalidCoordinateSpace");
  const content = state.content;
  if (!content || content.format !== target.format)
    throw Error("InvalidCoordinateSpace");
  if (![target.section, target.paragraph, target.startUnit, target.endUnit].every((x) => Number.isSafeInteger(x) && x >= 0) || target.endUnit < target.startUnit)
    throw Error("InvalidTextPosition");
  const matches = content.paragraphs?.filter((row) => row.section === target.section && row.paragraph === target.paragraph);
  const row = matches?.length === 1 ? matches[0] : undefined;
  if (!row || row.clipped || target.owner !== paragraphSelectionOwner(row) || !paragraphSelectionOwner(row))
    throw Error("InvalidSelectionOwner");
  if (editable && !row.editable)
    throw Error("SelectionNotEditable");
  if (typeof row.text !== "string" || target.endUnit > row.text.length)
    throw Error("InvalidTextPosition");
  const insideSurrogate = (at) => at > 0 && at < row.text.length && /[\uD800-\uDBFF]/.test(row.text[at - 1]) && /[\uDC00-\uDFFF]/.test(row.text[at]);
  if (insideSurrogate(target.startUnit) || insideSurrogate(target.endUnit))
    throw Error("InvalidScalarBoundary");
  return row;
}
function selectionMessage(target, state) {
  const row = validateSelection(target, state, true);
  if (row.createdCell)
    throw Error("CreatedCellRequiresSurfacePort");
  const change = { section: target.section, paragraph: target.paragraph, startUnit: target.startUnit, endUnit: target.endUnit };
  const mapped = target.format === "hwp5" ? sourceTextChange(change, row.sourceOffsets) : change;
  if (mapped.endUnit - mapped.startUnit !== target.endUnit - target.startUnit)
    throw Error("ProtectedAnchorRange");
  return { ...mapped, ...row.currentReference === undefined ? {} : { reference: row.currentReference } };
}

var unavailable = Object.freeze({ available: false, canUndo: false, canRedo: false });
function getHistoryAvailability(state) {
  if (state.status !== "ready")
    return unavailable;
  const { nativeHistoryRevision: current, nativeHistoryRevisions: reachable } = state;
  const valid = (value) => typeof value === "number" && Number.isInteger(value) && value >= 0 && value < 4294967295;
  if (!valid(current) || !Array.isArray(reachable) || reachable.length < 1 || reachable.length > 65536 || reachable[0] !== current || !reachable.every(valid) || new Set(reachable).size !== reachable.length)
    return unavailable;
  return Object.freeze({ available: true, canUndo: reachable.some((revision) => revision < current), canRedo: reachable.some((revision) => revision > current) });
}

class SelectionHistory {
  #documentId = null;
  #generation = -1;
  #locations = new Map;
  clear() {
    this.#locations.clear();
    this.#documentId = null;
    this.#generation = -1;
  }
  #reachable(state) {
    if (!getHistoryAvailability(state).available)
      return;
    return new Set(state.nativeHistoryRevisions);
  }
  observe(state) {
    if (state.documentId !== this.#documentId || state.generation !== this.#generation) {
      this.clear();
      this.#documentId = state.documentId;
      this.#generation = state.generation;
    }
    if (state.status === "disposed") {
      this.clear();
      return;
    }
    if (state.status !== "ready" || !state.documentId)
      return;
    const reachable = this.#reachable(state);
    if (!reachable) {
      this.#locations.clear();
      return;
    }
    for (const revision of this.#locations.keys())
      if (!reachable.has(revision))
        this.#locations.delete(revision);
    const selected = state.selection;
    if (selected === undefined)
      return;
    const revision = state.nativeHistoryRevision;
    if (selected === null) {
      this.#locations.set(revision, null);
      return;
    }
    try {
      const target = selected;
      validateSelection(target, state);
      this.#locations.set(revision, Object.freeze({
        coordinateSpace: target.coordinateSpace,
        format: target.format,
        owner: target.owner,
        section: target.section,
        paragraph: target.paragraph,
        startUnit: target.startUnit,
        endUnit: target.endUnit,
        affinity: target.affinity
      }));
    } catch {
      this.#locations.delete(revision);
    }
  }
  restore(state) {
    if (state.status !== "ready" || !state.documentId || state.documentId !== this.#documentId || state.generation !== this.#generation)
      return;
    const reachable = this.#reachable(state), revision = state.nativeHistoryRevision;
    if (!reachable || !reachable.has(revision))
      return;
    const location = this.#locations.get(revision);
    if (location === undefined || location === null)
      return location;
    const target = Object.freeze({ ...location, ...state.token });
    try {
      validateSelection(target, state);
      return target;
    } catch {
      return;
    }
  }
}

function loadSourceOptions(options) {
  if (options.availableSectionCopy === undefined)
    return {};
  availableSectionCopyRequest({
    format: options.format,
    availableSectionCopy: options.availableSectionCopy,
    distribution: options.enableOptions?.distribution,
    normalizeObservedCfb: options.enableOptions?.normalizeObservedCfb
  });
  return { availableSectionCopy: options.availableSectionCopy };
}

function isWellFormedText(text) {
  return !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(text);
}

class EditorState {
  editorId;
  documentId;
  generation;
  operationRevision;
  viewRevision;
  stateVersion;
  status;
  nativeHistoryRevision;
  savedOperationRevision;
  #historyRevisions;
  #content;
  #capabilities;
  #selection;
  #read;
  constructor(data, read = localRead) {
    this.editorId = data.editorId;
    this.documentId = data.documentId;
    this.generation = data.generation;
    this.operationRevision = data.operationRevision;
    this.viewRevision = data.viewRevision;
    this.stateVersion = data.stateVersion;
    this.status = data.status;
    this.nativeHistoryRevision = data.nativeHistoryRevision;
    this.#historyRevisions = ownObservation(data.nativeHistoryRevisions);
    this.savedOperationRevision = data.savedOperationRevision;
    this.#content = ownObservation(data.content);
    this.#capabilities = ownObservation(data.capabilities);
    this.#selection = ownObservation(data.selection);
    this.#read = read;
    Object.freeze(this);
  }
  get nativeHistoryRevisions() {
    return this.#historyRevisions();
  }
  get token() {
    return Object.freeze({ editorId: this.editorId, documentId: this.documentId, generation: this.generation, operationRevision: this.operationRevision, viewRevision: this.viewRevision });
  }
  get content() {
    return this.#content();
  }
  get capabilities() {
    return this.#capabilities();
  }
  get selection() {
    return this.#selection();
  }
  read(callback) {
    return this.#read(callback, this);
  }
}
function localRead(callback, state) {
  const result = callback(state);
  if (isPromiseLike(result)) {
    discardPromise(result);
    throw Error("AsyncRead");
  }
  return result;
}

var SURFACE_READ_KINDS = Object.freeze([
  "query-window",
  "query-edit-window",
  "query-edit-range",
  "query-split-range",
  "query-current-references",
  "query-current-source-references",
  "query-current-text",
  "query-created-tables",
  "picture-bytes",
  "table-background-bytes",
  "chart-display",
  "chart-points",
  "chart-series-text",
  "chart-rich-text",
  "inline-string-sources",
  "equation-sources",
  "equation-script-query",
  "dutmal-text-query"
]);
var SURFACE_MUTATION_KINDS = Object.freeze([
  "splice",
  "splice-current",
  "splice-font-name",
  "splice-character-properties",
  "created-cell-text",
  "insert-table",
  "undo",
  "redo",
  "split",
  "merge",
  "format",
  "replace-paragraph-ranges",
  "character-properties",
  "character-properties-ranges",
  "character-font",
  "character-font-ranges",
  "character-font-name",
  "character-font-name-ranges",
  "character-outline",
  "character-outline-ranges",
  "character-effect",
  "character-effect-ranges",
  "character-shade",
  "character-shade-ranges",
  "character-text-color",
  "character-text-color-ranges",
  "character-strike",
  "character-strike-ranges",
  "character-strike-color",
  "character-underline",
  "character-underline-ranges",
  "character-underline-color",
  "paragraph-format",
  "paragraph-alignment",
  "paragraph-spacing",
  "paragraph-margins",
  "formula-definition",
  "manual-formula-result",
  "chart-points-set",
  "chart-numeric-point",
  "chart-point",
  "chart-series-text-set",
  "chart-rich-text-set",
  "equation-script-set",
  "dutmal-text",
  "radio-select",
  "checkbox-state",
  "form-text",
  "picture-resize",
  "picture-current-size",
  "picture-dimensions",
  "table-column-width",
  "cell-size"
]);
var SURFACE_VIEW_KINDS = Object.freeze(["enable", "set-edit-window"]);
var reads = new Set(SURFACE_READ_KINDS);
var mutations = new Set(SURFACE_MUTATION_KINDS);
var views = new Set(SURFACE_VIEW_KINDS);
function surfaceOperation(kind) {
  return reads.has(kind) ? "read" : mutations.has(kind) ? "mutation" : views.has(kind) ? "view" : undefined;
}

class CancellationFence {
  #cancelled = false;
  #listeners = new Set;
  get cancelled() {
    return this.#cancelled;
  }
  get subscriberCount() {
    return this.#listeners.size;
  }
  subscribe(listener) {
    if (this.#cancelled) {
      listener();
      return () => {};
    }
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }
  cancel() {
    if (this.#cancelled)
      return;
    this.#cancelled = true;
    const listeners = [...this.#listeners];
    this.#listeners.clear();
    for (const listener of listeners)
      listener();
  }
}
async function interruptible(task, fences) {
  const already = fences.find(({ fence }) => fence.cancelled);
  if (already) {
    Promise.resolve(task).catch(() => {});
    throw Error(already.error);
  }
  const unsubscribe = [];
  const interrupted = new Promise((_, reject) => {
    for (const { fence, error } of fences)
      unsubscribe.push(fence.subscribe(() => reject(Error(error))));
  });
  try {
    return await Promise.race([task, interrupted]);
  } finally {
    for (const off of unsubscribe)
      off();
  }
}

class FifoScheduler {
  #tail = Promise.resolve();
  enqueue(task) {
    const result = this.#tail.then(task);
    this.#tail = result.then(() => {}, () => {});
    return result;
  }
  drain() {
    return this.#tail.then(() => {});
  }
}

class CommandRegistry {
  #handlers = new Map;
  #order = 0;
  register(command, callback, priority) {
    if (!Number.isFinite(priority))
      throw Error("InvalidPriority");
    const row = { priority, order: this.#order++, callback };
    const rows = this.#handlers.get(command.id) ?? [];
    rows.push(row);
    this.#handlers.set(command.id, rows);
    let active = true;
    return () => {
      if (!active)
        return;
      active = false;
      const next = (this.#handlers.get(command.id) ?? []).filter((x) => x !== row);
      if (next.length)
        this.#handlers.set(command.id, next);
      else
        this.#handlers.delete(command.id);
    };
  }
  capture(command) {
    return [...this.#handlers.get(command.id) ?? []].sort((a, b) => b.priority - a.priority || a.order - b.order);
  }
  run(handlers, payload, copy) {
    for (const handler of handlers) {
      if (Object.prototype.toString.call(handler.callback) === "[object AsyncFunction]")
        throw Error("AsyncCommandHandler");
      const value = handler.callback(copy(payload));
      if (isPromiseLike(value)) {
        discardPromise(value);
        throw Error("AsyncCommandHandler");
      }
      if (typeof value !== "boolean")
        throw Error("InvalidCommandHandlerResult");
      if (value)
        return true;
    }
    return false;
  }
  clear() {
    this.#handlers.clear();
  }
}

function createCommand(name) {
  if (!name)
    throw Error("InvalidCommand");
  return Object.freeze({ name, id: Symbol(name) });
}
var SPLICE_TEXT_COMMAND = createCommand("splice-text");
var UNDO_COMMAND = createCommand("undo");
var REDO_COMMAND = createCommand("redo");
var SET_CHARACTER_PROPERTIES_COMMAND = createCommand("set-character-properties");
var SET_PARAGRAPH_ALIGNMENT_COMMAND = createCommand("set-paragraph-alignment");
var SET_CHARACTER_UNDERLINE_COMMAND = createCommand("set-character-underline");

var passwordErrors = new Set(["InvalidPassword", "InvalidPasswordUnicode", "WrongPasswordOrCorruptPayload"]);
function retryablePasswordReply(reply) {
  return typeof reply.error === "string" && passwordErrors.has(reply.error) && (reply.applied === false || reply.meta?.application === "unapplied") && reply.applied !== true && reply.meta?.application !== "applied" && reply.meta?.changed !== true && reply.changed !== true;
}

class PasswordAttemptError extends Error {
  retryable = true;
  constructor(message) {
    super(message);
    this.name = "PasswordAttemptError";
  }
}

var identity = (reference) => reference && typeof reference === "object" ? Object.fromEntries(Object.entries(reference).filter(([key]) => key !== "epoch")) : reference;
function formattingSelection(previous, patch, revision) {
  const selected = previous.selection;
  if (!selected)
    return;
  try {
    const old = validateSelection(selected, previous);
    const next = new EditorState({
      editorId: previous.editorId,
      documentId: previous.documentId,
      generation: previous.generation,
      operationRevision: revision,
      viewRevision: previous.viewRevision,
      stateVersion: previous.stateVersion,
      status: "ready",
      ...patch
    });
    const target = { ...selected, ...next.token }, row = validateSelection(target, next);
    if (old.text !== row.text || JSON.stringify(identity(old.currentReference)) !== JSON.stringify(identity(row.currentReference)) || JSON.stringify(old.sourceOffsets) !== JSON.stringify(row.sourceOffsets) || JSON.stringify(old.tableCell) !== JSON.stringify(row.tableCell) || JSON.stringify(old.drawingText) !== JSON.stringify(row.drawingText) || JSON.stringify(old.drawingCaption) !== JSON.stringify(row.drawingCaption) || JSON.stringify(old.createdCell) !== JSON.stringify(row.createdCell))
      return;
    return target;
  } catch {
    return;
  }
}

function validateFormattingTarget(target, state, character, capability = character ? "characterPropertiesAvailable" : "paragraphAlignmentAvailable") {
  const row = validateSelection(target, state, true);
  if (row.createdCell)
    throw Error("CreatedCellRequiresSurfacePort");
  const position = character ? selectionMessage(target, state) : { section: target.section, paragraph: target.paragraph, startUnit: target.startUnit, endUnit: target.endUnit, reference: undefined };
  const content = state.content;
  if (content[capability] !== true)
    throw Error("FormattingCapabilityUnavailable");
  if (!row.tableCell && !row.drawingText && !row.drawingCaption && target.owner !== `section:${target.section}:body`)
    throw Error("UnsupportedFormattingOwner");
  if (target.format === "hwp5") {
    const ref = row.currentReference;
    if (ref?.kind !== "original" || ref.section !== target.section || typeof ref.id !== "string" || !/^(0|[1-9][0-9]*)$/.test(ref.id) || BigInt(ref.id) > 0xffffffffn)
      throw Error("UnsupportedFormattingReference");
  }
  const { reference: _, ...range } = position;
  if (character && target.startUnit === target.endUnit)
    throw Error("EmptyCharacterSelection");
  return range;
}
function formattingMessage(payload, state, character) {
  const range = validateFormattingTarget(payload.target, state, character);
  if (character) {
    const properties = payload.properties;
    characterPropertyArgs(properties);
    return { kind: "character-properties", ...range, properties };
  }
  const alignment = payload.alignment;
  if (paragraphAlignmentValue(alignment) === undefined)
    throw Error("InvalidParagraphAlignment");
  return { kind: "paragraph-alignment", section: range.section, paragraph: range.paragraph, alignment };
}

function underlineMessage(payload, state) {
  const range = validateFormattingTarget(payload.target, state, true, "characterUnderlineAvailable");
  characterUnderlineArg(payload.kind);
  return { kind: "character-underline", ...range, underlineKind: payload.kind };
}

var nextEditorId = 0;
var nextEditorInstance = 0;
var usedRuntimes = new WeakSet;
var errorText = (error) => error instanceof Error ? error.message : String(error);
var isWellFormed = isWellFormedText;
var isAsyncFunction = (callback) => Object.prototype.toString.call(callback) === "[object AsyncFunction]";
function createEditor(options) {
  const editorId = options.editorId ?? `hwpjs-editor-${++nextEditorId}`;
  if (nextEditorInstance >= Number.MAX_SAFE_INTEGER)
    throw Error("EditorIdentityExhausted");
  const instanceId = String(++nextEditorInstance);
  const queue = new FifoScheduler, admission = new FifoScheduler, registry = new CommandRegistry;
  const selectionHistory = new SelectionHistory;
  let active, locked;
  let terminal = false, disposePromise, requestId = 0, nextGeneration = 0, revisionClock = 0, stateVersion = 0;
  let readDepth = 0, collecting = false, handling = false;
  const stateListeners = new Set, updateListeners = new Set, errorListeners = new Set;
  const released = new WeakSet;
  const loads = new Set;
  let surfaceEpoch = 0;
  let surface;
  const disposedFence = new CancellationFence;
  const runRead = (callback, snapshot) => {
    if (typeof callback !== "function")
      throw TypeError("InvalidReadCallback");
    if (isAsyncFunction(callback))
      throw Error("AsyncRead");
    readDepth++;
    try {
      const result = callback(snapshot);
      if (isPromiseLike(result)) {
        discardPromise(result);
        throw Error("AsyncRead");
      }
      return result;
    } finally {
      readDepth--;
    }
  };
  let state = new EditorState({ editorId, documentId: null, generation: 0, operationRevision: 0, viewRevision: 0, stateVersion: 0, status: "empty" }, runRead);
  function assertPublicMutation() {
    if (readDepth)
      throw Error("ReadMutation");
    if (collecting)
      throw Error("CollectorOnly");
    if (handling)
      throw Error("CommandHandlerMutation");
  }
  function assertLive() {
    if (terminal)
      throw Error("EditorDisposed");
  }
  function notifyError(error, context, applied = false) {
    if (terminal)
      return;
    const event = Object.freeze({ error, context: context ? Object.freeze({ ...context }) : undefined, applied });
    const final = (cause) => {
      try {
        const value = options.onError?.(Object.freeze({ ...event, error: cause }));
        discardPromise(value);
      } catch {}
    };
    if (!errorListeners.size) {
      final(error);
      return;
    }
    for (const listener of [...errorListeners]) {
      if (terminal)
        break;
      try {
        const result = listener(event);
        if (isPromiseLike(result))
          Promise.resolve(result).catch(final);
      } catch (cause) {
        final(cause);
      }
    }
  }
  function notify(listeners, snapshot, ctx, applied = false) {
    for (const listener of listeners) {
      if (terminal)
        break;
      try {
        const result = listener(snapshot);
        if (isPromiseLike(result))
          Promise.resolve(result).catch((error) => notifyError(error, ctx, applied));
      } catch (error) {
        notifyError(error, ctx, applied);
      }
    }
  }
  function install(patch, mutation = false, ctx) {
    if (terminal)
      return;
    const states = [...stateListeners], updates = mutation ? [...updateListeners] : [];
    const next = { editorId, documentId: state.documentId, generation: state.generation, operationRevision: state.operationRevision, viewRevision: state.viewRevision, stateVersion: ++stateVersion, status: state.status, content: state.content, capabilities: state.capabilities, nativeHistoryRevision: state.nativeHistoryRevision, nativeHistoryRevisions: state.nativeHistoryRevisions, savedOperationRevision: state.savedOperationRevision, selection: state.selection, ...patch };
    state = new EditorState(next, runRead);
    selectionHistory.observe(state);
    const snapshot = state;
    notify(states, snapshot, ctx, mutation);
    notify(updates, snapshot, ctx, mutation);
  }
  function context(token = state.token) {
    return { editorId, documentId: token.documentId, generation: token.generation, requestId: ++requestId, operationRevision: token.operationRevision };
  }
  function verifyReply(reply, ctx) {
    if (!reply || typeof reply !== "object" || typeof reply.kind !== "string")
      throw Error("InvalidRuntimeReply");
    const returned = reply.meta?.context;
    if (returned && ["editorId", "documentId", "generation", "requestId", "operationRevision"].some((key) => returned[key] !== ctx[key]))
      throw Error("MismatchedRuntimeReply");
  }
  async function release(runtime) {
    if (!runtime || released.has(runtime))
      return;
    released.add(runtime);
    await runtime.dispose();
  }
  function enqueue(task) {
    if (terminal)
      return Promise.reject(Error("EditorDisposed"));
    return queue.enqueue(async () => {
      assertLive();
      return task();
    });
  }
  function assertSurface(record) {
    assertLive();
    if (!record.active || surface !== record)
      throw Error("InputSurfaceDetached");
  }
  function cancelComposition(record, reason) {
    try {
      record.hooks.cancelComposition(reason);
    } catch (error) {
      notifyError(error);
      if (reason === "load" || reason === "external-replace")
        throw error;
    }
  }
  function admit(task, settings = {}) {
    if (terminal)
      return Promise.reject(Error("EditorDisposed"));
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
        const interruptions = [{ fence: disposedFence, error: "EditorDisposed" }, { fence: record.fence, error: "InputSurfaceDetached" }];
        if (settings.abort)
          interruptions.push({ fence: settings.abort, error: "LoadCancelled" });
        const outcome = await interruptible(settlement, interruptions);
        assertLive();
        assertSurface(record);
        settings.guard?.();
        if (outcome !== "committed" && outcome !== "unchanged")
          throw Error("CompositionBlocked");
        if (settings.replace)
          cancelComposition(record, settings.replace);
      }
      assertLive();
      settings.guard?.();
      return enqueue(async () => {
        if (record)
          assertSurface(record);
        else if (surface)
          throw Error("InputSurfaceChanged");
        return task();
      });
    });
  }
  async function newRuntime() {
    const runtime = await options.runtimeFactory();
    if (!runtime || typeof runtime.request !== "function" || typeof runtime.dispose !== "function")
      throw Error("InvalidRuntime");
    if (usedRuntimes.has(runtime))
      throw Error("RuntimeAlreadyOwned");
    usedRuntimes.add(runtime);
    return runtime;
  }
  function history(reply) {
    return Number.isSafeInteger(reply.historyRevision) ? reply.historyRevision : undefined;
  }
  function contentPatch(reply, inherit = true) {
    if (reply.content === undefined)
      throw Error("SnapshotMissing");
    const capabilities = reply.capabilities ?? { ...inherit && state.documentId !== null ? state.capabilities : {}, ...Object.fromEntries(Object.entries(reply).filter(([key]) => !["content", "kind", "error", "applied", "bytes", "meta", "origin", "requestId", "historyRevision", "historyRevisions"].includes(key))) };
    return { content: ownObservation(reply.content)(), capabilities: ownObservation(capabilities)(), nativeHistoryRevision: history(reply), nativeHistoryRevisions: reply.historyRevisions, selection: undefined, viewRevision: state.viewRevision + 1 };
  }
  async function finishCandidate(runtime, message, ctx, editable, enableOptions, first, guard = () => {}) {
    let reply = first ?? await runtime.request(message, ctx);
    verifyReply(reply, ctx);
    if (reply.error)
      throw Error(reply.error);
    if (editable) {
      const enableContext = { ...ctx, requestId: ++requestId };
      reply = await runtime.request({ ...enableOptions, kind: "enable" }, enableContext);
      verifyReply(reply, enableContext);
      if (reply.error)
        throw Error(reply.error);
    }
    const patch = contentPatch(reply, false);
    assertLive();
    guard();
    const nextRevision = ++revisionClock;
    const nextData = { ...patch, documentId: ctx.documentId, generation: ctx.generation, operationRevision: nextRevision, savedOperationRevision: nextRevision, status: "ready" };
    new EditorState({ editorId, viewRevision: state.viewRevision + 1, stateVersion: stateVersion + 1, ...nextData }, runRead);
    const previous = active;
    active = runtime;
    install(nextData, true, ctx);
    try {
      await release(previous);
    } catch (error) {
      notifyError(error, ctx);
    }
    return state;
  }
  function load(input, loadOptions) {
    assertPublicMutation();
    const bytes = copyOwned(input);
    if (!(bytes instanceof Uint8Array) && !(bytes instanceof ArrayBuffer))
      throw TypeError("InvalidDocumentBytes");
    const owned = copyOwned(loadOptions);
    if (!owned || !["hwp5", "hwpx"].includes(owned.format))
      throw Error("InvalidDocumentFormat");
    const sourceOptions = loadSourceOptions(owned);
    const cancellation = new CancellationFence;
    const job = { cancelled: false, fence: cancellation };
    loads.add(job);
    const guard = () => {
      if (job.cancelled)
        throw Error("LoadCancelled");
    };
    const tokenGeneration = ++nextGeneration, documentId = `${editorId}:instance:${instanceId}:document:${tokenGeneration}`;
    const message = { kind: "load", bytes, format: owned.format, ...sourceOptions, ...owned.password === undefined ? {} : { password: owned.password }, ...owned.allowObservedChartOleDeviations === undefined ? {} : { allowObservedChartOleDeviations: owned.allowObservedChartOleDeviations } };
    return admit(async () => {
      const previousState = state;
      install({ status: "loading" });
      let candidate, keepLocked = false;
      const ctx = { editorId, documentId, generation: tokenGeneration, requestId: ++requestId, operationRevision: 0 };
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
            locked = { runtime: candidate, message: { ...message, password: undefined }, context: ctx, editable: owned.editable !== false, enableOptions: owned.enableOptions };
            keepLocked = true;
          }
          throw Error(reply.error);
        }
        return await finishCandidate(candidate, message, ctx, owned.editable !== false, owned.enableOptions, reply, guard);
      } catch (error) {
        if (!terminal)
          install({ status: previousState.status });
        notifyError(error, ctx);
        throw error;
      } finally {
        if (candidate && candidate !== active && !keepLocked)
          await release(candidate);
        if (bytes instanceof Uint8Array)
          bytes.fill(0);
        else
          new Uint8Array(bytes).fill(0);
        delete message.password;
        loads.delete(job);
      }
    }, { replace: "load", abort: cancellation, guard }).finally(() => {
      loads.delete(job);
      if (bytes instanceof Uint8Array)
        bytes.fill(0);
      else
        new Uint8Array(bytes).fill(0);
      delete message.password;
    });
  }
  function unlock(password, unlockOptions = {}) {
    assertPublicMutation();
    if (typeof password !== "string")
      throw TypeError("InvalidPassword");
    const owned = copyOwned(unlockOptions);
    return admit(async () => {
      const candidate = locked;
      if (!candidate)
        throw Error("NoLockedCandidate");
      const ctx = { ...candidate.context, requestId: ++requestId };
      let retryable = false;
      try {
        const reply = await candidate.runtime.request({ ...owned, kind: "unlock", password }, ctx);
        verifyReply(reply, ctx);
        if (reply.error) {
          retryable = retryablePasswordReply(reply);
          throw Error(reply.error);
        }
        assertLive();
        const result = await finishCandidate(candidate.runtime, candidate.message, ctx, candidate.editable, candidate.enableOptions, reply, () => {
          if (candidate.cancelled)
            throw Error("LoadCancelled");
        });
        locked = undefined;
        return result;
      } catch (error) {
        if (retryable && locked === candidate && !candidate.cancelled && !terminal) {
          const retry = new PasswordAttemptError(errorText(error));
          notifyError(retry, ctx, false);
          throw retry;
        }
        if (locked === candidate)
          locked = undefined;
        await release(candidate.runtime);
        notifyError(error, ctx);
        throw error;
      }
    }, { replace: "external-replace" });
  }
  function cancelLoad() {
    assertPublicMutation();
    for (const job of loads) {
      job.cancelled = true;
      job.fence.cancel();
    }
    if (locked)
      locked.cancelled = true;
    return enqueue(async () => {
      const candidate = locked;
      locked = undefined;
      await release(candidate?.runtime);
    });
  }
  function result(status, ctx, error, reply) {
    let ownedReply;
    try {
      if (reply !== undefined)
        ownedReply = freezeDTO(copyOwned(reply, true));
    } catch (metadataError) {
      notifyError(metadataError, ctx, status.startsWith("committed"));
    }
    const answer = { status, context: Object.freeze({ ...ctx }), state, error: error === undefined ? undefined : errorText(error), changed: reply?.meta?.changed ?? null, reply: ownedReply };
    return Object.freeze(answer);
  }
  function reject(ctx, error) {
    notifyError(error, ctx, false);
    return result("rejected-unapplied", ctx, error);
  }
  function requireReady(token, view = false) {
    assertLive();
    if (!active || state.status !== "ready")
      throw Error(state.status === "refresh-required" ? "RefreshRequired" : "EditorNotReady");
    validateToken(token, state, view);
  }
  async function mutate(message, token, preserveFormattingSelection = false) {
    const ctx = context(token);
    let reserved, reply;
    try {
      requireReady(token);
      reserved = ++revisionClock;
      try {
        reply = await active.request(message, ctx);
        verifyReply(reply, ctx);
      } catch (error) {
        install({ operationRevision: reserved, status: "refresh-required" });
        notifyError(error, ctx, "unknown");
        return result("committed-refresh-required", ctx, error);
      }
      const application = reply.meta?.application ?? (reply.applied === true ? "applied" : reply.error && reply.applied === false ? "unapplied" : undefined);
      if (application === "unapplied") {
        if (reply.error)
          return reject(ctx, reply.error);
        return result("known-no-op", ctx, undefined, reply);
      }
      const noOp = !reply.error && (reply.meta?.changed === false || reply.changed === false);
      if (noOp)
        return result("known-no-op", ctx, undefined, reply);
      if (reply.error || reply.content === undefined) {
        install({ operationRevision: reserved, status: "refresh-required", nativeHistoryRevision: history(reply) });
        notifyError(reply.error ?? "SnapshotMissing", ctx, application === "applied" ? true : "unknown");
        return result("committed-refresh-required", ctx, reply.error ?? "SnapshotMissing", reply);
      }
      try {
        const patch = contentPatch(reply);
        let selection = preserveFormattingSelection ? formattingSelection(state, patch, reserved) : undefined;
        if (message.kind === "undo" || message.kind === "redo") {
          const provisional = new EditorState({ ...state.token, ...patch, operationRevision: reserved, stateVersion: state.stateVersion + 1, status: "ready" }, runRead);
          selection = selectionHistory.restore(provisional);
        }
        install({ ...patch, selection, operationRevision: reserved, status: "ready" }, true, ctx);
      } catch (error) {
        install({ operationRevision: reserved, status: "refresh-required" });
        notifyError(error, ctx, true);
        return result("committed-refresh-required", ctx, error);
      }
      return result("committed-with-snapshot", ctx, undefined, reply);
    } catch (error) {
      return reject(ctx, error);
    }
  }
  function capture(command, payload, snapshot = state) {
    if (!command || typeof command.id !== "symbol")
      throw Error("InvalidCommand");
    const owned = copyOwned(payload);
    return { command, payload: owned, token: owned?.target ?? owned?.token ?? snapshot.token, handlers: registry.capture(command) };
  }
  async function execute(pending) {
    const ctx = context(pending.token);
    try {
      requireReady(pending.token);
      handling = true;
      let handled;
      try {
        handled = registry.run(pending.handlers, pending.payload, (v) => copyOwned(v));
      } finally {
        handling = false;
      }
      assertLive();
      if (handled)
        return result("handled-without-runtime", ctx);
      if (pending.command.id === SPLICE_TEXT_COMMAND.id) {
        const payload = pending.payload;
        if (payload.selectionVersion !== undefined && payload.selectionVersion !== state.stateVersion)
          throw Error("StaleClipboardSelection");
        if (typeof payload.text !== "string" || !isWellFormed(payload.text))
          throw Error("InvalidText");
        const position = selectionMessage(payload.target, state);
        return await mutate({ kind: "splice", ...position, text: payload.text }, payload.target);
      }
      if (pending.command.id === SET_CHARACTER_UNDERLINE_COMMAND.id) {
        const payload = pending.payload;
        return await mutate(underlineMessage(payload, state), payload.target, true);
      }
      if (pending.command.id === SET_CHARACTER_PROPERTIES_COMMAND.id || pending.command.id === SET_PARAGRAPH_ALIGNMENT_COMMAND.id) {
        const payload = pending.payload;
        const message = formattingMessage(payload, state, pending.command.id === SET_CHARACTER_PROPERTIES_COMMAND.id);
        return await mutate(message, payload.target, true);
      }
      if (pending.command.id === UNDO_COMMAND.id || pending.command.id === REDO_COMMAND.id) {
        const payload = pending.payload;
        validateToken(payload.token, state);
        return await mutate({ kind: pending.command.id === UNDO_COMMAND.id ? "undo" : "redo" }, payload.token);
      }
      return reject(ctx, "UnsupportedCommand");
    } catch (error) {
      return reject(ctx, error);
    }
  }
  function dispatchCommand(command, payload) {
    assertPublicMutation();
    const pending = capture(command, payload);
    return admit(() => execute(pending));
  }
  function update(callback) {
    if (readDepth)
      throw Error("ReadMutation");
    if (collecting)
      throw Error("NestedUpdate");
    if (handling)
      throw Error("CommandHandlerMutation");
    assertLive();
    if (typeof callback !== "function")
      throw TypeError("InvalidUpdateCallback");
    if (isAsyncFunction(callback))
      throw Error("AsyncUpdate");
    const snapshot = state, pending = [];
    let open = true;
    const collector = Object.freeze({ dispatchCommand(command, payload) {
      if (!open)
        throw Error("CollectorClosed");
      pending.push(capture(command, payload, snapshot));
    } });
    collecting = true;
    try {
      const returned = callback(collector, snapshot);
      if (isPromiseLike(returned)) {
        discardPromise(returned);
        throw Error("AsyncUpdate");
      }
      if (returned !== undefined)
        throw Error("InvalidUpdateReturn");
    } finally {
      collecting = false;
      open = false;
    }
    return admit(async () => {
      const results = [];
      let stoppedIndex = null;
      for (const [index, command] of pending.entries()) {
        const answer = await execute(command);
        results.push(answer);
        if (answer.status === "rejected-unapplied" || answer.status === "committed-refresh-required") {
          stoppedIndex = index;
          break;
        }
      }
      return Object.freeze({ results: Object.freeze(results), stoppedIndex, state });
    });
  }
  function refresh() {
    assertPublicMutation();
    const token = state.token;
    return enqueue(async () => {
      if (!active || state.status !== "refresh-required")
        throw Error("RefreshNotRequired");
      validateToken(token, state);
      const ctx = context(token);
      try {
        const reply = await active.request({ kind: "refresh" }, ctx);
        verifyReply(reply, ctx);
        if (reply.error)
          throw Error(reply.error);
        assertLive();
        install({ ...contentPatch(reply), status: "ready" }, true, ctx);
        return state;
      } catch (error) {
        notifyError(error, ctx, false);
        throw error;
      }
    });
  }
  function save(saveOptions = {}) {
    assertPublicMutation();
    const owned = copyOwned(saveOptions);
    return admit(async () => {
      const token = owned.token ?? state.token;
      if (!active || state.documentId === null)
        throw Error("EditorNotReady");
      validateToken(token, state);
      const stale = state.status === "refresh-required";
      if (stale && !owned.recovery)
        throw Error("RecoverySaveRequired");
      if (!stale && state.status !== "ready")
        throw Error("EditorNotReady");
      const ctx = context(token);
      const format = state.content?.format;
      if (format !== "hwp5" && format !== "hwpx")
        throw Error("UnknownDocumentFormat");
      try {
        const reply = await active.request({ kind: "save", allowStaleLayout: owned.allowStaleLayout ?? false, allowUnprotectedOutput: owned.allowUnprotectedOutput ?? false }, ctx);
        verifyReply(reply, ctx);
        if (reply.error)
          throw Error(reply.error);
        if (!(reply.bytes instanceof Uint8Array))
          throw Error("SaveBytesMissing");
        const bytes = reply.bytes.slice();
        assertLive();
        install({ savedOperationRevision: token.operationRevision });
        return Object.freeze({ bytes, documentId: token.documentId, generation: token.generation, operationRevision: token.operationRevision, nativeHistoryRevision: history(reply) ?? state.nativeHistoryRevision, format, staleSnapshot: stale, layoutRequiresReflow: typeof reply.layoutRequiresReflow === "boolean" ? reply.layoutRequiresReflow : undefined, reply: freezeDTO(copyOwned(reply, true)) });
      } catch (error) {
        notifyError(error, ctx, false);
        throw error;
      }
    });
  }
  function requestExperimental(message, experimental) {
    assertPublicMutation();
    const owned = copyOwned(message), settings = copyOwned(experimental);
    if (!owned || typeof owned.kind !== "string" || typeof settings.mutation !== "boolean")
      throw Error("InvalidExperimentalRequest");
    if (["load", "unlock", "enable", "save", "refresh", "undo", "redo", "splice"].includes(owned.kind))
      throw Error("UseTypedEditorOperation");
    const operation = surfaceOperation(owned.kind);
    if (operation && settings.mutation !== (operation === "mutation"))
      throw Error("OperationClassificationMismatch");
    if (!settings.mutation && operation !== "read")
      throw Error("UnsafeExperimentalQuery");
    return (settings.mutation ? admit : enqueue)(async () => {
      if (settings.mutation)
        return mutate(owned, settings.token);
      requireReady(settings.token);
      const ctx = context(settings.token);
      try {
        const reply = await active.request(owned, ctx);
        verifyReply(reply, ctx);
        if (reply.error)
          throw Error(reply.error);
        return freezeDTO(copyOwned(reply, true));
      } catch (error) {
        notifyError(error, ctx, false);
        throw error;
      }
    });
  }
  function setSelection(target, options = {}) {
    assertPublicMutation();
    const owned = copyOwned(target), settings = copyOwned(options);
    if (!settings || typeof settings !== "object" || Array.isArray(settings) || Object.keys(settings).some((key) => key !== "stateVersion") || settings.stateVersion !== undefined && (!Number.isSafeInteger(settings.stateVersion) || settings.stateVersion < 0))
      throw Error("InvalidSelectionOptions");
    const version = settings.stateVersion;
    return admit(async () => {
      requireReady(owned ?? state.token);
      if (version !== undefined && version !== state.stateVersion)
        throw Error("StaleSelectionObservation");
      if (owned)
        validateSelection(owned, state);
      install({ selection: owned });
      return state;
    });
  }
  function historyCommand(command, token) {
    assertPublicMutation();
    const explicit = token === undefined ? undefined : copyOwned(token), handlers = registry.capture(command);
    return admit(() => execute({ ...capture(command, { token: explicit ?? state.token }), handlers }));
  }
  async function readRequest(message, token, guard = () => {}) {
    guard();
    requireReady(token, true);
    const ctx = context(token);
    try {
      const reply = await active.request(message, ctx);
      verifyReply(reply, ctx);
      if (reply.error)
        throw Error(reply.error);
      assertLive();
      guard();
      return freezeDTO(copyOwned(reply, true));
    } catch (error) {
      notifyError(error, ctx, false);
      throw error;
    }
  }
  function readResource(message, requestOptions) {
    assertPublicMutation();
    const owned = copyOwned(message), expected = copyOwned(requestOptions === undefined ? state.token : ("token" in requestOptions) ? requestOptions.token : requestOptions);
    if (surfaceOperation(owned.kind) !== "read")
      return Promise.reject(Error("UnsupportedReadOperation"));
    return enqueue(() => readRequest(owned, expected));
  }
  function acquireInputSurface(hooks) {
    assertPublicMutation();
    assertLive();
    if (surface)
      throw Error("InputSurfaceAlreadyAttached");
    if (!hooks || typeof hooks.commitComposition !== "function" || typeof hooks.cancelComposition !== "function")
      throw Error("InvalidInputSurfaceHooks");
    const fence = new CancellationFence;
    const generation = ++surfaceEpoch;
    const record = { id: `${editorId}:surface:${generation}`, generation, active: true, hooks: { commitComposition: hooks.commitComposition.bind(hooks), cancelComposition: hooks.cancelComposition.bind(hooks) }, fence };
    surface = record;
    return Object.freeze({
      id: record.id,
      generation,
      isActive: () => !terminal && record.active && surface === record,
      request(message, requestOptions) {
        assertPublicMutation();
        let owned, expected, operation;
        try {
          assertSurface(record);
          owned = copyOwned(message);
          expected = copyOwned(requestOptions);
          if (expected.coordinates !== "legacy-native")
            throw Error("InvalidSurfaceCoordinates");
          operation = surfaceOperation(owned.kind);
          if (!operation)
            throw Error("UnsupportedSurfaceOperation");
        } catch (error) {
          return Promise.reject(error);
        }
        return enqueue(async () => {
          assertSurface(record);
          requireReady(expected.token, true);
          if (operation === "read")
            return readRequest(owned, expected.token, () => assertSurface(record));
          if (operation === "view") {
            const ctx = context(expected.token);
            const reply = await active.request(owned, ctx);
            verifyReply(reply, ctx);
            if (reply.error)
              throw Error(reply.error);
            install(contentPatch(reply), false, ctx);
            assertSurface(record);
            return freezeDTO(copyOwned(reply, true));
          }
          const answer = await mutate(owned, expected.token);
          assertSurface(record);
          return answer;
        });
      },
      publishSelection(target) {
        assertPublicMutation();
        let owned;
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
          if (owned)
            validateSelection(owned, state);
          install({ selection: owned });
          assertSurface(record);
          return state;
        });
      },
      release() {
        if (!record.active)
          return;
        assertPublicMutation();
        record.active = false;
        record.fence.cancel();
        if (surface === record) {
          surface = undefined;
          install({ selection: null });
        }
        cancelComposition(record, "detach");
      }
    });
  }
  function register(set, listener) {
    assertLive();
    if (typeof listener !== "function")
      throw TypeError("InvalidListener");
    set.add(listener);
    let attached = true;
    return () => {
      if (!attached)
        return;
      attached = false;
      set.delete(listener);
    };
  }
  function dispose() {
    assertPublicMutation();
    if (disposePromise)
      return disposePromise;
    terminal = true;
    selectionHistory.clear();
    disposedFence.cancel();
    for (const job of loads)
      job.fence.cancel();
    loads.clear();
    if (surface) {
      const detached = surface;
      surface = undefined;
      detached.active = false;
      detached.fence.cancel();
      cancelComposition(detached, "dispose");
    }
    state = new EditorState({ editorId, documentId: state.documentId, generation: state.generation, operationRevision: state.operationRevision, viewRevision: state.viewRevision, stateVersion: ++stateVersion, status: "disposed", content: state.content, capabilities: state.capabilities, nativeHistoryRevision: state.nativeHistoryRevision, nativeHistoryRevisions: state.nativeHistoryRevisions, savedOperationRevision: state.savedOperationRevision, selection: state.selection }, runRead);
    stateListeners.clear();
    updateListeners.clear();
    errorListeners.clear();
    registry.clear();
    const nativeDisposal = queue.enqueue(async () => {
      const current = active, candidate = locked?.runtime;
      active = undefined;
      locked = undefined;
      const failures = [];
      for (const runtime of [candidate, current])
        try {
          await release(runtime);
        } catch (error) {
          failures.push(error);
        }
      if (failures.length)
        throw new AggregateError(failures, "RuntimeDisposeFailed");
    });
    disposePromise = Promise.all([nativeDisposal, admission.drain()]).then(() => {});
    return disposePromise;
  }
  return Object.freeze({
    getEditorState: () => state,
    read: (callback) => runRead(callback, state),
    load,
    unlock,
    cancelLoad,
    dispatchCommand,
    update,
    save,
    refresh,
    requestExperimental,
    readResource,
    setSelection,
    acquireInputSurface,
    dispose,
    undo: (token) => historyCommand(UNDO_COMMAND, token),
    redo: (token) => historyCommand(REDO_COMMAND, token),
    registerStateListener: (listener) => register(stateListeners, listener),
    registerUpdateListener: (listener) => register(updateListeners, listener),
    registerErrorListener: (listener) => register(errorListeners, listener),
    registerCommand: (command, callback, priority = 0) => {
      assertLive();
      return registry.register(command, callback, priority);
    }
  });
}

function characterSelectionState(content, paragraph, start, end, property) {
  const underline = property === "underline";
  const strike = property === "strike";
  if (typeof paragraph?.text !== "string" || (strike ? content?.characterStrikeAvailable : underline ? content?.characterUnderlineAvailable : content?.characterPropertiesAvailable) !== true || !["bold", "italic", "underline", "strike"].includes(property) || paragraph?.clipped || !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start >= end || end > paragraph?.text?.length)
    return null;
  const shapes = new Map((content.characterShapes ?? []).map((shape) => [shape.id, shape]));
  const underlines = underline ? new Map((content.characterUnderlines ?? []).map((row) => [row.id, row.kind])) : null;
  const strikes = strike ? new Map((content.characterStrikes ?? []).map((row) => [row.id, row.enabled])) : null;
  let cursor = start, allEnabled = true, anyEnabled = false;
  for (const span of paragraph.characterRanges ?? []) {
    const low = Math.max(start, span.start), high = Math.min(end, span.end);
    if (low >= high)
      continue;
    const shape = shapes.get(span.charShapeId);
    const kind = underlines?.get(span.charShapeId);
    const enabled = strike ? strikes.get(span.charShapeId) : underline ? ["none", "bottom", "center", "top"].includes(kind) ? kind !== "none" : null : shape?.[property];
    if (low !== cursor || typeof enabled !== "boolean")
      return null;
    allEnabled &&= enabled;
    anyEnabled ||= enabled;
    cursor = high;
  }
  return cursor === end ? allEnabled ? true : anyEnabled ? "mixed" : false : null;
}

var segments = new Intl.Segmenter("ko", { granularity: "grapheme" });
var words = new Intl.Segmenter("ko", { granularity: "word" });
function graphemeUnits(text) {
  return [...segments.segment(text)].map((s) => s.index).concat(text.length);
}
function snapUnit(text, unit, forward = false) {
  const bounds = graphemeUnits(text);
  return forward ? bounds.find((b) => b >= unit) ?? text.length : bounds.filter((b) => b <= unit).at(-1) ?? 0;
}

var isSourceCharacterSize = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
function characterSizeState(content, paragraph, start, end) {
  if (content?.characterPropertiesAvailable !== true || typeof paragraph?.text !== "string" || paragraph.clipped || !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start >= end || end > paragraph.text.length || snapUnit(paragraph.text, start) !== start || snapUnit(paragraph.text, end, true) !== end)
    return null;
  const shapes = new Map((content.characterShapes ?? []).map((shape) => [shape.id, shape]));
  let cursor = start, size, mixed = false;
  for (const span of paragraph.characterRanges ?? []) {
    const low = Math.max(start, span.start), high = Math.min(end, span.end);
    if (low >= high)
      continue;
    const current = shapes.get(span.charShapeId)?.height;
    if (low !== cursor || !isSourceCharacterSize(current))
      return null;
    if (size === undefined)
      size = current;
    else if (size !== current)
      mixed = true;
    cursor = high;
  }
  return cursor === end && size !== undefined ? mixed ? "mixed" : size : null;
}

var message = (error) => error instanceof Error ? error.message : String(error);
function getSelectionFormatting(state) {
  const unavailable = (reason) => Object.freeze({ target: null, characterAvailableReason: reason, paragraphAvailableReason: reason, underlineAvailableReason: reason, bold: null, italic: null, underline: null, size: null, align: null });
  if (state.status !== "ready")
    return unavailable(state.status === "refresh-required" ? "RefreshRequired" : "EditorNotReady");
  const selection = state.selection;
  if (selection == null)
    return unavailable("MissingSelection");
  let target, row;
  try {
    const selected = selection;
    row = validateSelection(selected, state);
    target = Object.freeze({ editorId: selected.editorId, documentId: selected.documentId, generation: selected.generation, operationRevision: selected.operationRevision, viewRevision: selected.viewRevision, coordinateSpace: selected.coordinateSpace, format: selected.format, owner: selected.owner, section: selected.section, paragraph: selected.paragraph, startUnit: selected.startUnit, endUnit: selected.endUnit, affinity: selected.affinity });
  } catch (error) {
    return unavailable(message(error));
  }
  const reason = (character, capability) => {
    try {
      validateFormattingTarget(target, state, character, capability);
      return null;
    } catch (error) {
      return message(error);
    }
  };
  const characterAvailableReason = reason(true), paragraphAvailableReason = reason(false);
  const underlineAvailableReason = reason(true, "characterUnderlineAvailable");
  const content = state.content;
  const bold = characterAvailableReason === null ? characterSelectionState(content, row, target.startUnit, target.endUnit, "bold") : null;
  const italic = characterAvailableReason === null ? characterSelectionState(content, row, target.startUnit, target.endUnit, "italic") : null;
  const underline = underlineAvailableReason === null ? characterSelectionState(content, row, target.startUnit, target.endUnit, "underline") : null;
  const size = characterAvailableReason === null ? characterSizeState(content, row, target.startUnit, target.endUnit) : null;
  const align = paragraphAvailableReason === null ? paragraphAlignmentKey(row.paragraphShape?.alignment) : null;
  return Object.freeze({ target, characterAvailableReason, paragraphAvailableReason, underlineAvailableReason, bold, italic, underline, size, align });
}

var cfbSignature = Uint8Array.of(208, 207, 17, 224, 161, 177, 26, 225);
var hwp3Signature = new TextEncoder().encode("HWP Document File V3");
var startsWith = (bytes, signature) => bytes.length >= signature.length && signature.every((value, index) => bytes[index] === value);
function detectDocumentFormat(input) {
  const bytes = input instanceof Uint8Array ? input : input instanceof ArrayBuffer ? new Uint8Array(input) : null;
  if (!bytes)
    throw new TypeError("ExpectedDocumentBytes");
  if (startsWith(bytes, cfbSignature))
    return "hwp5";
  if (bytes.length >= 4 && bytes[0] === 80 && bytes[1] === 75 && (bytes[2] === 3 && bytes[3] === 4 || bytes[2] === 5 && bytes[3] === 6 || bytes[2] === 7 && bytes[3] === 8))
    return "hwpx";
  if (startsWith(bytes, hwp3Signature))
    throw new Error("UnsupportedHwp3Document");
  throw new Error("UnsupportedDocumentSignature");
}

function detectDocumentFormat2(input) {
  return detectDocumentFormat(input);
}

function textRows(state) {
  if (state.status !== "ready")
    return [];
  const content = state.content;
  if (!Array.isArray(content?.paragraphs))
    throw Error("InvalidDocumentTextSnapshot");
  const identities = new Set;
  return content.paragraphs.filter((row) => {
    if (!row || !Number.isSafeInteger(row.section) || row.section < 0 || !Number.isSafeInteger(row.paragraph) || row.paragraph < 0 || typeof row.text !== "string")
      throw Error("InvalidDocumentTextSnapshot");
    const key = `${row.section}:${row.paragraph}`;
    if (identities.has(key))
      throw Error("AmbiguousDocumentText");
    identities.add(key);
    return true;
  });
}
function searchOptions(options) {
  if (!options || typeof options !== "object" || Array.isArray(options) || ![Object.prototype, null].includes(Object.getPrototypeOf(options)))
    throw Error("InvalidFindTextOptions");
  for (const key of Reflect.ownKeys(options)) {
    if (typeof key !== "string" || !["direction", "wrap", "origin"].includes(key) || !("value" in Object.getOwnPropertyDescriptor(options, key)))
      throw Error("InvalidFindTextOptions");
  }
  if (options.direction !== undefined && !["forward", "backward"].includes(options.direction) || options.wrap !== undefined && typeof options.wrap !== "boolean" || options.origin !== undefined && !["selection", "document"].includes(options.origin))
    throw Error("InvalidFindTextOptions");
  return { direction: options.direction ?? "forward", wrap: options.wrap ?? true, origin: options.origin ?? "selection" };
}
function findTextMatch(state, query, options = {}) {
  const { direction, wrap, origin } = searchOptions(options);
  if (typeof query !== "string" || !query || !isWellFormedText(query))
    throw Error("InvalidSearchQuery");
  const content = state.content;
  if (state.status !== "ready" || !["hwp5", "hwpx"].includes(content?.format ?? ""))
    throw Error("EditorNotReady");
  const rows = textRows(state), selected = origin === "selection" ? state.selection : null;
  if (!rows.length)
    return null;
  const selectedIndex = selected ? rows.findIndex((row) => row.section === selected.section && row.paragraph === selected.paragraph) : -1;
  const backward = direction === "backward", anchored = selectedIndex >= 0;
  const first = anchored ? selectedIndex : backward ? rows.length - 1 : 0;
  const start = anchored ? backward ? selected.startUnit : selected.endUnit : backward ? rows[first].text.length : 0;
  const visits = rows.length + (wrap && anchored ? 1 : 0);
  for (let step = 0;step < visits; step++) {
    const absolute = first + (backward ? -step : step);
    if (!wrap && (absolute < 0 || absolute >= rows.length))
      break;
    const row = rows[(absolute % rows.length + rows.length) % rows.length];
    if (row.clipped)
      continue;
    const owner = paragraphSelectionOwner(row);
    if (!owner)
      continue;
    const from = backward ? (step === 0 ? start : row.text.length) - query.length : step === 0 ? start : 0;
    if (backward && from < 0)
      continue;
    const at = backward ? row.text.lastIndexOf(query, from) : row.text.indexOf(query, from);
    if (at < 0 || step === rows.length && (backward ? at + query.length <= start : at >= start))
      continue;
    return Object.freeze({
      ...state.token,
      coordinateSpace: "display",
      format: content.format,
      owner,
      section: row.section,
      paragraph: row.paragraph,
      startUnit: at,
      endUnit: at + query.length,
      affinity: "forward"
    });
  }
  return null;
}
function selectionMatchesText(state, query) {
  const selected = state.selection;
  if (!selected || !query)
    return false;
  const row = textRows(state).find((row) => row.section === selected.section && row.paragraph === selected.paragraph);
  return !!row && !row.clipped && row.text.slice(selected.startUnit, selected.endUnit) === query;
}
function getDocumentTextStatistics(state) {
  if (state.status !== "ready")
    throw Error("EditorNotReady");
  const rows = textRows(state), content = state.content;
  const texts = rows.map((row) => row.text.replace(/\ufffc/g, ""));
  const scalars = Array.from(texts.join(""));
  return Object.freeze({
    complete: !content?.window && !content?.limited && !rows.some((row) => row.clipped),
    paragraphs: rows.length,
    characters: scalars.length,
    charactersWithoutWhitespace: scalars.filter((char) => !/\s/u.test(char)).length,
    words: texts.reduce((count, text) => count + (text.trim() ? text.trim().split(/\s+/u).length : 0), 0)
  });
}

function getSelectionClipboard(state) {
  const unavailable = (reason) => Object.freeze({ target: null, text: null, copyReason: reason, editReason: reason, stateVersion: state.stateVersion });
  if (!state.documentId || state.status === "empty")
    return unavailable("NoDocument");
  if (state.status !== "ready")
    return unavailable(state.status === "refresh-required" ? "RefreshRequired" : "EditorNotReady");
  if (state.selection == null)
    return unavailable("MissingSelection");
  try {
    const selected = state.selection;
    const row = validateSelection(selected, state);
    const target = Object.freeze({ ...state.token, coordinateSpace: selected.coordinateSpace, format: selected.format, owner: selected.owner, section: selected.section, paragraph: selected.paragraph, startUnit: selected.startUnit, endUnit: selected.endUnit, affinity: selected.affinity });
    const text = row.text.slice(target.startUnit, target.endUnit);
    if (text.includes("￼"))
      return unavailable("ClipboardObjectSelectionUnsupported");
    let editReason = null;
    try {
      selectionMessage(target, state);
    } catch (error) {
      editReason = error instanceof Error ? error.message : String(error);
    }
    return Object.freeze({ target, text, copyReason: text.length ? null : "EmptyClipboardSelection", editReason, stateVersion: state.stateVersion });
  } catch (error) {
    return unavailable(error instanceof Error ? error.message : String(error));
  }
}

var platforms = ["mac", "windows", "linux"];
var modifiers = new Set(["Mod", "Control", "Meta", "Alt", "Shift"]);
var namedCodes = new Set(("Backquote Backslash Backspace BracketLeft BracketRight Comma Equal Minus Period Quote Semicolon Slash " + "AltLeft AltRight CapsLock ContextMenu ControlLeft ControlRight Enter MetaLeft MetaRight ShiftLeft ShiftRight Space Tab " + "Delete End Help Home Insert PageDown PageUp ArrowDown ArrowLeft ArrowRight ArrowUp Escape NumLock ScrollLock Pause PrintScreen " + "IntlBackslash IntlRo IntlYen Convert NonConvert KanaMode Lang1 Lang2 Lang3 Lang4 Lang5 " + "NumpadAdd NumpadBackspace NumpadClear NumpadClearEntry NumpadComma NumpadDecimal NumpadDivide NumpadEnter NumpadEqual NumpadHash NumpadMemoryAdd NumpadMemoryClear NumpadMemoryRecall NumpadMemoryStore NumpadMemorySubtract NumpadMultiply NumpadParenLeft NumpadParenRight NumpadStar NumpadSubtract " + "AudioVolumeDown AudioVolumeMute AudioVolumeUp MediaPlayPause MediaStop MediaTrackNext MediaTrackPrevious").split(" "));
function invalid(detail) {
  throw new TypeError(`InvalidKeymap: ${detail}`);
}
function record(value, where) {
  if (!value || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value)))
    invalid(where);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !("value" in Object.getOwnPropertyDescriptor(value, key)))
      invalid(`${where} property`);
  }
  return value;
}
function fields(value, allowed, where) {
  for (const key of Object.getOwnPropertyNames(value))
    if (!allowed.includes(key))
      invalid(`${where}.${key}`);
}
function text(value, where) {
  if (typeof value !== "string" || !value.trim() || /[\u0000-\u001f\u007f]/.test(value))
    invalid(where);
  return value;
}
function keymapModifierMask(binding, platform) {
  let mask = 0;
  for (const modifier of binding.modifiers) {
    const expanded = modifier === "Mod" ? platform === "mac" ? "Meta" : "Control" : modifier;
    mask |= expanded === "Control" ? 1 : expanded === "Meta" ? 2 : expanded === "Alt" ? 4 : 8;
  }
  return mask;
}
function validateKeymapConfig(input) {
  const config = record(input, "config");
  fields(config, ["version", "bindings", "messages"], "config");
  if (config.version !== 1 || !Array.isArray(config.bindings))
    invalid("version/bindings");
  const ids = new Set;
  const bindings = config.bindings.map((input, index) => {
    const row = record(input, `bindings[${index}]`);
    fields(row, ["id", "command", "code", "modifiers", "platform", "enabled", "labelKey"], "binding");
    const id = text(row.id, "id"), command = text(row.command, "command"), code = text(row.code, "code");
    if (ids.has(id))
      invalid(`duplicate id ${id}`);
    ids.add(id);
    if (!/^(?:Key[A-Z]|Digit[0-9]|Numpad[0-9]|F(?:[1-9]|1[0-9]|2[0-4]))$/.test(code) && !namedCodes.has(code))
      invalid(`code ${code}`);
    if (!Array.isArray(row.modifiers))
      invalid("modifiers");
    const seen = new Set;
    for (const modifier of row.modifiers) {
      if (typeof modifier !== "string" || !modifiers.has(modifier) || seen.has(modifier))
        invalid("modifier");
      seen.add(modifier);
    }
    if (seen.has("Mod") && (seen.has("Control") || seen.has("Meta")))
      invalid("Mod with explicit primary modifier");
    if ("platform" in row && !["all", ...platforms].includes(row.platform))
      invalid("platform");
    if ("enabled" in row && typeof row.enabled !== "boolean")
      invalid("enabled");
    if ("labelKey" in row)
      text(row.labelKey, "labelKey");
    return Object.freeze({
      id,
      command,
      code,
      modifiers: Object.freeze([...seen]),
      ..."platform" in row ? { platform: row.platform } : {},
      ..."enabled" in row ? { enabled: row.enabled } : {},
      ..."labelKey" in row ? { labelKey: row.labelKey } : {}
    });
  });
  for (const platform of platforms) {
    const keys = new Set;
    for (const binding of bindings) {
      if (binding.enabled === false || binding.platform && binding.platform !== "all" && binding.platform !== platform)
        continue;
      const key = `${binding.code}:${keymapModifierMask(binding, platform)}`;
      if (keys.has(key))
        invalid(`shortcut conflict on ${platform}: ${key}`);
      keys.add(key);
    }
  }
  let messages;
  if ("messages" in config) {
    const source = record(config.messages, "messages");
    messages = Object.create(null);
    for (const [locale, input] of Object.entries(source)) {
      if (!/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/.test(locale))
        invalid("locale");
      const translations = record(input, "translations");
      const owned = Object.create(null);
      for (const [key, value] of Object.entries(translations)) {
        text(key, "labelKey");
        if (typeof value !== "string")
          invalid("message");
        owned[key] = value;
      }
      messages[locale] = Object.freeze(owned);
    }
    Object.freeze(messages);
  }
  return Object.freeze({ version: 1, bindings: Object.freeze(bindings), ...messages ? { messages } : {} });
}
function mergeKeymap(defaults, overrides) {
  const base = validateKeymapConfig(defaults), custom = validateKeymapConfig(overrides);
  const rows = new Map(base.bindings.map((binding) => [binding.id, binding]));
  for (const binding of custom.bindings)
    rows.set(binding.id, binding);
  const messages = Object.create(null);
  for (const config of [base, custom])
    for (const [locale, values] of Object.entries(config.messages ?? {})) {
      messages[locale] = Object.assign(Object.create(null), messages[locale], values);
    }
  return validateKeymapConfig({ version: 1, bindings: [...rows.values()], messages });
}
function resolveShortcutLabel(config, binding, locale) {
  const key = binding.labelKey ?? binding.id;
  for (const language of [locale, locale.split("-")[0], "en"]) {
    const labels = config.messages?.[language];
    if (labels && Object.hasOwn(labels, key))
      return labels[key];
  }
  return binding.id;
}
var parseKeymapConfig = validateKeymapConfig;

var compiledIndexes = new WeakMap;
function compileKeymap(config, platform) {
  if (!["mac", "windows", "linux"].includes(platform))
    throw new TypeError("InvalidKeymapPlatform");
  const owned = validateKeymapConfig(config);
  const bindings = Object.freeze(owned.bindings.filter((binding) => binding.enabled !== false && (!binding.platform || binding.platform === "all" || binding.platform === platform)));
  const index = new Map(bindings.map((binding) => [`${binding.code}:${keymapModifierMask(binding, platform)}`, binding]));
  const compiled = Object.freeze({ platform, bindings });
  compiledIndexes.set(compiled, index);
  return compiled;
}
function resolveKeyboardShortcut(compiled, event) {
  const index = compiledIndexes.get(compiled);
  if (!index)
    throw new TypeError("InvalidCompiledKeymap");
  if (!event || event.isComposing || event.keyCode === 229 || event.altGraph || event.repeat)
    return null;
  if (typeof event.code !== "string" || [event.ctrlKey, event.metaKey, event.altKey, event.shiftKey].some((value) => typeof value !== "boolean"))
    return null;
  const mask = (event.ctrlKey ? 1 : 0) | (event.metaKey ? 2 : 0) | (event.altKey ? 4 : 0) | (event.shiftKey ? 8 : 0);
  return index.get(`${event.code}:${mask}`) ?? null;
}

var defaults_default = {
  version: 1,
  bindings: [
    {
      id: "save",
      command: "save",
      code: "KeyS",
      modifiers: [
        "Mod"
      ],
      platform: "all",
      labelKey: "command.save"
    },
    {
      id: "undo",
      command: "undo",
      code: "KeyZ",
      modifiers: [
        "Mod"
      ],
      platform: "all",
      labelKey: "command.undo"
    },
    {
      id: "cut",
      command: "cut",
      code: "KeyX",
      modifiers: [
        "Mod"
      ],
      platform: "all",
      labelKey: "command.cut"
    },
    {
      id: "copy",
      command: "copy",
      code: "KeyC",
      modifiers: [
        "Mod"
      ],
      platform: "all",
      labelKey: "command.copy"
    },
    {
      id: "paste",
      command: "paste",
      code: "KeyV",
      modifiers: [
        "Mod"
      ],
      platform: "all",
      labelKey: "command.paste"
    },
    {
      id: "find",
      command: "find",
      code: "KeyF",
      modifiers: [
        "Mod"
      ],
      platform: "all",
      labelKey: "command.find"
    },
    {
      id: "bold",
      command: "bold",
      code: "KeyB",
      modifiers: [
        "Mod"
      ],
      platform: "all",
      labelKey: "command.bold"
    },
    {
      id: "italic",
      command: "italic",
      code: "KeyI",
      modifiers: [
        "Mod"
      ],
      platform: "all",
      labelKey: "command.italic"
    },
    {
      id: "underline",
      command: "underline",
      code: "KeyU",
      modifiers: [
        "Mod"
      ],
      platform: "all",
      labelKey: "command.underline"
    },
    {
      id: "redo",
      command: "redo",
      code: "KeyZ",
      modifiers: [
        "Mod",
        "Shift"
      ],
      platform: "all",
      labelKey: "command.redo"
    },
    {
      id: "replace-mac",
      command: "replace",
      code: "KeyH",
      modifiers: [
        "Mod",
        "Shift"
      ],
      platform: "mac",
      labelKey: "command.replace"
    },
    {
      id: "replace-windows",
      command: "replace",
      code: "KeyH",
      modifiers: [
        "Control"
      ],
      platform: "windows",
      labelKey: "command.replace"
    },
    {
      id: "replace-linux",
      command: "replace",
      code: "KeyH",
      modifiers: [
        "Control"
      ],
      platform: "linux",
      labelKey: "command.replace"
    },
    {
      id: "bold-hancom-windows",
      command: "bold",
      code: "KeyB",
      modifiers: [
        "Alt",
        "Shift"
      ],
      platform: "windows",
      labelKey: "command.bold"
    },
    {
      id: "bold-hancom-linux",
      command: "bold",
      code: "KeyB",
      modifiers: [
        "Alt",
        "Shift"
      ],
      platform: "linux",
      labelKey: "command.bold"
    },
    {
      id: "italic-hancom-windows",
      command: "italic",
      code: "KeyI",
      modifiers: [
        "Alt",
        "Shift"
      ],
      platform: "windows",
      labelKey: "command.italic"
    },
    {
      id: "italic-hancom-linux",
      command: "italic",
      code: "KeyI",
      modifiers: [
        "Alt",
        "Shift"
      ],
      platform: "linux",
      labelKey: "command.italic"
    },
    {
      id: "underline-hancom-windows",
      command: "underline",
      code: "KeyU",
      modifiers: [
        "Alt",
        "Shift"
      ],
      platform: "windows",
      labelKey: "command.underline"
    },
    {
      id: "underline-hancom-linux",
      command: "underline",
      code: "KeyU",
      modifiers: [
        "Alt",
        "Shift"
      ],
      platform: "linux",
      labelKey: "command.underline"
    },
    {
      id: "redo-compat-y",
      command: "redo",
      code: "KeyY",
      modifiers: [
        "Mod"
      ],
      labelKey: "command.redo"
    }
  ],
  messages: {
    ko: {
      "command.save": "저장",
      "command.undo": "실행 취소",
      "command.redo": "다시 실행",
      "command.cut": "잘라내기",
      "command.copy": "복사",
      "command.paste": "붙여넣기",
      "command.find": "찾기",
      "command.replace": "찾아 바꾸기",
      "command.bold": "굵게",
      "command.italic": "기울임",
      "command.underline": "밑줄"
    },
    en: {
      "command.save": "Save",
      "command.undo": "Undo",
      "command.redo": "Redo",
      "command.cut": "Cut",
      "command.copy": "Copy",
      "command.paste": "Paste",
      "command.find": "Find",
      "command.replace": "Replace",
      "command.bold": "Bold",
      "command.italic": "Italic",
      "command.underline": "Underline"
    }
  }
};

var DEFAULT_KEYMAP = parseKeymapConfig(defaults_default);
export {
  DEFAULT_KEYMAP,
  EditorState,
  PasswordAttemptError,
  REDO_COMMAND,
  SET_CHARACTER_PROPERTIES_COMMAND,
  SET_CHARACTER_UNDERLINE_COMMAND,
  SET_PARAGRAPH_ALIGNMENT_COMMAND,
  SPLICE_TEXT_COMMAND,
  UNDO_COMMAND,
  compileKeymap,
  createCommand,
  createEditor,
  detectDocumentFormat2 as detectDocumentFormat,
  findTextMatch,
  getDocumentTextStatistics,
  getHistoryAvailability,
  getSelectionClipboard,
  getSelectionFormatting,
  mergeKeymap,
  parseKeymapConfig,
  resolveKeyboardShortcut,
  resolveShortcutLabel,
  selectionMatchesText
};

