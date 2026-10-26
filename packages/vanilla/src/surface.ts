// Existing renderer/input remain the single implementation; the package build bundles these sources.
// @ts-ignore existing canonical JavaScript source
import { createRenderer } from '../../../web/preview/renderer.mjs';
// @ts-ignore existing canonical JavaScript source
import { createCanvasEditor } from '../../../web/preview/canvas-editor.mjs';
import type { HeadlessEditor } from '@hwpjs/core';
import type { InputSurfaceHooks, InputSurfaceLease } from '@hwpjs/core';
import type { SelectionTarget } from '@hwpjs/core';
import type { RuntimeMessage, RuntimeReply } from '@hwpjs/core';
import { getHistoryAvailability } from '@hwpjs/core';
import { createControlBridge } from './core-bridge.ts';
import { canvasSurfacePageFrame } from './page-frame.ts';
// @ts-ignore Canonical owner projection shared with headless selection validation.
import { paragraphSelectionOwner } from '../../../web/preview/paragraph-selection.mjs';

type HostEditor = HeadlessEditor & {
  acquireInputSurface(hooks: InputSurfaceHooks): InputSurfaceLease;
  readResource(message: RuntimeMessage, token?: ReturnType<HeadlessEditor['getEditorState']>['token']): Promise<RuntimeReply>;
};
export interface CanvasSurfaceOptions {
  root: HTMLElement;
  editor: HostEditor;
  environment?: Record<string, any>;
  onStatus?: (message: string) => void;
}
export function createCanvasSurface({ root, editor, environment = {}, onStatus = () => {} }: CanvasSurfaceOptions) {
  if (!root?.ownerDocument) throw Error('InvalidSurfaceRoot');
  if (typeof editor.acquireInputSurface !== 'function' || typeof editor.readResource !== 'function') throw Error('SurfaceCorePortUnavailable');
  const doc = root.ownerDocument, realm = doc.defaultView;
  if (!realm) throw Error('SurfaceRealmUnavailable');
  const container = doc.createElement('div'), viewport = doc.createElement('div');
  const stage = doc.createElement('div');
  stage.style.cssText = 'position:relative;width:max-content;min-width:100%';
  const canvas = doc.createElement('canvas'), spacer = doc.createElement('div'), input = doc.createElement('textarea');
  container.dataset.hwpjsSurface = '';
  viewport.style.cssText = 'position:relative;overflow:auto;width:100%;height:100%;min-height:0';
  container.style.cssText = 'height:100%;position:relative';
  canvas.style.cssText = 'position:sticky;top:0;left:0;display:block;touch-action:none';
  spacer.style.cssText = 'pointer-events:none';
  input.style.cssText = 'position:absolute;opacity:0.01;width:2px;resize:none;overflow:hidden;padding:0;border:0';
  input.setAttribute('aria-label', 'Document text input');
  input.dataset.hwpjsDocumentInput = '';
  input.spellcheck = false; input.maxLength = 4194304; input.tabIndex = -1; canvas.tabIndex = 0;
  input.style.pointerEvents = 'none';
  stage.append(canvas, spacer, input); viewport.append(stage); container.append(viewport); root.append(container);
  let closed = false, renderer: any, direct: any, lease: InputSurfaceLease | undefined;
  let frameObserver: ResizeObserver | undefined;
  let unsubscribe: (() => void) | undefined, bridge: ReturnType<typeof createControlBridge> | undefined;
  let displayed = '', selectionKey = '', observedStateVersion=-1;
  let explicitClearPending: ReturnType<HeadlessEditor['getEditorState']> | undefined;
  const status = (message: string) => { if (!closed) onStatus(message); };
  const note = { set textContent(value: string) { status(value); } };
  const alignFrame = (layout = renderer?.layout()) => {
    if (closed) return;
    const gutter = viewport.offsetWidth - viewport.clientWidth;
    const frame = canvasSurfacePageFrame(layout, root.clientWidth, renderer?.viewScale() ?? 1,
      Number.isFinite(gutter) ? Math.max(0, gutter) : 0);
    // Scrollbars belong to the full host. Move only the document stage;
    // canvas and its absolute IME target continue to share one physical origin.
    const width = frame ? `${Math.max(frame.contentWidth, viewport.clientWidth - frame.marginLeft)}px` : 'max-content';
    const margin = frame ? `${frame.marginLeft}px` : '0px';
    if (stage.style.width !== width) stage.style.width = width;
    if (stage.style.marginLeft !== margin) stage.style.marginLeft = margin;
    stage.style.minWidth = frame ? '0px' : '100%';
    stage.style.overflow = frame ? 'clip' : 'visible';
  };
  const render = (state: ReturnType<HeadlessEditor['getEditorState']>) => {
    if (closed || !renderer) return;
    // Only new observations may change the projection. Native acknowledgment
    // can repeat a snapshot the listener rendered, or arrive after a newer one.
    if(state.stateVersion<=observedStateVersion)return;
    observedStateVersion=state.stateVersion;
    const key = `${state.documentId}:${state.generation}:${state.operationRevision}:${state.viewRevision}`;
    if (state.status === 'refresh-required') { input.readOnly = true; return; }
    if (state.status !== 'ready') return;
    if (key === displayed) {
      // Public selection commands do not change document/view revisions.
      // Observe them without rebuilding the page layout or republishing the
      // selection which originated in this input surface.
      const selected = state.selection as SelectionTarget | null;
      const nextSelectionKey = JSON.stringify(selected ?? null);
      if (!bridge?.busy() && nextSelectionKey !== selectionKey) {
        selectionKey = nextSelectionKey;
        if (selected) {
          if (!direct?.selectTextRange(selected, { focusInput: false, selectionOrigin: "core" })) status('선택한 텍스트의 화면 위치를 표시할 수 없습니다.');
        } else direct?.external({ kind: 'external-update', origin: 'core' });
      }
      return;
    }
    const changedDocument = displayed.split(':').slice(0,-2).join(':') !== key.split(':').slice(0,-2).join(':');
    if (changedDocument) { direct?.reset({ selectionOrigin: "core" }); renderer.clear(); selectionKey = ''; }
    const retained = !changedDocument && state.selection ? state.selection as SelectionTarget : undefined;
    if (!retained && !changedDocument && displayed && !bridge?.busy()) direct?.external({ kind: "external-update", origin: "core" });
    displayed = key;
    renderer.show(state.content, { preserveScroll: !changedDocument, resourceEpoch: `${state.documentId}:${state.generation}:${state.operationRevision}`, resourceDocument: `${state.documentId}:${state.generation}` });
    if (retained && !bridge?.busy()) {
      direct?.initializeCapabilities({ ...(state.capabilities as object), historyRevision: state.nativeHistoryRevision });
      if (!direct?.selectTextRange(retained, { focusInput: false, selectionOrigin: "core" })) direct?.external({ kind: "external-update", origin: "core" });
    }
    if (changedDocument) direct?.initializeCapabilities({ ...(state.capabilities as object), historyRevision: state.nativeHistoryRevision });
  };
  const cleanup = () => {
    closed = true; explicitClearPending = undefined; frameObserver?.disconnect(); bridge?.close(); unsubscribe?.();
    try { direct?.close(); } finally { try { lease?.release(); } finally { renderer?.close(); container.remove(); } }
  };
  try {
    renderer = createRenderer(canvas, viewport, spacer, alignFrame, environment);
    if (environment.decodeImage) renderer.pictureDecoder(environment.decodeImage);
    lease = editor.acquireInputSurface({
      commitComposition: async () => { const result = direct?.flushComposition() ?? 'unchanged'; if (result === 'blocked') return result; await bridge?.flush(); return direct?.settled() ? 'unchanged' : 'blocked'; },
      cancelComposition: () => direct?.cancelComposition(),
    });
    bridge = createControlBridge({ state: () => editor.getEditorState(), lease,
      acknowledge(reply, state) { if (state) render(state); direct.message(reply); }, error: error => status(String(error)),
    });
    direct = createCanvasEditor({ canvas, viewport, input, renderer, controls: bridge, note,
      environment: { ...environment, ownerDocument: doc },
      platform: realm.navigator.platform,
      historyAvailability: () => getHistoryAvailability(editor.getEditorState()),
      queryEditRange: (m: RuntimeMessage) => bridge!.request(m), querySplitRange: (m: RuntimeMessage) => bridge!.request(m),
      onCommittedSelection(value: any, observation?: { origin?: string }) {
        if (closed || !lease?.isActive()) return;
        const state = editor.getEditorState();
        if (state.status !== 'ready') return;
        const singleOwnerRange = value && value.anchor.section === value.focus.section && value.anchor.paragraph === value.focus.paragraph;
        const point = singleOwnerRange ? value.anchor : null, row = point && renderer.paragraph(point);
        const owner = paragraphSelectionOwner(row);
        const target: SelectionTarget | null = point && owner ? { ...state.token, coordinateSpace: 'display', format: (state.content as any).format,
          owner, section: point.section, paragraph: point.paragraph,
          startUnit: Math.min(value.anchor.unit, value.focus.unit), endUnit: Math.max(value.anchor.unit, value.focus.unit),
          affinity: value.anchor.unit > value.focus.unit ? 'backward' : 'forward' } : null;
        const key = JSON.stringify(target);
        const projectedClear = observation?.origin === "core" && target === null && state.selection == null;
        const explicitClear = observation?.origin === "canvas" && target === null && state.selection === undefined;
        if (key === selectionKey && (!explicitClear || explicitClearPending === state)) return;
        selectionKey = key;
        if (projectedClear) return;
        const clearingState = explicitClear ? state : undefined;
        if (clearingState) explicitClearPending = clearingState;
        void lease.publishSelection(target).catch(error => { if (!closed) status(String(error)); }).finally(() => {
          if (clearingState && explicitClearPending === clearingState) explicitClearPending = undefined;
        });
      },
    });
    const resource = async (kind: string, payload: Record<string, number>, field: string) => {
      const token = editor.getEditorState().token;
      const answer = await editor.readResource({ kind, ...payload }, token);
      const now = editor.getEditorState().token;
      if (closed || !lease!.isActive() || token.documentId !== now.documentId || token.generation !== now.generation || token.operationRevision !== now.operationRevision) throw Error('StaleSurfaceResource');
      if (answer.error) throw Error(answer.error);
      return answer[field];
    };
    renderer.pictureReader((section: number, pictureNode: number) => resource('picture-bytes', { section, pictureNode }, 'bytes'));
    renderer.tableBackgroundReader((section: number, listNode: number) => resource('table-background-bytes', { section, listNode }, 'bytes'));
    renderer.chartReader((section: number, wrapper: number) => resource('chart-display', { section, wrapper }, 'chart'));
    render(editor.getEditorState());
    direct.initializeCapabilities({ ...(editor.getEditorState().capabilities as object), historyRevision: editor.getEditorState().nativeHistoryRevision });
    unsubscribe = editor.registerStateListener(render);
    const Observe = environment.ResizeObserver ?? realm.ResizeObserver;
    frameObserver = new Observe(() => alignFrame()); frameObserver!.observe(root);
    alignFrame();
  } catch (error) { cleanup(); throw error; }
  let disposal: Promise<void> | undefined;
  return {
    canRequestHistory(kind: 'undo' | 'redo'):boolean { return !closed && direct.canRequestHistory(kind); },
    requestHistory(kind: 'undo' | 'redo'):boolean { return !closed && direct.requestHistory(kind); },
    focus():boolean { return !closed&&direct.focusInput(); },
    canPasteInput():boolean { return !closed&&direct.canPasteInput(); },
    focusForPaste():boolean {
      if(closed||!direct.canPasteInput())return false;
      return direct.focusInput()&&!closed&&direct.canPasteInput();
    },
    setScale(value: number): boolean { return !closed && renderer.setViewScale(value); },
    getSelection() { return editor.getEditorState().selection ?? null; },
    async flushComposition() { if (closed) return 'blocked' as const; const answer = direct.flushComposition(); if (answer !== 'blocked') await bridge!.flush(); return answer; },
    dispose(): Promise<void> { if (!disposal) { cleanup(); disposal = bridge!.flush(); } return disposal; },
  };
}
