import { planCellAppearanceSelection } from '@hwpjs/core';
// @ts-ignore Pure format admission shared with Core and the Worker.
import { sourceTableCellWidthPlanForFormat } from '../../../web/preview/source-table-cell-width-format.mjs';
import { openPrintPreview } from '../../../web/preview/print-preview-dialog.mjs';
import { capturePrintPages } from '../../../web/preview/host-print.mjs';
import {
  atomicRangePatch,
  atomicRangeUnavailable,
  prepareAtomicRangeRequest,
} from '../../../web/preview/range-atomic-formatting.mjs';
import {
  captureFormattingRangeBinding,
  formattingRangeBindingMatches,
  formattingRangeSelectors,
} from '../../../web/preview/range-formatting-binding.mjs';
// @ts-ignore 실제 현재 geometry의 기존 판정을 재사용한다.
import { caretGeometry } from '../../../web/preview/text-geometry.mjs';
// @ts-ignore 같은 Native 모델에서 발생한 metadata 관측만 기존 규칙으로 허용한다.
import { sameHistoryModelObservation } from '../../../web/preview/history-model-readiness.mjs';
// @ts-ignore 글꼴 언어 순서는 기존 단일 출처를 재사용한다.
import { FONT_LANGUAGES } from '../../../js/font-face-identity.mjs';
// @ts-ignore 정규화된 현재 범위의 읽기 전용 관측을 공유한다.
import { rangeFormattingObservation } from '../../../web/preview/range-formatting-observation.mjs';
// @ts-ignore 기존 현재 범위와 UTF16·소유자 검증을 재사용한다.
import { paragraphSelectionRanges } from '../../../web/preview/paragraph-selection.mjs';
import {
  HOST_EPOCH_KEYS,
  createHostEpochReaders,
} from '../../../web/preview/host-epoch-readers.mjs';
import {
  readGeometryProjection,
  readNativeGeometryEvidence,
} from '@hwpjs/core/_internal/native-geometry';
// Existing renderer/input remain the single implementation; the package build bundles these sources.
// @ts-ignore existing canonical JavaScript source
import { createSurfaceRenderer } from '../../../web/preview/renderer.mjs';
// @ts-ignore existing canonical JavaScript source
import { createCanvasEditor } from '../../../web/preview/canvas-editor.mjs';
import type { HeadlessEditor } from '@hwpjs/core';
import type { InputSurfaceHooks, InputSurfaceLease } from '@hwpjs/core';
import type { SelectionTarget } from '@hwpjs/core';
import type { RuntimeMessage, RuntimeReply } from '@hwpjs/core';
import {
  getHistoryAvailability,
  createParagraphSelection,
  getSelectionFormatting,
} from '@hwpjs/core';
// Existing form controls use the same leased Native request bridge.
// @ts-ignore canonical JavaScript controls
import { createCheckBoxCanvasControls } from '../../../web/preview/checkbox-canvas-controls.mjs';
// @ts-ignore canonical JavaScript controls
import { createFormTextCanvasControls } from '../../../web/preview/form-text-canvas-controls.mjs';
import { createControlBridge } from './core-bridge.ts';
import { canvasSurfacePageFrame } from './page-frame.ts';
// @ts-ignore Canonical owner projection shared with headless selection validation.
import { paragraphSelectionOwner } from '../../../web/preview/paragraph-selection.mjs';

export type SurfaceFormattingIntent =
  | {
      readonly kind: 'character-properties';
      readonly properties: {
        readonly size?: number;
        readonly bold?: boolean;
        readonly italic?: boolean;
      };
    }
  | { readonly kind: 'underline'; readonly underlineKind: 'none' | 'bottom' | 'center' | 'top' }
  | { readonly kind: 'strike'; readonly enabled: boolean }
  | { readonly kind: 'text-color'; readonly color: string }
  | {
      readonly kind: 'font-name';
      readonly language: import('@hwpjs/core').CharacterFontLanguage;
      readonly name: string;
    }
  | {
      readonly kind: 'font-id';
      readonly language: import('@hwpjs/core').CharacterFontLanguage;
      readonly fontId: number;
    }
  | { readonly kind: 'shade'; readonly color: string | null }
  | { readonly kind: 'outline'; readonly outlineKind: string }
  | {
      readonly kind: 'effect';
      readonly effect: string;
      readonly enabled: boolean;
      readonly exclusive?: boolean;
    }
  | {
      readonly kind: 'font-names';
      readonly names: Readonly<Record<import('@hwpjs/core').CharacterFontLanguage, string>>;
    }
  | { readonly kind: 'alignment'; readonly alignment: string };
type HostEditor = HeadlessEditor & {
  acquireInputSurface(hooks: InputSurfaceHooks): InputSurfaceLease;
  readResource(
    message: RuntimeMessage,
    token?: ReturnType<HeadlessEditor['getEditorState']>['token'],
  ): Promise<RuntimeReply>;
};
export interface CanvasDisplayOptions {
  readonly paragraphMarks: boolean;
  /** 공백·검증된 탭·강제 줄바꿈의 화면 전용 표시입니다. */
  readonly formattingMarks?: boolean;
  /** 화면 전용 표 셀 경계 안내선. 저장·인쇄 서식에는 포함하지 않습니다. */
  readonly showTableGrid?: boolean;
  /** 원본에서 선 없음으로 확인된 표 셀 경계를 화면에서 표시합니다. */
  readonly showTransparentTableLines?: boolean;
}
export interface CanvasSurfaceEnvironment extends Record<string, any> {
  /** 측정 함수 내부 의미가 바뀌기 전에 새 frozen 빈 객체를 반환해야 합니다. */
  geometryMeasurementEpoch?: () => Readonly<Record<string, never>>;
  /** Optional host promise: rotate this frozen empty opaque token before resource bytes,
   * reader/decoder policy, or hidden same-function provider state changes.
   * Missing/invalid tokens retain ordinary refresh. This never grants Native authority.
   */
  resourceProviderEpoch?: () => Readonly<Record<string, never>>;
}
export type CanvasParagraphHeadingResult =
  | Readonly<{ state: 'available'; kind: 'none'; text: '' }>
  | Readonly<{
      state: 'available';
      kind: 'bullet';
      text: string;
      provenance: 'hwp5-docinfo' | 'hwpx-header';
    }>
  | Readonly<{
      state: 'available';
      kind: 'number' | 'outline';
      text: string;
      provenance: 'hwp5-numbering' | 'hwpx-numbering';
    }>
  | Readonly<{
      state: 'unavailable';
      reason:
        | 'surface-detached'
        | 'editor-not-ready'
        | 'input-pending'
        | 'scene-not-current'
        | 'no-caret'
        | 'caret-not-observed'
        | 'heading-not-observed'
        | 'numbering-not-computed'
        | 'unsupported-bullet';
    }>;
export type CanvasPageTextKind = 'body' | 'table' | 'textbox' | 'caption';
export type CanvasPageTextFilter = Readonly<{ include: readonly CanvasPageTextKind[] }>;
export type CanvasPageTextIssue = Readonly<{
  code:
    | 'incomplete-source-coverage'
    | 'unknown-text-ownership'
    | 'unplaced-text'
    | 'invalid-text-range'
    | 'unknown-text-geometry'
    | 'clipped-text'
    | 'ambiguous-reading-order';
  kind?: CanvasPageTextKind;
}>;
export type CanvasPageTextResult =
  | Readonly<{
      state: 'available';
      pageIndex: number;
      pageCount: number;
      section: number;
      text: string;
      coverage: 'complete' | 'partial';
      issues: readonly CanvasPageTextIssue[];
    }>
  | Readonly<{
      state: 'unavailable';
      reason:
        | 'surface-detached'
        | 'editor-not-ready'
        | 'input-pending'
        | 'scene-not-current'
        | 'invalid-page-index'
        | 'invalid-filter'
        | 'unknown-scene'
        | 'incomplete-scene'
        | 'unknown-physical-page-identity'
        | 'unknown-text-ownership'
        | 'page-out-of-range'
        | 'scene-budget-exceeded';
    }>;

export interface CanvasSurfaceOptions {
  root: HTMLElement;
  editor: HostEditor;
  environment?: CanvasSurfaceEnvironment;
  onStatus?: (message: string) => void;
}
export type CanvasPrintAvailability = Readonly<
  | { available: true }
  | { available: false; reason: 'detached' | 'unsupported' | 'not-ready' | 'busy' }
>;
export interface CanvasPrintPreview {
  readonly close: () => void;
  readonly ready: Promise<boolean>;
}
export interface CanvasPrintPreviewOptions {
  filename?: string;
}
export interface CanvasPrintRasterOptions {
  signal?: AbortSignal;
  scale?: number;
}
export interface CanvasPrintRasterPage {
  readonly ordinal: number;
  readonly section: number;
  readonly widthCssPx: number;
  readonly heightCssPx: number;
  readonly pixelWidth: number;
  readonly pixelHeight: number;
  readonly png: Blob;
}
export interface CanvasPrintRasterJob {
  readonly kind: 'paginated-canvas-print-pages';
  readonly token: import('@hwpjs/core').StateToken;
  readonly scale: number;
  readonly encoding: 'png';
  readonly pages: readonly CanvasPrintRasterPage[];
  readonly statistics: Readonly<{
    totalPixels: number;
    maxPagePixels: number;
    sceneVisits: number;
  }>;
}

export function createCanvasSurface({
  root,
  editor,
  environment = {},
  onStatus = () => {},
}: CanvasSurfaceOptions) {
  if (!root?.ownerDocument) throw Error('InvalidSurfaceRoot');
  if (typeof editor.acquireInputSurface !== 'function' || typeof editor.readResource !== 'function')
    throw Error('SurfaceCorePortUnavailable');
  const doc = root.ownerDocument,
    realm = doc.defaultView;
  if (!realm) throw Error('SurfaceRealmUnavailable');
  const container = doc.createElement('div'),
    viewport = doc.createElement('div');
  const stage = doc.createElement('div');
  stage.style.cssText = 'position:relative;width:max-content;min-width:100%';
  const canvas = doc.createElement('canvas'),
    spacer = doc.createElement('div'),
    input = doc.createElement('textarea');
  container.dataset.hwpjsSurface = '';
  viewport.style.cssText = 'position:relative;overflow:auto;width:100%;height:100%;min-height:0';
  container.style.cssText = 'height:100%;position:relative';
  canvas.style.cssText = 'position:sticky;top:0;left:0;display:block;touch-action:none';
  spacer.style.cssText = 'pointer-events:none';
  input.style.cssText =
    'position:absolute;opacity:0.01;width:2px;resize:none;overflow:hidden;padding:0;border:0';
  input.setAttribute('aria-label', 'Document text input');
  input.dataset.hwpjsDocumentInput = '';
  input.spellcheck = false;
  input.maxLength = 4194304;
  input.tabIndex = -1;
  canvas.tabIndex = 0;
  input.style.pointerEvents = 'none';
  stage.append(canvas, spacer, input);
  viewport.append(stage);
  container.append(viewport);
  root.append(container);
  const outputLifetime = new AbortController();
  let closed = false,
    renderer: any,
    direct: any,
    lease: InputSurfaceLease | undefined,
    geometryLease: InputSurfaceLease | undefined;
  let frameObserver: ResizeObserver | undefined;
  let unsubscribe: (() => void) | undefined,
    bridge: ReturnType<typeof createControlBridge> | undefined;
  let displayed = '',
    selectionKey = '',
    observedStateVersion = -1;
  let checkBoxControls: any, formTextControls: any;
  let nonTextHistoryAdmissionReady = false;
  let nonTextHistoryPending: object | undefined;
  let nonTextSelectionProjection: ReturnType<HeadlessEditor['getEditorState']> | undefined;
  let nonTextHistoryTask: Promise<void> = Promise.resolve();
  let activeHistoryAcknowledgement: ReturnType<HeadlessEditor['getEditorState']> | undefined;
  let deferredTypingAcknowledgement: ReturnType<HeadlessEditor['getEditorState']> | undefined;
  let historySelectionPublication:
    | { state: ReturnType<HeadlessEditor['getEditorState']>; target: SelectionTarget }
    | undefined;
  let formattingReceipt:
    | { kind: string; result: import('@hwpjs/core').CommandResult | null }
    | undefined;
  const formattingTasks = new Set<Promise<unknown>>();
  const isOutputInputSettled = () =>
    !closed &&
    direct?.settled() === true &&
    bridge?.busy() === false &&
    !nonTextHistoryPending &&
    formattingTasks.size === 0;
  const trackFormattingTask = <T>(task: Promise<T>): Promise<T> => {
    formattingTasks.add(task);
    void task.then(
      () => formattingTasks.delete(task),
      () => formattingTasks.delete(task),
    );
    return task;
  };
  let formattingPreparation: object | undefined;
  let atomicProfile:
    | {
        documentId: string | null;
        generation: number;
        format: unknown;
        pending: boolean;
        alignment: string | null;
        fonts: string | null;
      }
    | undefined;
  let atomicProfileTask: Promise<unknown> = Promise.resolve();
  let explicitClearPending: ReturnType<HeadlessEditor['getEditorState']> | undefined;
  const status = (message: string) => {
    if (!closed) onStatus(message);
  };
  const note = {
    set textContent(value: string) {
      status(value);
    },
  };
  const pageStatusListeners = new Set<() => void>();
  let pageStatusPending = false,
    lastPageStatus = '';
  let visiblePageCache:
    | {
        frame: unknown;
        top: number;
        height: number;
        current: number | null;
      }
    | undefined;
  function getPageStatus(): Readonly<{
    current: number | null;
    total: number | null;
    partial: boolean;
  }> | null {
    if (closed) return null;
    const state = editor.getEditorState();
    const key = `${state.documentId}:${state.generation}:${state.operationRevision}:${state.viewRevision}`;
    if (
      !lease?.isActive() ||
      state.status !== 'ready' ||
      key !== displayed ||
      !renderer?.isPaintedFrameCurrent?.()
    )
      return null;
    const frame = renderer.paintedFrame();
    if (
      frame?.resourceDocument !== `${state.documentId}:${state.generation}` ||
      frame?.resourceEpoch !== `${state.documentId}:${state.generation}:${state.operationRevision}`
    )
      return null;
    const layout = frame.layout;
    if (layout?.state !== 'paginated' || !Array.isArray(layout.pages) || !layout.pages.length)
      return null;
    const scale = renderer.viewScale();
    const top = viewport.scrollTop / scale,
      height = viewport.clientHeight / scale;
    if (![top, height, scale].every(Number.isFinite) || top < 0 || height <= 0 || scale <= 0)
      return null;
    // First paper intersecting the viewport. A viewport wholly in a gap has no current page.
    const cache = visiblePageCache;
    let current: number | null = cache?.current ?? null;
    if (!cache || cache.frame !== frame || cache.top !== top || cache.height !== height) {
      current = null;
      for (const [index, page] of layout.pages.entries()) {
        const paper = page?.paper;
        if (
          !paper ||
          !Number.isFinite(paper.y) ||
          !Number.isFinite(paper.height) ||
          paper.height <= 0
        )
          return null;
        if (current === null && paper.y < top + height && paper.y + paper.height > top)
          current = index + 1;
      }
      visiblePageCache = { frame, top, height, current };
    }
    const partial =
      layout.limited === true ||
      frame.content?.limited === true ||
      Boolean(frame.content?.window) ||
      layout.layoutScope === 'paragraph-window-fragment' ||
      layout.documentPageNumbersExact === false;
    return Object.freeze({ current, total: partial ? null : layout.pages.length, partial });
  }
  function notifyPageStatus() {
    if (closed || !pageStatusListeners.size || pageStatusPending) return;
    pageStatusPending = true;
    void Promise.resolve().then(() => {
      pageStatusPending = false;
      if (closed) return;
      const next = JSON.stringify(getPageStatus());
      if (next === lastPageStatus) return;
      lastPageStatus = next;
      const listenersSnapshot = Array.from(pageStatusListeners);
      for (const listener of listenersSnapshot) listener();
    });
  }
  const alignFrame = (layout = renderer?.layout()) => {
    if (closed) return;
    const gutter = viewport.offsetWidth - viewport.clientWidth;
    const frame = canvasSurfacePageFrame(
      layout,
      root.clientWidth,
      renderer?.viewScale() ?? 1,
      Number.isFinite(gutter) ? Math.max(0, gutter) : 0,
    );
    // Scrollbars belong to the full host. Move only the document stage;
    // canvas and its absolute IME target continue to share one physical origin.
    const width = frame
      ? `${Math.max(frame.contentWidth, viewport.clientWidth - frame.marginLeft)}px`
      : 'max-content';
    const margin = frame ? `${frame.marginLeft}px` : '0px';
    if (stage.style.width !== width) stage.style.width = width;
    if (stage.style.marginLeft !== margin) stage.style.marginLeft = margin;
    stage.style.minWidth = frame ? '0px' : '100%';
    stage.style.overflow = frame ? 'clip' : 'visible';
  };
  const viewAllowsRequest = (message: RuntimeMessage): boolean => {
    try {
      return renderer?.viewAllowsRequest
        ? renderer.viewAllowsRequest(message) === true
        : renderer?.viewEditPolicyActive?.() !== true;
    } catch {
      return false;
    }
  };
  const viewAllowsSelection = (selection: SelectionTarget | null | undefined): boolean => {
    if (!selection) return true;
    try {
      return renderer?.viewAllowsRange
        ? renderer.viewAllowsRange(
            {
              section: selection.section,
              paragraph: selection.paragraph,
              unit: selection.startUnit,
            },
            { section: selection.section, paragraph: selection.paragraph, unit: selection.endUnit },
          ) === true
        : renderer?.viewEditPolicyActive?.() !== true;
    } catch {
      return false;
    }
  };
  const viewAllowsCurrentSelection = (): boolean => {
    try {
      if (renderer?.viewEditPolicyActive?.() !== true) return true;
      const selection = direct?.currentFormattingSelection();
      return Boolean(
        selection && renderer.viewAllowsRange?.(selection.anchor, selection.focus) === true,
      );
    } catch {
      return false;
    }
  };
  const render = (state: ReturnType<HeadlessEditor['getEditorState']>) => {
    if (closed || !renderer) return;
    // Only new observations may change the projection. Native acknowledgment
    // can repeat a snapshot the listener rendered, or arrive after a newer one.
    if (state.stateVersion <= observedStateVersion) return;
    observedStateVersion = state.stateVersion;
    const key = `${state.documentId}:${state.generation}:${state.operationRevision}:${state.viewRevision}`;
    if (state.status === 'refresh-required') {
      renderer.suspendGeometryEvidence();
      input.readOnly = true;
      return;
    }
    if (state.status !== 'ready') {
      renderer.suspendGeometryEvidence();
      return;
    }
    // Preview owner IDs belong to the full public snapshot. A private edit
    // window can retain yesterday's table coordinates after ordinary body input.
    const geometry =
      geometryLease && renderer.viewEditPolicyActive?.() !== true
        ? readGeometryProjection(geometryLease, state)
        : undefined;
    if (key === displayed) {
      renderer.observeSourceState(state);
      renderer.setGeometryEvidence(geometry?.content, geometry?.evidence);
      // Public selection commands do not change document/view revisions.
      // Observe them without rebuilding the page layout or republishing the
      // selection which originated in this input surface.
      const selected = state.selection as SelectionTarget | null;
      const nextSelectionKey = JSON.stringify(selected ?? null);
      if (
        historySelectionPublication &&
        state.content === historySelectionPublication.state.content &&
        state.nativeHistoryRevision === historySelectionPublication.state.nativeHistoryRevision &&
        nextSelectionKey === JSON.stringify(historySelectionPublication.target)
      ) {
        selectionKey = nextSelectionKey;
        return;
      }
      if (!nonTextHistoryPending && !bridge?.busy() && nextSelectionKey !== selectionKey) {
        selectionKey = nextSelectionKey;
        if (selected) {
          direct?.initializeCapabilities({
            ...(state.capabilities as object),
            historyRevision: state.nativeHistoryRevision,
            historyRevisions: state.nativeHistoryRevisions,
          });
          if (!direct?.selectTextRange(selected, { focusInput: false, selectionOrigin: 'core' }))
            status('선택한 텍스트의 화면 위치를 표시할 수 없습니다.');
        } else direct?.external({ kind: 'external-update', origin: 'core' });
      }
      return;
    }
    const changedDocument =
      displayed.split(':').slice(0, -2).join(':') !== key.split(':').slice(0, -2).join(':');
    if (changedDocument) {
      checkBoxControls?.message({ kind: 'load' });
      formTextControls?.message({ kind: 'load' });
      atomicProfile = undefined;
      // Reset the old projection without clearing the new document's Core selection.
      nonTextSelectionProjection = state;
      try {
        direct?.reset({ selectionOrigin: 'core' });
      } finally {
        nonTextSelectionProjection = undefined;
      }
      renderer.clear();
      selectionKey = '';
    }
    const retained = state.selection ? (state.selection as SelectionTarget) : undefined;
    const externalUpdate = Boolean(
      !nonTextHistoryPending && !retained && !changedDocument && displayed && !bridge?.busy(),
    );
    if (externalUpdate) direct?.external({ kind: 'external-update', origin: 'core' });
    displayed = key;
    checkBoxControls?.message({ kind: 'snapshot', content: state.content });
    formTextControls?.message({ kind: 'enable', ...(state.capabilities as object) });
    formTextControls?.message({ kind: 'snapshot', content: state.content });
    renderer.show(geometry?.content ?? state.content, {
      sourceState: state,
      geometryEvidence: geometry?.evidence,
      preserveScroll: !changedDocument,
      resourceEpoch: `${state.documentId}:${state.generation}:${state.operationRevision}`,
      resourceDocument: `${state.documentId}:${state.generation}`,
      // 같은 문서의 splice 대기 중 투영 계산을 유예합니다. snapshot의 ACK 귀속 판정은 아닙니다.
      deferLayout:
        !changedDocument && ['splice', 'undo', 'redo'].includes(bridge?.pendingKind() ?? ''),
    });
    if (!nonTextHistoryPending && retained && lease?.isActive() && !bridge?.busy()) {
      direct?.initializeCapabilities({
        ...(state.capabilities as object),
        historyRevision: state.nativeHistoryRevision,
        historyRevisions: state.nativeHistoryRevisions,
      });
      if (changedDocument) nonTextSelectionProjection = state;
      try {
        if (!direct?.selectTextRange(retained, { focusInput: false, selectionOrigin: 'core' }))
          direct?.external({ kind: 'external-update', origin: 'core' });
      } finally {
        if (changedDocument) nonTextSelectionProjection = undefined;
      }
    }
    // Resetting an external projection must adopt its actual Native revision.
    // Otherwise the next input's pre-edit bookmark is filed under the old revision.
    if (changedDocument || externalUpdate)
      direct?.initializeCapabilities({
        ...(state.capabilities as object),
        historyRevision: state.nativeHistoryRevision,
        historyRevisions: state.nativeHistoryRevisions,
      });
  };
  // Remember dialog entry/exit even when a caller checks only after it has closed.
  let sourceGridModalEpoch = 0;
  const sourceGridDialogEvent = (event: Event) => {
    if ((event.target as Element | null)?.tagName === 'DIALOG') sourceGridModalEpoch++;
  };
  doc.addEventListener?.('beforetoggle', sourceGridDialogEvent, true);
  const sourceGridDialogRecords = (records: MutationRecord[]) => {
    for (const record of records) {
      const dialog = (node: Node) =>
        node.nodeType === 1 &&
        ((node as Element).tagName === 'DIALOG' || (node as Element).querySelector?.('dialog'));
      if (
        (record.type === 'attributes' && (record.target as Element).tagName === 'DIALOG') ||
        [...record.addedNodes, ...record.removedNodes].some(dialog)
      )
        sourceGridModalEpoch++;
    }
  };
  const sourceGridModalObserver =
    realm.MutationObserver && doc.documentElement
      ? new realm.MutationObserver(sourceGridDialogRecords)
      : undefined;
  sourceGridModalObserver?.observe(doc.documentElement, {
    subtree: true,
    attributes: true,
    attributeFilter: ['open'],
    childList: true,
  });
  const sourceGridModalRevision = () => {
    sourceGridDialogRecords(sourceGridModalObserver?.takeRecords() ?? []);
    return sourceGridModalEpoch;
  };
  const cleanup = () => {
    outputLifetime.abort(Error('PrintSurfaceDetached'));
    closed = true;
    doc.removeEventListener?.('beforetoggle', sourceGridDialogEvent, true);
    sourceGridModalObserver?.disconnect();
    visiblePageCache = undefined;
    pageStatusListeners.clear();
    atomicProfile = undefined;
    nonTextHistoryAdmissionReady = false;
    nonTextHistoryPending = undefined;
    explicitClearPending = undefined;
    historySelectionPublication = undefined;
    frameObserver?.disconnect();
    bridge?.close();
    checkBoxControls?.close();
    formTextControls?.close();
    unsubscribe?.();
    try {
      direct?.close();
    } finally {
      try {
        lease?.release();
      } finally {
        renderer?.close();
        container.remove();
      }
    }
  };
  try {
    const rendererEnvironment = Object.create(environment);
    const hostEpochs = createHostEpochReaders(environment);
    for (const key of HOST_EPOCH_KEYS) {
      Object.defineProperty(rendererEnvironment, key, { value: hostEpochs[key] });
    }
    Object.defineProperty(rendererEnvironment, 'nativeGeometryEvidenceReader', {
      value: readNativeGeometryEvidence,
    });
    renderer = createSurfaceRenderer(
      canvas,
      viewport,
      spacer,
      (layout: any) => {
        direct?.reconcilePreviewPolicy?.();
        alignFrame(layout);
        notifyPageStatus();
      },
      rendererEnvironment,
    );
    if (environment.decodeImage) renderer.pictureDecoder(environment.decodeImage);
    const nativeLease = editor.acquireInputSurface({
      commitComposition: async () => {
        const result = direct?.flushComposition() ?? 'unchanged';
        if (result === 'blocked') return result;
        await bridge?.flush();
        return direct?.settled() ? 'unchanged' : 'blocked';
      },
      isOutputInputSettled,
      cancelComposition: () => direct?.cancelComposition(),
    });
    geometryLease = nativeLease; // Private geometry is bound to the original lease identity.
    // Recheck at the actual asynchronous Native gateway, not only at capture.
    lease = {
      ...nativeLease,
      request(message, options) {
        if (!viewAllowsRequest(message)) return Promise.reject(new Error('PreviewReadOnlyTarget'));
        return nativeLease.request(message, options);
      },
      publishSelection(selected) {
        return nativeLease.publishSelection(viewAllowsSelection(selected) ? selected : null);
      },
    };
    bridge = createControlBridge(
      {
        state: () => editor.getEditorState(),
        lease,
        acknowledge(reply, state) {
          const priorAcknowledgement = activeHistoryAcknowledgement;
          deferredTypingAcknowledgement = undefined;
          activeHistoryAcknowledgement = state;
          const finish = (modelPrepared = false) => {
            const deferred = deferredTypingAcknowledgement;
            deferredTypingAcknowledgement = undefined;
            const currentTyping =
              deferred &&
              deferred === state &&
              !closed &&
              editor.getEditorState() === deferred &&
              lease?.isActive() &&
              direct.consumeDeferredTypingProjection?.() === true;
            if (!closed && !modelPrepared && !currentTyping && !direct.historyModelReady())
              renderer.flushProjection();
          };
          try {
            if (state) render(state);
            checkBoxControls?.message(reply);
            formTextControls?.message(reply);
            const prepared = direct.message(reply);
            if (prepared && typeof prepared.then === 'function') {
              void Promise.resolve(prepared).then(
                (value) => finish(value === true),
                (error) => {
                  status(String(error));
                  finish();
                },
              );
            } else finish();
          } catch (error) {
            finish();
            throw error;
          } finally {
            activeHistoryAcknowledgement = priorAcknowledgement;
          }
        },
        error: (error) => status(String(error)),
      },
      (result, message) => {
        if (formattingReceipt?.kind === message.kind) formattingReceipt.result = result;
      },
    );
    const formControlsOptions = {
      canvas,
      viewport,
      renderer,
      note,
      ready: () =>
        !closed &&
        !nonTextHistoryPending &&
        bridge!.ready() &&
        !bridge!.busy() &&
        direct?.settled() === true,
      request: (message: RuntimeMessage) =>
        !closed && !nonTextHistoryPending && viewAllowsRequest(message) && bridge!.request(message),
    };
    checkBoxControls = createCheckBoxCanvasControls(formControlsOptions);
    formTextControls = createFormTextCanvasControls(formControlsOptions);
    direct = createCanvasEditor({
      canvas,
      viewport,
      input,
      renderer,
      controls: {
        ready: () => nonTextHistoryPending === undefined && bridge!.ready(),
        busy: () => nonTextHistoryPending !== undefined || bridge!.busy(),
        request: (message: RuntimeMessage) =>
          nonTextHistoryPending === undefined &&
          viewAllowsRequest(message) &&
          bridge!.request(message),
      },
      deferQueuedTypingProjection(draft: any, controllerCurrent: () => boolean) {
        const current = activeHistoryAcknowledgement;
        if (
          closed ||
          !current ||
          current !== editor.getEditorState() ||
          current.status !== 'ready' ||
          !lease?.isActive() ||
          bridge?.busy()
        )
          return false;
        const held = () => {
          if (
            closed ||
            current !== editor.getEditorState() ||
            !lease?.isActive() ||
            bridge?.pendingKind() !== 'splice' ||
            controllerCurrent() !== true
          )
            return false;
          // controller 검증 중 재진입한 state/lease/pending 변경은 유예를 해제한다.
          return (
            !closed &&
            current === editor.getEditorState() &&
            lease?.isActive() === true &&
            bridge?.pendingKind() === 'splice'
          );
        };
        if (
          renderer.stageQueuedTypingPreview(draft, held) !== true ||
          closed ||
          current !== editor.getEditorState() ||
          !lease?.isActive() ||
          bridge?.busy()
        )
          return false;
        deferredTypingAcknowledgement = current;
        return true;
      },
      historyModelState: () => {
        if (closed || !lease?.isActive() || !bridge?.ready() || bridge.busy()) return null;
        const state = editor.getEditorState();
        return state.status === 'ready' && renderer.historyModelMatches(state) ? state : null;
      },
      prepareHistoryModelSelection({ revision, selection, sourceState }: any) {
        const current = editor.getEditorState();
        if (
          closed ||
          !lease?.isActive() ||
          bridge?.busy() ||
          current !== sourceState ||
          sourceState !== activeHistoryAcknowledgement ||
          current.status !== 'ready' ||
          current.nativeHistoryRevision !== revision ||
          selection?.anchor?.section !== selection?.focus?.section ||
          selection?.anchor?.paragraph !== selection?.focus?.paragraph
        )
          return null;
        let target: SelectionTarget;
        try {
          target = createParagraphSelection(current, {
            section: selection.anchor.section,
            paragraph: selection.anchor.paragraph,
            startUnit: Math.min(selection.anchor.unit, selection.focus.unit),
            endUnit: Math.max(selection.anchor.unit, selection.focus.unit),
            affinity: selection.anchor.unit > selection.focus.unit ? 'backward' : 'forward',
          });
        } catch (error) {
          status(String(error));
          return null;
        }
        const publication = { state: current, target };
        historySelectionPublication = publication;
        return lease
          .publishSelection(target)
          .then((published) => {
            const fresh = editor.getEditorState();
            if (
              closed ||
              !lease?.isActive() ||
              historySelectionPublication !== publication ||
              fresh !== published ||
              fresh.content !== current.content ||
              fresh.documentId !== current.documentId ||
              fresh.generation !== current.generation ||
              fresh.operationRevision !== current.operationRevision ||
              fresh.viewRevision !== current.viewRevision ||
              fresh.nativeHistoryRevision !== revision ||
              !renderer.historyModelMatches(fresh)
            )
              return null;
            return fresh;
          })
          .catch((error) => {
            status(String(error));
            return null;
          })
          .finally(() => {
            if (historySelectionPublication === publication)
              historySelectionPublication = undefined;
          });
      },
      note,
      environment: { ...environment, ownerDocument: doc },
      platform: realm.navigator.platform,
      historyAvailability: () => getHistoryAvailability(editor.getEditorState()),
      transferMultiParagraphSelection(options: {
        cut?: boolean;
        clipboard?: { writeText?: (text: string) => Promise<void> } | null;
      }) {
        if (!nonTextHistoryAdmissionReady || !direct) return Promise.resolve(false);
        return transferSurfaceSelection(options);
      },
      requestStableNonTextHistory(kind: 'undo' | 'redo') {
        if (!nonTextHistoryAdmissionReady || !direct) return false;
        const state = nonTextHistoryState(kind);
        return state ? requestNonTextHistory(kind, state) : false;
      },
      queryEditRange: (m: RuntimeMessage) => viewAllowsRequest(m) && bridge!.request(m),
      querySplitRange: (m: RuntimeMessage) => viewAllowsRequest(m) && bridge!.request(m),
      onCommittedSelection(value: any, observation?: { origin?: string }) {
        if (closed || !lease?.isActive()) return;
        const state = editor.getEditorState();
        if (state.status !== 'ready') return;
        const singleOwnerRange =
          value &&
          value.anchor.section === value.focus.section &&
          value.anchor.paragraph === value.focus.paragraph;
        const point = singleOwnerRange && viewAllowsCurrentSelection() ? value.anchor : null,
          row = point && renderer.paragraph(point);
        const owner = paragraphSelectionOwner(row);
        const target: SelectionTarget | null =
          point && owner
            ? {
                ...state.token,
                coordinateSpace: 'display',
                format: (state.content as any).format,
                owner,
                section: point.section,
                paragraph: point.paragraph,
                startUnit: Math.min(value.anchor.unit, value.focus.unit),
                endUnit: Math.max(value.anchor.unit, value.focus.unit),
                affinity: value.anchor.unit > value.focus.unit ? 'backward' : 'forward',
              }
            : null;
        const key = JSON.stringify(target);
        if (observation?.origin === 'core' && nonTextSelectionProjection === state) {
          selectionKey = key;
          return;
        }
        const projectedClear =
          observation?.origin === 'core' && target === null && state.selection == null;
        const explicitClear =
          observation?.origin === 'canvas' && target === null && state.selection === undefined;
        if (key === selectionKey && (!explicitClear || explicitClearPending === state)) return;
        selectionKey = key;
        if (projectedClear) return;
        const clearingState = explicitClear ? state : undefined;
        if (clearingState) explicitClearPending = clearingState;
        void lease
          .publishSelection(target)
          .catch((error) => {
            if (!closed) status(String(error));
          })
          .finally(() => {
            if (clearingState && explicitClearPending === clearingState)
              explicitClearPending = undefined;
          });
      },
    });
    const resource = async (kind: string, payload: Record<string, number>, field: string) => {
      const token = editor.getEditorState().token;
      const answer = await editor.readResource({ kind, ...payload }, token);
      const now = editor.getEditorState().token;
      if (
        closed ||
        !lease!.isActive() ||
        token.documentId !== now.documentId ||
        token.generation !== now.generation ||
        token.operationRevision !== now.operationRevision
      )
        throw Error('StaleSurfaceResource');
      if (answer.error) throw Error(answer.error);
      return answer[field];
    };
    renderer.pictureReader((section: number, pictureNode: number) =>
      resource('picture-bytes', { section, pictureNode }, 'bytes'),
    );
    renderer.tableBackgroundReader((section: number, listNode: number) =>
      resource('table-background-bytes', { section, listNode }, 'bytes'),
    );
    renderer.chartReader((section: number, wrapper: number) =>
      resource('chart-display', { section, wrapper }, 'chart'),
    );
    render(editor.getEditorState());
    direct.initializeCapabilities({
      ...(editor.getEditorState().capabilities as object),
      historyRevision: editor.getEditorState().nativeHistoryRevision,
      historyRevisions: editor.getEditorState().nativeHistoryRevisions,
    });
    unsubscribe = editor.registerStateListener(render);
    const Observe = environment.ResizeObserver ?? realm.ResizeObserver;
    frameObserver = new Observe(() => alignFrame());
    frameObserver!.observe(root);
    alignFrame();
  } catch (error) {
    cleanup();
    throw error;
  }
  const historyKind = (kind: unknown): kind is 'undo' | 'redo' =>
    kind === 'undo' || kind === 'redo';
  // 텍스트 상태의 판정은 Canvas 내부에 남긴다. Core의 null 선택만으로 우회하지 않는다.
  const noneViewState = () => {
    if (closed || nonTextHistoryPending || !lease?.isActive() || bridge?.busy()) return undefined;
    const state = editor.getEditorState();
    const key = `${state.documentId}:${state.generation}:${state.operationRevision}:${state.viewRevision}`;
    if (
      state.status !== 'ready' ||
      state.selection != null ||
      state.stateVersion !== observedStateVersion ||
      key !== displayed ||
      direct?.historyRoute?.() !== 'none'
    )
      return undefined;
    // 표시·권한 조회 중 동기 재진입으로 입력이나 문서가 바뀌면 접수하지 않는다.
    if (
      closed ||
      nonTextHistoryPending ||
      !lease?.isActive() ||
      bridge?.busy() ||
      editor.getEditorState() !== state ||
      direct?.historyRoute?.() !== 'none' ||
      editor.getEditorState() !== state
    )
      return undefined;
    return state;
  };
  const nonTextHistoryState = (kind: 'undo' | 'redo') => {
    if (!historyKind(kind)) return undefined;
    const state = noneViewState();
    if (!state || (state.capabilities as { historyAvailable?: boolean })?.historyAvailable !== true)
      return undefined;
    const availability = getHistoryAvailability(state);
    if (!availability.available || !availability[kind === 'undo' ? 'canUndo' : 'canRedo'])
      return undefined;
    return noneViewState() === state ? state : undefined;
  };
  const modalOpen = () => {
    try {
      return typeof doc.querySelector === 'function' && doc.querySelector('dialog:modal') !== null;
    } catch {
      return true;
    }
  };
  const requestNonTextHistory = (
    kind: 'undo' | 'redo',
    state: ReturnType<HeadlessEditor['getEditorState']>,
  ) => {
    const request = {};
    nonTextHistoryPending = request;
    let resolveTask!: () => void;
    nonTextHistoryTask = new Promise<void>((resolve) => {
      resolveTask = resolve;
    });
    const sameOwner = () => {
      if (closed || nonTextHistoryPending !== request || !lease?.isActive()) return false;
      const current = editor.getEditorState();
      return current.documentId === state.documentId && current.generation === state.generation;
    };
    const settle = (result?: Awaited<ReturnType<HeadlessEditor['undo']>>, error?: unknown) => {
      let current: ReturnType<HeadlessEditor['getEditorState']> | undefined;
      const stillCurrent = () =>
        !closed &&
        !nonTextHistoryPending &&
        lease?.isActive() &&
        current !== undefined &&
        editor.getEditorState() === current &&
        current.documentId === state.documentId &&
        current.generation === state.generation;
      try {
        if (!sameOwner()) return;
        const observed = editor.getEditorState();
        if (observed.status === 'ready') render(observed);
        if (!sameOwner()) return;
        if (nonTextHistoryPending === request) nonTextHistoryPending = undefined;
        // 대기 중 선택 투영을 생략했을 수 있다. 옛 reply가 아닌 최신 Core 관측만 사용한다.
        current = editor.getEditorState();
        if (!stillCurrent()) return;
        if (current.status !== 'ready') {
          status('실행 취소/다시 실행 대기가 끝났습니다. 현재 문서 상태를 확인하세요.');
          return;
        }
        const key = `${current.documentId}:${current.generation}:${current.operationRevision}:${current.viewRevision}`;
        if (current.stateVersion !== observedStateVersion || key !== displayed) {
          status('실행 취소/다시 실행 대기가 끝났습니다. 현재 문서 표시를 확인하세요.');
          return;
        }
        // changed의 null은 미관측값이다. applied는 선택적 boolean이므로 부재/false만 허용한다.
        const noAffirmativeChange = (value: unknown) =>
          value === undefined || value === null || value === false;
        const reply = result?.reply;
        if (
          result?.status === 'rejected-unapplied' &&
          result.state === state &&
          current === state &&
          noAffirmativeChange(result.changed) &&
          (reply?.applied === undefined || reply.applied === false) &&
          noAffirmativeChange(reply?.changed) &&
          noAffirmativeChange(reply?.meta?.changed) &&
          (reply?.meta?.application === undefined || reply.meta.application === 'unapplied') &&
          noneViewState() === state
        ) {
          // 옛 그림/선택을 다시 발행하지 않고 현재 보기를 건드리지 않은 채 실패만 알린다.
          status(`실행 취소/다시 실행 실패: ${result.error ?? '요청이 적용되지 않았습니다.'}`);
          return;
        }
        direct.initializeCapabilities({
          ...(current.capabilities as object),
          historyRevision: current.nativeHistoryRevision,
          historyRevisions: current.nativeHistoryRevisions,
        });
        if (!stillCurrent()) return;
        selectionKey = JSON.stringify(current.selection ?? null);
        if (current.selection) {
          let selected: boolean;
          nonTextSelectionProjection = current;
          try {
            selected = direct.selectTextRange(current.selection, {
              focusInput: false,
              selectionOrigin: 'core',
            });
          } finally {
            nonTextSelectionProjection = undefined;
          }
          if (!stillCurrent()) return;
          if (!selected) {
            status('이력은 적용됐지만 복원된 텍스트 선택의 화면 위치를 확인할 수 없습니다.');
            return;
          }
        } else {
          direct.external({ kind: 'external-update', origin: 'core' });
          if (!stillCurrent()) return;
        }
        const failure = error ?? result?.error;
        status(
          failure
            ? `실행 취소/다시 실행 실패: ${String(failure)}`
            : result?.state !== current
              ? '이력 응답 뒤 변경된 현재 문서 상태를 표시했습니다.'
              : current.selection
                ? '실행 취소/다시 실행 적용 · 복원 선택 표시 완료'
                : '실행 취소/다시 실행 적용 · 텍스트 복원 위치 없음',
        );
      } catch (failure) {
        // 표시 오류를 Native 미적용 응답으로 바꾸지 않는다. 새 문서의 알림도 덮지 않는다.
        try {
          if (stillCurrent()) status(`이력 응답 후 화면 반영 실패: ${String(failure)}`);
        } catch {}
      } finally {
        if (nonTextHistoryPending === request) nonTextHistoryPending = undefined;
        resolveTask();
      }
    };
    try {
      // 기존 Core FIFO/토큰 검사를 사용한다. 별도 이력 모델·텍스트 ACK를 만들지 않는다.
      const task = editor[kind](state.token);
      void Promise.resolve(task).then(
        (result) => settle(result),
        (error) => settle(undefined, error),
      );
      return true;
    } catch (error) {
      settle(undefined, error);
      return false;
    }
  };
  // 서식 캡처가 소유한 단일 실제 모달만 허용한다. 두 캡처가 같은 수명을 공유한다.
  const formattingModalOwner = () => {
    let dialog: HTMLDialogElement | undefined,
      bound = false,
      invalid = false;
    const current = () => {
      if (invalid) return false;
      if (!bound) return !modalOpen();
      try {
        const active = doc.querySelectorAll('dialog:modal');
        return (
          dialog?.ownerDocument === doc &&
          dialog.isConnected === true &&
          dialog.open === true &&
          active.length === 1 &&
          active[0] === dialog
        );
      } catch {
        return false;
      }
    };
    return {
      current,
      isOwned: () => bound && current(),
      bind(element: HTMLDialogElement, verify: () => boolean) {
        if (bound) return false;
        bound = true;
        dialog = element;
        const valid = verify();
        if (!valid) invalid = true;
        return valid;
      },
    };
  };
  const rangeViewState = (modalCurrent: () => boolean = () => !modalOpen()) => {
    if (!viewAllowsCurrentSelection()) return undefined;
    if (closed || nonTextHistoryPending || !lease?.isActive() || bridge?.busy() || !modalCurrent())
      return undefined;
    const state = editor.getEditorState();
    const key = `${state.documentId}:${state.generation}:${state.operationRevision}:${state.viewRevision}`;
    if (
      state.status !== 'ready' ||
      state.selection != null ||
      state.stateVersion !== observedStateVersion ||
      key !== displayed ||
      direct.hasMultiParagraphSelection() !== true ||
      !direct.settled()
    )
      return undefined;
    return !closed && lease?.isActive() && !bridge?.busy() && editor.getEditorState() === state
      ? state
      : undefined;
  };
  const rangeWritable = (state: ReturnType<HeadlessEditor['getEditorState']>) =>
    (state.capabilities as { readOnly?: boolean } | undefined)?.readOnly !== true &&
    (state.content as { readOnly?: boolean } | undefined)?.readOnly !== true;
  const surfaceClipboard = () =>
    environment.clipboard === undefined ? realm.navigator?.clipboard : environment.clipboard;
  const captureSurfaceSelection = (
    options: {
      cut?: boolean;
      clipboard?: { writeText?: (text: string) => Promise<void> } | null;
    } = {},
  ) => {
    const state = rangeViewState();
    const clipboard = options.clipboard === undefined ? surfaceClipboard() : options.clipboard;
    if (
      !state ||
      (options.cut === true && !rangeWritable(state)) ||
      !direct.canTransferSelection(options.cut === true, true, clipboard)
    )
      return null;
    const active = () =>
      (input.getRootNode() as Document | ShadowRoot).activeElement ?? doc.activeElement;
    const focus = active();
    return direct.captureTransferSelection({
      cut: options.cut === true,
      clipboard,
      multiOnly: true,
      isCurrent: () =>
        rangeViewState() === state &&
        (options.cut !== true || rangeWritable(state)) &&
        active() === focus &&
        rangeViewState() === state,
    }) as (() => Promise<boolean>) | null;
  };
  const transferSurfaceSelection = (
    options: {
      cut?: boolean;
      clipboard?: { writeText?: (text: string) => Promise<void> } | null;
    } = {},
  ) => captureSurfaceSelection(options)?.() ?? Promise.resolve(false);
  const prepareAtomicProfile = (state: ReturnType<HeadlessEditor['getEditorState']>) => {
    if (closed || !lease?.isActive() || state.status !== 'ready') return Promise.resolve(false);
    if (
      atomicProfile?.documentId === state.documentId &&
      atomicProfile.generation === state.generation &&
      atomicProfile.format === (state.content as any)?.format
    )
      return atomicProfile.pending ? atomicProfileTask.then(() => !closed) : Promise.resolve(true);
    const profile = {
      documentId: state.documentId,
      generation: state.generation,
      format: (state.content as any)?.format,
      pending: true,
      alignment: 'AtomicCapabilitiesPending' as string | null,
      fonts: 'AtomicCapabilitiesPending' as string | null,
    };
    atomicProfile = profile;
    atomicProfileTask = trackFormattingTask(
      Promise.resolve()
        .then(() => editor.readResource({ kind: 'formatting-capabilities' }, state.token))
        .then((answer) => {
          if (
            closed ||
            atomicProfile !== profile ||
            editor.getEditorState().documentId !== profile.documentId ||
            editor.getEditorState().generation !== profile.generation
          )
            return;
          const cap = (answer as any).formattingCapabilities;
          const transport =
            (answer as any).formattingBatchQueryAvailable === true
              ? null
              : 'AtomicBatchQueryUnavailable';
          profile.alignment = transport ?? atomicRangeUnavailable(cap, 'alignment', profile.format);
          profile.fonts = transport ?? atomicRangeUnavailable(cap, 'font-names', profile.format);
          profile.pending = false;
          try {
            status('서식 지원 정보를 확인했습니다.');
          } catch {
            /* 표시 실패로 실제 Native 관측을 바꾸지 않는다. */
          }
        })
        .catch((error) => {
          if (closed || atomicProfile !== profile) return;
          const reason = error instanceof Error ? error.message : String(error);
          profile.pending = false;
          profile.alignment = profile.fonts = reason;
          if (['StaleTarget', 'StaleReply'].includes(reason)) atomicProfile = undefined;
        }),
    );
    return atomicProfileTask.then(() => !closed);
  };
  nonTextHistoryAdmissionReady = true;
  let disposal: Promise<void> | undefined;
  const getPrintAvailability = (): CanvasPrintAvailability => {
    if (closed || !lease?.isActive()) return { available: false, reason: 'detached' };
    if (
      typeof editor.captureDocumentOutput !== 'function' ||
      typeof realm.OffscreenCanvas !== 'function' ||
      typeof realm.HTMLDialogElement?.prototype.showModal !== 'function' ||
      !doc.fonts
    )
      return { available: false, reason: 'unsupported' };
    const state = editor.getEditorState();
    if (
      state.status !== 'ready' ||
      state.historyRecoveryRequired ||
      state.nativeHistoryStats?.poisoned === true
    )
      return { available: false, reason: 'not-ready' };
    return isOutputInputSettled() && !modalOpen()
      ? { available: true }
      : { available: false, reason: 'busy' };
  };
  const captureCellWidth = () => {
    const state = editor.getEditorState();
    const current = () =>
      !closed &&
      !nonTextHistoryPending &&
      lease?.isActive() === true &&
      !bridge?.busy() &&
      !modalOpen() &&
      editor.getEditorState() === state &&
      state.status === 'ready' &&
      state.stateVersion === observedStateVersion &&
      displayed ===
        `${state.documentId}:${state.generation}:${state.operationRevision}:${state.viewRevision}` &&
      renderer.historyModelMatches(state) &&
      direct.settled();
    if (!current()) return { capture: null, reason: 'SourceTableCellWidthInputPending' };
    const captured = direct.captureSourceTableCellBlock('width');
    if (!captured || !captured.current() || !current())
      return { capture: null, reason: 'MissingSourceTableCellWidthSelection' };
    try {
      const w: Parameters<NonNullable<InputSurfaceLease['captureSourceTableCellWidth']>>[0] =
        captured.witness;
      sourceTableCellWidthPlanForFormat(
        (state.content as { format?: string })?.format,
        captured.table,
        {
          section: w.section,
          tableNode: w.tableNode,
          expectedRows: w.rows,
          expectedColumns: w.columns,
          top: Math.min(...w.cells.map((cell) => cell.row)),
          left: Math.min(...w.cells.map((cell) => cell.column)),
          bottom: Math.max(...w.cells.map((cell) => cell.row)) + 1,
          right: Math.max(...w.cells.map((cell) => cell.column)) + 1,
        },
      );
    } catch (error) {
      return {
        capture: null,
        reason: error instanceof Error ? error.message : 'SourceTableCellWidthUnavailable',
      };
    }
    const live = () => current() && captured.current() && current();
    const target = lease?.captureSourceTableCellWidth?.(captured.witness, live);
    return target
      ? { capture: Object.freeze({ state, target, current: live }), reason: undefined }
      : { capture: null, reason: 'SourceTableCellWidthUnavailable' };
  };
  const captureCellHeight = () => {
    const state = editor.getEditorState();
    const current = () =>
      !closed &&
      !nonTextHistoryPending &&
      lease?.isActive() === true &&
      !bridge?.busy() &&
      !modalOpen() &&
      editor.getEditorState() === state &&
      state.status === 'ready' &&
      state.stateVersion === observedStateVersion &&
      displayed ===
        `${state.documentId}:${state.generation}:${state.operationRevision}:${state.viewRevision}` &&
      renderer.historyModelMatches(state) &&
      direct.settled();
    try {
      if (!current()) throw Error('SourceTableCellHeightBusy');
      const captured = direct.captureSourceTableCellHeight();
      const live = () => current() && captured.current() && current();
      if (!live()) throw Error('StaleSourceTableCellHeightMeasurement');
      const target = lease?.captureSourceTableCellHeight?.(
        captured.witness,
        captured.minimums,
        live,
      );
      if (!target) throw Error('SourceTableCellHeightUnavailable');
      return { capture: Object.freeze({ state, target, current: live }), reason: null };
    } catch (error) {
      return { capture: null, reason: error instanceof Error ? error.message : String(error) };
    }
  };
  return {
    /** Measured visible page only; never a source page number or caret page. */
    getPageStatus,
    subscribePageStatus(listener: () => void): () => void {
      if (closed) return () => {};
      pageStatusListeners.add(listener);
      return () => {
        pageStatusListeners.delete(listener);
      };
    },
    canEditCellProperties(section: number, listNode: number): boolean {
      const state = editor.getEditorState();
      const key = `${state.documentId}:${state.generation}:${state.operationRevision}:${state.viewRevision}`;
      if (
        closed ||
        !lease?.isActive() ||
        state.status !== 'ready' ||
        state.stateVersion !== observedStateVersion ||
        key !== displayed ||
        ![section, listNode].every(
          (n) => Number.isSafeInteger(n) && n >= 0 && n <= 0xffffffff && !Object.is(n, -0),
        )
      )
        return false;
      return viewAllowsRequest({ kind: 'cell-size', section, listNode } as RuntimeMessage);
    },
    canRequestHistory(kind: 'undo' | 'redo'): boolean {
      if (!historyKind(kind) || closed || nonTextHistoryPending) return false;
      const route = direct.historyRoute();
      if (route === 'none') return Boolean(nonTextHistoryState(kind));
      return route === 'text' && !closed && direct.canRequestHistory(kind);
    },
    requestHistory(kind: 'undo' | 'redo'): boolean {
      if (!historyKind(kind) || closed || nonTextHistoryPending) return false;
      const route = direct.historyRoute();
      if (route === 'none') {
        const state = nonTextHistoryState(kind);
        return state ? requestNonTextHistory(kind, state) : false;
      }
      return route === 'text' && !closed && direct.requestHistory(kind);
    },
    focus(): boolean {
      if (closed || nonTextHistoryPending || !lease?.isActive() || modalOpen()) return false;
      const state = editor.getEditorState();
      const key = `${state.documentId}:${state.generation}:${state.operationRevision}:${state.viewRevision}`;
      if (
        state.status !== 'ready' ||
        state.stateVersion !== observedStateVersion ||
        key !== displayed
      )
        return false;
      const route = direct.historyRoute();
      if (route === 'blocked') return false;
      if (route === 'text')
        return (
          direct.focusInput() &&
          !closed &&
          !nonTextHistoryPending &&
          lease?.isActive() === true &&
          !modalOpen() &&
          editor.getEditorState() === state
        );
      if (!direct.settled()) return false;
      const current = noneViewState();
      if (
        typeof doc.querySelector !== 'function' ||
        !current ||
        current !== state ||
        modalOpen() ||
        noneViewState() !== current
      )
        return false;
      // disabled 입력을 활성화하거나 가짜 caret을 만들지 않고 명시적 host.focus만 복귀한다.
      canvas.focus({ preventScroll: true });
      return (
        ((canvas.getRootNode() as Document | ShadowRoot).activeElement ?? doc.activeElement) ===
          canvas &&
        !modalOpen() &&
        noneViewState() === current
      );
    },
    canTransferSelection(
      cut = false,
      clipboard:
        | { writeText?: (text: string) => Promise<void> }
        | null
        | undefined = surfaceClipboard(),
    ): boolean {
      const state = rangeViewState();
      return Boolean(
        state &&
        (!cut || rangeWritable(state)) &&
        direct.canTransferSelection(cut, true, clipboard) &&
        rangeViewState() === state,
      );
    },
    captureTransferSelection(
      options: {
        cut?: boolean;
        clipboard?: { writeText?: (text: string) => Promise<void> } | null;
      } = {},
    ): (() => Promise<boolean>) | null {
      return captureSurfaceSelection(options);
    },
    transferSelection(
      options: {
        cut?: boolean;
        clipboard?: { writeText?: (text: string) => Promise<void> } | null;
      } = {},
    ): Promise<boolean> {
      return transferSurfaceSelection(options);
    },
    /** SOURCE selection lease only; Native grid command support is checked by its future caller. */
    captureSourceTableGridSelection() {
      const state = editor.getEditorState();
      const selection = state.selection;
      const content = state.content;
      const modalEpoch = sourceGridModalRevision();
      const viewOptions = renderer.getDisplayOptions();
      const tokenKeys = [
        'editorId',
        'documentId',
        'generation',
        'operationRevision',
        'viewRevision',
      ] as const;
      const token = tokenKeys.map((key) => state.token[key]);
      const selected = getSelectionFormatting(state).target;
      if (!selected) return null;
      const selectionKeys = [
        ...tokenKeys,
        'coordinateSpace',
        'format',
        'owner',
        'section',
        'paragraph',
        'startUnit',
        'endUnit',
        'affinity',
      ] as const;
      const values = selectionKeys.map((key) => selected[key]);
      const current = () => {
        if (
          closed ||
          nonTextHistoryPending ||
          lease?.isActive() !== true ||
          bridge?.busy() ||
          sourceGridModalRevision() !== modalEpoch ||
          modalOpen() ||
          renderer.getDisplayOptions() !== viewOptions ||
          editor.getEditorState() !== state ||
          state.status !== 'ready' ||
          state.selection !== selection ||
          !viewAllowsSelection(selected) ||
          state.content !== content ||
          state.stateVersion !== observedStateVersion ||
          displayed !==
            `${state.documentId}:${state.generation}:${state.operationRevision}:${state.viewRevision}` ||
          tokenKeys.some((key, i) => state.token[key] !== token[i] || state[key] !== token[i]) ||
          (state.capabilities as any)?.readOnly === true ||
          (content as any)?.readOnly === true ||
          !direct.settled() ||
          !renderer.historyModelMatches(state)
        )
          return false;
        const target = getSelectionFormatting(state).target;
        if (!target || selectionKeys.some((key, i) => target[key] !== values[i])) return false;
        const points = direct.currentFormattingSelection();
        return Boolean(
          points &&
          points.anchor.section === selected.section &&
          points.focus.section === selected.section &&
          points.anchor.paragraph === selected.paragraph &&
          points.focus.paragraph === selected.paragraph &&
          Math.min(points.anchor.unit, points.focus.unit) === selected.startUnit &&
          Math.max(points.anchor.unit, points.focus.unit) === selected.endUnit &&
          editor.getEditorState() === state,
        );
      };
      if (!current()) return null;
      const captured = direct.captureSourceTableGridSelection(content);
      if (
        !captured ||
        !viewAllowsRequest({
          kind: 'source-table-grid',
          section: captured.section,
          tableNode: captured.tableNode,
        } as RuntimeMessage) ||
        !captured.current() ||
        !current()
      )
        return null;
      let invalid = false,
        historyRecorded = false;
      return Object.freeze({
        ...captured,
        state,
        recordHistory(
          result: import('@hwpjs/core').CommandResult,
          request: Readonly<import('@hwpjs/core').EditSourceTableGridPayload>,
        ): boolean {
          if (historyRecorded) return false;
          historyRecorded = true;
          const after = result.state;
          if (
            closed ||
            nonTextHistoryPending ||
            lease?.isActive() !== true ||
            bridge?.busy() ||
            result.status !== 'committed-with-snapshot' ||
            result.error ||
            result.changed !== true ||
            result.reply?.historyRevision !== after.nativeHistoryRevision ||
            editor.getEditorState() !== after ||
            after.status !== 'ready' ||
            after.stateVersion !== observedStateVersion ||
            displayed !==
              `${after.documentId}:${after.generation}:${after.operationRevision}:${after.viewRevision}` ||
            !renderer.historyModelMatches(after) ||
            !direct.settled() ||
            tokenKeys.some((key, i) => state.token[key] !== token[i] || state[key] !== token[i]) ||
            state.selection !== selection ||
            selectionKeys.some((key, i) => (state.selection as any)?.[key] !== values[i]) ||
            request.section !== captured.section ||
            request.tableNode !== captured.tableNode ||
            request.expectedRows !== captured.rows ||
            request.expectedColumns !== captured.columns
          )
            return false;
          return direct.observeSourceTableGridHistory({ before: state, after, request });
        },
        current() {
          if (invalid) return false;
          try {
            if (current() && captured.current() && current()) return true;
          } catch {
            /* A lost source/model/token cannot revive the lease. */
          }
          invalid = true;
          return false;
        },
      });
    },
    captureGeneratedTableGridSelection() {
      const state = editor.getEditorState();
      const current = () =>
        viewAllowsCurrentSelection() &&
        !closed &&
        !nonTextHistoryPending &&
        lease?.isActive() === true &&
        !bridge?.busy() &&
        !modalOpen() &&
        editor.getEditorState() === state &&
        state.status === 'ready' &&
        state.stateVersion === observedStateVersion &&
        displayed ===
          `${state.documentId}:${state.generation}:${state.operationRevision}:${state.viewRevision}` &&
        (state.capabilities as any)?.createdTableGridAvailable === true &&
        (state.capabilities as any)?.readOnly !== true &&
        (state.content as any)?.readOnly !== true &&
        direct.settled() &&
        renderer.historyModelMatches(state);
      if (!current()) return null;
      const captured = direct.captureGeneratedTableGridSelection();
      if (!captured || !current() || !captured.current()) return null;
      let invalid = false;
      return Object.freeze({
        state,
        section: captured.section,
        createdCell: captured.createdCell,
        current() {
          if (invalid) return false;
          if (current() && captured.current() && current()) return true;
          invalid = true;
          return false;
        },
      });
    },
    captureCaretFormatting() {
      const state = editor.getEditorState();
      if (
        closed ||
        nonTextHistoryPending ||
        !lease?.isActive() ||
        bridge?.busy() ||
        modalOpen() ||
        state.status !== 'ready'
      )
        return null;
      const source = getSelectionFormatting(state);
      const selected = source.target;
      if (!selected || source.characterAvailableReason === 'CreatedCellRequiresSurfacePort')
        return null;
      const canonical = () => {
        if (!viewAllowsSelection(selected) || !viewAllowsCurrentSelection()) return false;
        if (
          closed ||
          nonTextHistoryPending ||
          !lease?.isActive() ||
          bridge?.busy() ||
          state !== editor.getEditorState() ||
          state.status !== 'ready' ||
          observedStateVersion !== state.stateVersion ||
          displayed !==
            `${state.documentId}:${state.generation}:${state.operationRevision}:${state.viewRevision}` ||
          !direct.settled() ||
          !renderer.historyModelMatches(state) ||
          !selected ||
          selected.startUnit !== selected.endUnit
        )
          return false;
        const points = direct.currentFormattingSelection();
        return (
          points &&
          points.anchor.section === selected.section &&
          points.focus.section === selected.section &&
          points.anchor.paragraph === selected.paragraph &&
          points.focus.paragraph === selected.paragraph &&
          points.anchor.unit === selected.startUnit &&
          points.focus.unit === selected.endUnit &&
          Boolean(caretGeometry(renderer.layout(), points.anchor)) &&
          editor.getEditorState() === state
        );
      };
      if (modalOpen() || !canonical()) return null;
      const modal = formattingModalOwner();
      const current = () => canonical() && modal.current();
      const postCurrent = () => canonical() && (!modalOpen() || modal.isOwned());
      const captured = direct.captureCaretFormatting(current, postCurrent, modal.isOwned);
      if (!captured || !current()) return null;
      const writable = rangeWritable(state);
      const properties =
        writable && captured.supported('character-properties')
          ? null
          : 'CaretTypingPropertiesUnavailable';
      const font =
        writable && captured.supported('font-name') ? null : 'CaretTypingFontUnavailable';
      const readonlyReason = writable ? null : 'ReadOnlyDocument';
      const pending = captured.typing;
      const character = pending.character;
      const fontNames = { ...source.fontNames };
      const fontNameAvailableReasons = { ...source.fontNameAvailableReasons };
      FONT_LANGUAGES.forEach((language: import('@hwpjs/core').CharacterFontLanguage) => {
        fontNameAvailableReasons[language] = readonlyReason ?? font;
        const name = character?.fonts?.[language]?.name;
        if (typeof name === 'string')
          fontNames[language] = Object.freeze({ kind: 'single' as const, name });
      });
      if (pending.font)
        fontNames[pending.font.language as import('@hwpjs/core').CharacterFontLanguage] =
          Object.freeze({ kind: 'single' as const, name: pending.font.name });
      return Object.freeze({
        mode: 'typing' as const,
        state,
        observation: Object.freeze({
          ...source,
          ...pending.properties,
          ...(character?.size === undefined ? {} : { size: character.size }),
          ...(character?.bold === undefined ? {} : { bold: character.bold }),
          ...(character?.italic === undefined ? {} : { italic: character.italic }),
          underline: pending.underline ?? source.underline,
          strike: pending.strike ?? source.strike,
          textColor:
            character?.textColor === undefined
              ? source.textColor
              : `#${character.textColor.toString(16).padStart(6, '0')}`,
          fontNames: Object.freeze(fontNames),
        }),
        reasons: Object.freeze({
          characterAvailableReason: readonlyReason ?? properties,
          paragraphAvailableReason: source.paragraphAvailableReason,
          fontNameAvailableReasons: Object.freeze(fontNameAvailableReasons),
          fontNamesAvailableReason:
            readonlyReason ??
            (captured.supported('font-names') ? null : 'CaretRepresentativeFontUnavailable'),
          textColorAvailableReason:
            readonlyReason ??
            (captured.supported('text-color') ? null : 'CaretTypingColorUnavailable'),
          underlineAvailableReason:
            readonlyReason ??
            (captured.supported('underline') ? null : 'CaretTypingUnderlineUnavailable'),
          strikeAvailableReason:
            readonlyReason ??
            (captured.supported('strike') ? null : 'CaretTypingStrikeUnavailable'),
        }),
        current: () => current() && captured.current(),
        bindDialog(element: HTMLDialogElement) {
          return modal.bind(element, () => current() && captured.current());
        },
        request(intent: SurfaceFormattingIntent) {
          return writable && current() && captured.current() && captured.request(intent) === true;
        },
        appliedCurrent: () => postCurrent() && captured.appliedCurrent(),
      });
    },
    captureSelectionFormatting() {
      const state = rangeViewState();
      if (!state) return null;
      const modal = formattingModalOwner();
      const dialogCurrent = modal.current;
      const current = () => rangeViewState(dialogCurrent) === state;
      let binding: ReturnType<typeof captureFormattingRangeBinding> = null;
      const captured = direct.captureSelectionFormatting(
        current,
        (anchor: unknown, focus: unknown) => {
          binding = captureFormattingRangeBinding(state, { anchor, focus });
          const ranges = paragraphSelectionRanges(
            (state.content as any)?.paragraphs,
            anchor,
            focus,
            undefined,
            { sourcePositions: false },
          );
          return rangeFormattingObservation(state.content, ranges);
        },
        modal.isOwned,
      );
      if (!captured || !current()) return null;
      if (rangeWritable(state)) void prepareAtomicProfile(state);
      const atomicReason = (kind: string): string | null => {
        if (!rangeWritable(state)) return 'ReadOnlyDocument';
        if (!binding) return 'UnsupportedFormattingSelection';
        const profile = atomicProfile;
        if (
          !profile ||
          profile.documentId !== state.documentId ||
          profile.generation !== state.generation ||
          profile.pending
        )
          return 'AtomicCapabilitiesPending';
        return kind === 'alignment' ? profile.alignment : profile.fonts;
      };
      const reason = (kind: string): string | null =>
        !rangeWritable(state)
          ? 'ReadOnlyDocument'
          : captured.supported(kind)
            ? null
            : 'RangeFormattingUnsupported';
      const reasons = () =>
        Object.freeze({
          characterAvailableReason: reason('character-properties'),
          underlineAvailableReason: reason('underline'),
          strikeAvailableReason: reason('strike'),
          textColorAvailableReason:
            reason('text-color') ??
            (captured.observation.colorBindingValid ? null : 'UnknownCharacterTextColor'),
          fontNameAvailableReasons: Object.freeze(
            Object.fromEntries(
              FONT_LANGUAGES.map((language: import('@hwpjs/core').CharacterFontLanguage) => [
                language,
                reason('font-name') ??
                  (captured.observation.fontBindings[language] ? null : 'UnknownCharacterFontName'),
              ]),
            ),
          ) as Readonly<Record<import('@hwpjs/core').CharacterFontLanguage, string | null>>,
          fontNamesAvailableReason: atomicReason('font-names'),
          paragraphAvailableReason: atomicReason('alignment'),
        });
      let used = false,
        prepared: Awaited<ReturnType<typeof prepareAtomicRangeRequest>> | undefined,
        completion:
          | Promise<{ result: import('@hwpjs/core').CommandResult | null; current: boolean }>
          | undefined;
      let settledResult: import('@hwpjs/core').CommandResult | null | undefined;
      const viewCurrent = () => {
        const fresh = editor.getEditorState();
        const selection = direct.currentFormattingSelection();
        return (
          !closed &&
          lease?.isActive() === true &&
          fresh.status === 'ready' &&
          renderer.historyModelMatches(fresh) === true &&
          formattingRangeBindingMatches(binding, fresh, selection) &&
          Boolean(
            caretGeometry(renderer.layout(), selection.anchor) &&
            caretGeometry(renderer.layout(), selection.focus),
          ) &&
          !closed &&
          lease?.isActive() === true &&
          editor.getEditorState() === fresh &&
          renderer.historyModelMatches(fresh) === true
        );
      };
      const resultCurrent = (
        result: import('@hwpjs/core').CommandResult | null | undefined,
      ): boolean => {
        if (!result) return false;
        try {
          const fresh = editor.getEditorState();
          return Boolean(
            (result.state === fresh || sameHistoryModelObservation(result.state, fresh)) &&
            viewCurrent(),
          );
        } catch {
          // 완료 뒤 화면 관측 실패도 원 Core 결과를 바꾸지 않는다.
          return false;
        }
      };
      return Object.freeze({
        state,
        observation: captured.observation,
        get reasons() {
          return reasons();
        },
        current: () => current() && captured.current(),
        bindDialog(element: HTMLDialogElement): boolean {
          return modal.bind(element, () => current() && captured.current());
        },
        async prepare(intent?: SurfaceFormattingIntent): Promise<boolean> {
          if (used || !current() || !captured.current()) return false;
          if (!intent) {
            await prepareAtomicProfile(state);
            return current() && captured.current();
          }
          if (!['alignment', 'font-names'].includes(intent.kind))
            return current() && captured.current() && rangeWritable(state);
          if (!binding || !rangeWritable(state) || formattingPreparation) return false;
          const record = {};
          formattingPreparation = record;
          const task = prepareAtomicRangeRequest({
            read: (message, token) => editor.readResource(message, token),
            selectors: formattingRangeSelectors(binding, intent.kind === 'font-names'),
            intent,
            token: state.token,
            revision: state.nativeHistoryRevision,
            format: (state.content as any).format,
            current: () => current() && captured.current() && rangeWritable(state),
          })
            .then((request) => {
              prepared = request;
              return current() && captured.current();
            })
            .finally(() => {
              if (formattingPreparation === record) formattingPreparation = undefined;
            });
          trackFormattingTask(task);
          return task;
        },
        request(intent: SurfaceFormattingIntent): boolean {
          if (used) return false;
          used = true;
          if (!current() || !rangeWritable(state)) return false;
          if (intent.kind === 'text-color' && reasons().textColorAvailableReason !== null)
            return false;
          if (
            intent.kind === 'font-name' &&
            reasons().fontNameAvailableReasons[intent.language] !== null
          )
            return false;
          const atomic = ['alignment', 'font-names'].includes(intent.kind);
          if (atomic) {
            if (!prepared || atomicReason(intent.kind) !== null) return false;
            const patch = atomicRangePatch(intent);
            if (JSON.stringify(patch) !== JSON.stringify(prepared.patch)) return false;
          }
          const receipt = {
            kind: atomic
              ? 'formatting-patch'
              : (
                  {
                    'character-properties': 'character-properties-ranges',
                    underline: 'character-underline-ranges',
                    strike: 'character-strike-ranges',
                    'text-color': 'character-text-color-ranges',
                    'font-name': 'character-font-name-ranges',
                    'font-id': 'character-font-ranges',
                    shade: 'character-shade-ranges',
                    outline: 'character-outline-ranges',
                    effect: 'character-effect-ranges',
                  } as Record<string, string>
                )[intent.kind],
            result: null as import('@hwpjs/core').CommandResult | null,
          };
          formattingReceipt = receipt;
          const accepted = atomic
            ? direct.requestAtomicFormatting(prepared, () => current() && captured.current())
            : captured.request(intent) === true;
          if (!accepted) {
            if (formattingReceipt === receipt) formattingReceipt = undefined;
            return false;
          }
          void direct.startFormattingPaint(
            () => activeHistoryAcknowledgement === editor.getEditorState() && viewCurrent(),
            () =>
              atomic &&
              receipt.result?.status === 'rejected-unapplied' &&
              receipt.result.state === state &&
              editor.getEditorState() === state &&
              rangeWritable(state) &&
              viewCurrent(),
          );
          completion = bridge!
            .flush()
            .then(async () => {
              await Promise.resolve();
              const result = receipt.result;
              const currentView = resultCurrent(result);
              settledResult = result;
              return Object.freeze({ result, current: currentView });
            })
            .finally(() => {
              if (formattingReceipt === receipt) formattingReceipt = undefined;
            });
          return true;
        },
        settledCurrent(): boolean {
          try {
            if (modalOpen() && !dialogCurrent()) return false;
            return resultCurrent(settledResult);
          } catch {
            return false;
          }
        },
        settle() {
          return completion ?? Promise.resolve(Object.freeze({ result: null, current: false }));
        },
      });
    },
    captureRangeFormatting(property: 'underline' | 'strike') {
      const state = rangeViewState();
      if (!state) return null;
      if (!rangeWritable(state))
        return Object.freeze({
          state,
          value: null,
          reason: 'ReadOnlyDocument',
          request: () => false,
        });
      const captured = direct.captureRangeFormatting(
        property,
        () => rangeViewState() === state && rangeWritable(state),
      );
      if (!captured || rangeViewState() !== state) return null;
      let used = false;
      return Object.freeze({
        state,
        value: captured.value as boolean | 'mixed' | null,
        reason: captured.reason as string | null,
        request(): boolean {
          if (used) return false;
          used = true;
          return rangeViewState() === state && rangeWritable(state) && captured.request() === true;
        },
      });
    },
    canPasteInput(): boolean {
      return !closed && direct.canPasteInput();
    },
    canRequestBlockSelection(): boolean {
      return (
        !closed && lease?.isActive() === true && !modalOpen() && direct.canRequestBlockSelection()
      );
    },
    requestBlockSelection(): boolean {
      return (
        !closed && lease?.isActive() === true && !modalOpen() && direct.requestBlockSelection()
      );
    },
    canRequestCellBlock(requireFocus = false): boolean {
      return (
        !closed &&
        lease?.isActive() === true &&
        !modalOpen() &&
        direct.canRequestCellBlock(requireFocus)
      );
    },
    requestCellBlock(extend = false, fromContext = false): boolean {
      return (
        !closed &&
        lease?.isActive() === true &&
        !modalOpen() &&
        direct.requestCellBlock(extend, fromContext)
      );
    },
    registerCellBlockMenu(menu: HTMLElement, ownsInput?: (input: HTMLElement) => boolean): void {
      if (!closed && lease?.isActive() === true) direct.registerCellBlockMenu(menu, ownsInput);
    },
    /** F5 supplies a witness; Core validates canonical owners/capabilities, never pixels. */
    captureCellAppearanceSelection() {
      const state = editor.getEditorState();
      const current = () =>
        !closed &&
        !nonTextHistoryPending &&
        lease?.isActive() === true &&
        !bridge?.busy() &&
        !modalOpen() &&
        editor.getEditorState() === state &&
        state.status === 'ready' &&
        state.stateVersion === observedStateVersion &&
        displayed ===
          `${state.documentId}:${state.generation}:${state.operationRevision}:${state.viewRevision}` &&
        viewAllowsCurrentSelection() &&
        renderer.historyModelMatches(state) &&
        direct.settled();
      if (!current() || !direct.hasCellBlock()) return null;
      const captured = direct.captureSourceTableCellBlock('appearance');
      if (!captured || !captured.current() || !current()) return null;
      const witness = Object.freeze({
        ...captured.witness,
        cells: Object.freeze(
          captured.witness.cells.map((c: any) =>
            Object.freeze({ ...c, paragraphs: Object.freeze([...c.paragraphs]) }),
          ),
        ),
      });
      try {
        planCellAppearanceSelection(state, witness);
      } catch {
        return null;
      }
      let invalid = false;
      return Object.freeze({
        state,
        witness,
        current() {
          if (invalid) return false;
          try {
            if (current() && captured.current() && current()) return true;
          } catch {
            /* lost owner */
          }
          invalid = true;
          return false;
        },
      });
    },
    captureSourceTableCellMerge() {
      const state = editor.getEditorState();
      const current = () =>
        !closed &&
        !nonTextHistoryPending &&
        lease?.isActive() === true &&
        !bridge?.busy() &&
        !modalOpen() &&
        editor.getEditorState() === state &&
        state.status === 'ready' &&
        state.stateVersion === observedStateVersion &&
        displayed ===
          `${state.documentId}:${state.generation}:${state.operationRevision}:${state.viewRevision}` &&
        renderer.historyModelMatches(state) &&
        direct.settled();
      if (!current()) return null;
      const captured = direct.captureSourceTableCellBlock();
      if (!captured || !captured.current() || !current()) return null;
      const live = () => current() && captured.current() && current();
      const target = lease?.captureSourceTableCellMerge?.(captured.witness, live);
      return target ? Object.freeze({ state, target, current: live }) : null;
    },
    captureSourceTableCellSplit() {
      const state = editor.getEditorState();
      let dialog: HTMLDialogElement | undefined;
      let opened = false;
      const modalCurrent = () => {
        if (!dialog) return !modalOpen();
        if (!dialog.isConnected || dialog.ownerDocument !== doc) return false;
        if (!dialog.open) return !opened && !modalOpen();
        opened = true;
        const active = doc.querySelectorAll('dialog:modal');
        return active.length === 1 && active[0] === dialog;
      };
      const current = () =>
        !closed &&
        !nonTextHistoryPending &&
        lease?.isActive() === true &&
        !bridge?.busy() &&
        modalCurrent() &&
        editor.getEditorState() === state &&
        state.status === 'ready' &&
        state.stateVersion === observedStateVersion &&
        displayed ===
          `${state.documentId}:${state.generation}:${state.operationRevision}:${state.viewRevision}` &&
        renderer.historyModelMatches(state) &&
        direct.settled();
      if (!current()) return null;
      const captured = direct.captureSourceTableCellSplit();
      if (!captured || !captured.current() || !current()) return null;
      const live = () => current() && captured.current() && current();
      const issued = lease?.captureSourceTableCellSplit?.(captured.witness, live);
      return issued
        ? Object.freeze({
            state,
            ...issued,
            current: live,
            bindDialog(element: HTMLDialogElement) {
              if (
                dialog ||
                !live() ||
                element.ownerDocument !== doc ||
                !element.isConnected ||
                element.open
              )
                return false;
              dialog = element;
              return live();
            },
          })
        : null;
    },
    captureSourceTableCellWidth() {
      return captureCellWidth().capture;
    },
    getSourceTableCellWidthAvailability() {
      const { capture, reason } = captureCellWidth();
      return { available: capture !== null, reason };
    },
    captureSourceTableCellHeight() {
      return captureCellHeight().capture;
    },
    getSourceTableCellHeightAvailability() {
      const { capture, reason } = captureCellHeight();
      return { available: capture !== null, reason };
    },
    hasCellBlock(): boolean {
      return !closed && lease?.isActive() === true && direct.hasCellBlock();
    },
    focusForPaste(): boolean {
      if (closed || !direct.canPasteInput()) return false;
      return direct.focusInput() && !closed && direct.canPasteInput();
    },
    setScale(value: number): boolean {
      return !closed && renderer.setViewScale(value);
    },
    setDisplayOptions(options: CanvasDisplayOptions): boolean {
      return !closed && renderer.setDisplayOptions(options);
    },
    getDisplayOptions(): Readonly<CanvasDisplayOptions> | undefined {
      return closed ? undefined : renderer.getDisplayOptions();
    },
    /** 표시용 선택 identity만 반환하며 크기 편집 권한을 만들지 않습니다. */
    getContextPicture() {
      const state = editor.getEditorState();
      const key = `${state.documentId}:${state.generation}:${state.operationRevision}:${state.viewRevision}`;
      if (
        closed ||
        nonTextHistoryPending !== undefined ||
        !lease?.isActive() ||
        state.status !== 'ready' ||
        observedStateVersion !== state.stateVersion ||
        key !== displayed ||
        bridge?.busy() ||
        !direct?.settled?.()
      )
        return undefined;
      const picture = renderer.selectedPicture?.();
      if (
        !picture ||
        !viewAllowsRequest({
          kind: 'picture-resize',
          section: picture.section,
          pictureNode: picture.pictureNode,
        })
      )
        return null;
      if (
        ![picture.section, picture.pictureNode].every(
          (value) => Number.isSafeInteger(value) && value >= 0 && value <= 0xffffffff,
        )
      )
        return undefined;
      return Object.freeze({
        ...state.token,
        section: picture.section,
        pictureNode: picture.pictureNode,
      });
    },
    getSelection() {
      return editor.getEditorState().selection ?? null;
    },
    /** Query the current collapsed caret's paragraph marker without changing input state. */
    getHeadingString(): CanvasParagraphHeadingResult {
      const unavailable = (
        reason: Extract<CanvasParagraphHeadingResult, { state: 'unavailable' }>['reason'],
      ) => Object.freeze({ state: 'unavailable' as const, reason });
      if (closed || !lease?.isActive()) return unavailable('surface-detached');
      const state = editor.getEditorState();
      if (state.status !== 'ready') return unavailable('editor-not-ready');
      if (!isOutputInputSettled() || modalOpen()) return unavailable('input-pending');
      const key = `${state.documentId}:${state.generation}:${state.operationRevision}:${state.viewRevision}`;
      if (key !== displayed || state.stateVersion !== observedStateVersion)
        return unavailable('scene-not-current');
      const target = state.selection as SelectionTarget | null | undefined;
      if (!target || target.startUnit !== target.endUnit) return unavailable('no-caret');
      if (
        target.coordinateSpace !== 'display' ||
        target.editorId !== state.editorId ||
        target.documentId !== state.documentId ||
        target.generation !== state.generation ||
        target.operationRevision !== state.operationRevision ||
        target.viewRevision !== state.viewRevision
      )
        return unavailable('caret-not-observed');
      const points = direct.currentFormattingSelection();
      const matches = (point: { section: number; paragraph: number; unit: number }) =>
        point.section === target.section &&
        point.paragraph === target.paragraph &&
        point.unit === target.startUnit;
      if (
        !points ||
        !matches(points.anchor) ||
        !matches(points.focus) ||
        !viewAllowsSelection(target)
      )
        return unavailable('caret-not-observed');
      return renderer.getHeadingString(state, target, points.anchor);
    },
    /** Read from the current physical page scene without committing input or changing selection. */
    getPageText(pageIndex: number, filter?: CanvasPageTextFilter): CanvasPageTextResult {
      if (closed || !lease?.isActive())
        return Object.freeze({ state: 'unavailable', reason: 'surface-detached' });
      const state = editor.getEditorState();
      if (state.status !== 'ready')
        return Object.freeze({ state: 'unavailable', reason: 'editor-not-ready' });
      if (!isOutputInputSettled())
        return Object.freeze({ state: 'unavailable', reason: 'input-pending' });
      const key = `${state.documentId}:${state.generation}:${state.operationRevision}:${state.viewRevision}`;
      if (key !== displayed || state.stateVersion !== observedStateVersion)
        return Object.freeze({ state: 'unavailable', reason: 'scene-not-current' });
      return renderer.getPageText(state, pageIndex, filter);
    },
    getPrintAvailability,
    capturePrintPages(options: CanvasPrintRasterOptions = {}): Promise<CanvasPrintRasterJob> {
      const signal = options.signal
        ? AbortSignal.any([outputLifetime.signal, options.signal])
        : outputLifetime.signal;
      return capturePrintPages(editor, doc, { ...options, signal }, environment, canvas);
    },
    openPrintPreview(options: CanvasPrintPreviewOptions = {}): CanvasPrintPreview {
      const availability = getPrintAvailability();
      if (!availability.available) throw Error(`PrintPreviewUnavailable:${availability.reason}`);
      return openPrintPreview(
        doc,
        (captureOptions) => capturePrintPages(editor, doc, captureOptions, environment, canvas),
        {
          ...options,
          signal: outputLifetime.signal,
          isCurrent(token) {
            const state = editor.getEditorState();
            return (
              !closed &&
              state.status === 'ready' &&
              token.documentId === state.documentId &&
              token.generation === state.generation &&
              token.operationRevision === state.operationRevision &&
              token.viewRevision === state.viewRevision
            );
          },
        },
      );
    },
    async flushComposition() {
      if (closed) return 'blocked' as const;
      const answer = direct.flushComposition();
      if (answer !== 'blocked') await bridge!.flush();
      return answer;
    },
    dispose(): Promise<void> {
      if (!disposal) {
        cleanup();
        disposal = Promise.allSettled([
          bridge!.flush(),
          nonTextHistoryTask,
          ...formattingTasks,
        ]).then((results) => {
          // 기존 Native 처리 오류는 유지하되 새 readonly 작업도 먼저 모두 정리한다.
          for (const result of results.slice(0, 2))
            if (result.status === 'rejected') throw result.reason;
        });
      }
      return disposal;
    },
  };
}
