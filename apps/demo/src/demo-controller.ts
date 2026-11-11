import { createTableCellSplitTool, type TableCellSplitCapture } from './table-cell-split-tool.ts';
import { createTableGridPort, type TableGridHost } from './table-grid-port.ts';
import { createGeneratedTableGridTool } from './generated-table-grid-tool.ts';
import { createPresentationRefresh } from './presentation-refresh.ts';
import { pageStatusLabel, type DemoPageStatusHost } from './page-status.ts';
import { captureFormattingPresentation } from './surface-formatting-capture.ts';
import type { SurfaceFormattingHost } from './surface-formatting-port.ts';
import type { SurfaceClipboardPort } from './clipboard-bridge.ts';
import { createCharacterShapePort } from './character-shape-port.ts';
import { decorateParagraphAlignmentFallback } from './paragraph-shape-fallback-view.ts';
import * as paragraphShapeCore from '@hwpjs/core';
import { createParagraphBulletTool } from './paragraph-bullet-tool.ts';
import { createParagraphShapeTool } from './paragraph-shape-tool.ts';
import type {
  CanvasDisplayOptions,
  CanvasPrintAvailability,
  CanvasPrintPreview,
  CanvasPrintPreviewOptions,
} from '@hwpjs/vanilla';
import { createViewOptionsBridge } from './view-options-bridge.ts';
import { isMenuZoomPercent, stepViewZoom } from './view-zoom.ts';
import { mountShortcutSettings } from './shortcut-settings.ts';
import {
  getHistoryAvailability,
  MERGE_SOURCE_TABLE_CELLS_COMMAND,
  EQUALIZE_SOURCE_TABLE_CELL_WIDTH_COMMAND,
  EQUALIZE_SOURCE_TABLE_CELL_HEIGHT_COMMAND,
  type SourceTableCellHeightTarget,
  type SourceTableCellWidthTarget,
  type SourceTableCellMergeTarget,
  getSelectionFormatting,
  SET_CHARACTER_FONT_NAME_COMMAND,
} from '@hwpjs/core';
import { createEditor, type HeadlessEditor } from '@hwpjs/core';
import { createWorkerRuntimeFactory } from '@hwpjs/core/runtime';
import { demoRuntimeAssets } from './runtime-assets.ts';
import { createFormattingDialogController } from './formatting-dialog-controller.ts';
import { createFontNameTool } from './font-name-tool.ts';
import { createTextColorTool } from './text-color-tool.ts';
import { createFormattingBridge } from './formatting-bridge.ts';
import { createTextToolsBridge } from './text-tools-bridge.ts';
import { createSymbolDialogController } from './symbol-dialog-controller.ts';
import { createSymbolInsertionPort } from './symbol-insertion-port.ts';
import { createTableInsertTool } from './table-insert-tool.ts';
import { createObjectPropertiesTool } from './object-properties-tool.ts';
import { createTableCellPropertiesTool } from './table-cell-properties-tool.ts';
import { createTableCellAppearanceTool } from './table-cell-appearance-tool.ts';
import { createClipboardBridge } from './clipboard-bridge.ts';
import { commandSupportActions, DEMO_COMMANDS, DEMO_COMMAND_REGISTRY } from './command-support.ts';
import { mountDemoContextMenu, contextTarget, type ContextPicture } from './context-menu.ts';
import { createDemoShell } from './shell.ts';
import type {
  DemoAction,
  DemoCommand,
  DemoFramework,
  DemoShellState,
  DemoTraceEntry,
} from './shell-contract.ts';
import { mountHeadlessPanel } from './headless-panel.ts';
import { requireOpenConsent } from './document-open-consent.ts';
import { askNewDocumentFormat, newDocumentName } from './new-document-dialog.ts';
import { focusNewDocumentAfterPaint } from './new-document-focus.ts';
import { confirmDocumentReplacement } from './new-document-replacement.ts';
import { askConsent } from './consent-dialog.ts';
import { DocumentOpenCancelledError } from './document-open-consent.ts';
import { createDocumentAdmission } from './document-admission.ts';
import { mountSavePolicy } from './save-policy.ts';
import { askDocumentPassword } from './password-dialog.ts';
import { documentDownloadName } from './download-name.ts';
import { createDocumentInsertTool } from './document-insert-tool.ts';
import { askObservedDocInfoConsent } from './observed-docinfo-dialog.ts';
import { mountObservedDocInfoNotice } from './observed-docinfo-notice.ts';
import { createDocumentLoader } from './document-loader.ts';
import { askDistributionConsent, askAvailableSectionsConsent } from './source-policy-dialog.ts';
import { askNormalizationConsent } from './normalization-dialog.ts';
import { mountSourcePolicyNotice } from './source-policy-notice.ts';
import { mountNormalizationNotice } from './normalization-notice.ts';
import { getInitialAvailableFixtures, fetchAvailableFixtures } from './available-fixtures.ts';
// @ts-ignore Canonical fixture catalog is shared with the server.
import { fixtureUrl } from '../../../web/preview/fixture-catalog.mjs';

export interface DemoHost
  extends SurfaceFormattingHost, SurfaceClipboardPort, DemoPageStatusHost, TableGridHost {
  /** undefined는 관측 미연결/불확실, null은 현재 그림 선택 없음입니다. */
  getContextPicture?(): ContextPicture | null | undefined;
  canRequestHistory?(kind: 'undo' | 'redo'): boolean;
  canEditCellProperties?(section: number, listNode: number): boolean;
  requestHistory?(kind: 'undo' | 'redo'): boolean;
  focus?(): boolean;
  canPasteInput?(): boolean;
  focusForPaste?(): boolean;
  canRequestBlockSelection?(): boolean;
  requestBlockSelection?(): boolean;
  canRequestCellBlock?(requireFocus?: boolean): boolean;
  requestCellBlock?(extend?: boolean, fromContext?: boolean): boolean;
  hasCellBlock?(): boolean;
  registerCellBlockMenu?(menu: HTMLElement, ownsInput?: (input: HTMLElement) => boolean): void;
  captureSourceTableCellSplit?(): TableCellSplitCapture | null;
  captureSourceTableCellMerge?(): {
    state: ReturnType<HeadlessEditor['getEditorState']>;
    target: SourceTableCellMergeTarget;
    current(): boolean;
  } | null;
  captureSourceTableCellWidth?(): {
    state: ReturnType<HeadlessEditor['getEditorState']>;
    target: SourceTableCellWidthTarget;
    current(): boolean;
  } | null;
  captureSourceTableCellHeight?(): {
    state: ReturnType<HeadlessEditor['getEditorState']>;
    target: SourceTableCellHeightTarget;
    current(): boolean;
  } | null;
  getSourceTableCellHeightAvailability?(): { available: boolean; reason: string | null };
  getSourceTableCellWidthAvailability?(): { available: boolean; reason?: string };
  setScale(value: number): boolean;
  setDisplayOptions?(options: CanvasDisplayOptions): boolean;
  getDisplayOptions?(): Readonly<CanvasDisplayOptions> | undefined;
  getPrintAvailability?(): CanvasPrintAvailability;
  openPrintPreview?(options?: CanvasPrintPreviewOptions): CanvasPrintPreview;
  dispose(): void | Promise<void>;
}
export type MountDemoHost = (
  root: HTMLElement,
  editor: HeadlessEditor,
  onStatus: (message: string) => void,
) => DemoHost | Promise<DemoHost>;

const printReasons = {
  detached: '문서 화면을 준비하는 중입니다.',
  unsupported: '이 환경에서는 인쇄 미리보기를 사용할 수 없습니다.',
  'not-ready': '문서를 먼저 열어주세요.',
  busy: '입력이나 편집 작업이 끝난 뒤 인쇄 미리보기를 열어주세요.',
};

/** 공개 상태의 검증된 선택만 표시하며 별도 선택 캐시를 만들지 않습니다. */
export function selectionStatusLabel(state: ReturnType<HeadlessEditor['getEditorState']>): string {
  const selected = getSelectionFormatting(state).target;
  return selected
    ? selected.startUnit === selected.endUnit
      ? '커서 위치'
      : '텍스트 선택'
    : '선택 없음';
}

/** The app owns transport, file admission and downloads; framework hosts own the surface. */
export async function mountDemo(
  root: HTMLElement,
  framework: DemoFramework,
  mountHost?: MountDemoHost,
  options: { fetch?: typeof globalThis.fetch } = {},
) {
  let closed = false,
    busy = false,
    filename = '',
    status = '문서를 열어주세요.',
    zoom = 100;
  const fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  let fixtures = getInitialAvailableFixtures();
  let fixtureGeneration = 0,
    fixtureAbort: AbortController | undefined;
  const cancelFixtureRefresh = () => {
    fixtureGeneration++;
    fixtureAbort?.abort();
    fixtureAbort = undefined;
  };
  let host: DemoHost | undefined;
  const traces: DemoTraceEntry[] = [];
  const workerFactory = createWorkerRuntimeFactory(
    import.meta.env?.DEV
      ? { workerURL: '/hwpjs/worker.js', wasmURL: '/hwpjs/hwpjs.wasm' }
      : demoRuntimeAssets(import.meta.url),
  );
  const runtimeFactory = workerFactory;
  const editor = createEditor({
    runtimeFactory,
    onError: () => {
      if (!closed) note('문서 작업에 실패했습니다.');
    },
  });
  const formatting = createFormattingBridge({
    editor,
    onFocus: () => {
      if (!closed) host?.focus?.();
    },
    onStatus: note,
    getSurfaceFormattingHost: () => host,
  });
  const characterShapePort = createCharacterShapePort(editor);
  const textColor = createTextColorTool({
    getSurfaceFormattingHost: () => host,
    root,
    editor,
    onStatus: note,
    onClose: () => {
      host?.focus?.();
    },
    onPresentationChange: () => shell.update(),
    onUIError: () => note('글자색 표시를 갱신하지 못했습니다.'),
  });
  const fontName = createFontNameTool({
    atomicCharacterPort: characterShapePort,
    getSurfaceFormattingHost: () => host,
    root,
    editor,
    api: { command: SET_CHARACTER_FONT_NAME_COMMAND, observe: getSelectionFormatting },
    onStatus: note,
    onClose: () => {
      host?.focus?.();
    },
    onPresentationChange: () => shell.update(),
    onUIError: () => note('글꼴 창 표시를 갱신하지 못했습니다.'),
  });
  const formatDialogs = createFormattingDialogController({
    decorateParagraphView: decorateParagraphAlignmentFallback,
    root,
    characterPort: characterShapePort,
    port: formatting,
    getState: () => editor.getEditorState(),
    subscribe: (listener) => editor.registerStateListener(listener),
    onStatus: note,
    onClose: () => {
      host?.focus?.();
    },
    onPresentationChange: () => shell.update(),
  });
  const paragraphBullet = createParagraphBulletTool({
    root,
    editor,
    core: paragraphShapeCore,
    getHost: () => host,
    onClose: () => host?.focus?.(),
    onStatus: note,
    onPresentationChange: () => shell.update(),
  });
  const paragraphShape = createParagraphShapeTool({
    onBullet: () => requestAnimationFrame(() => paragraphBullet.open()),
    root,
    editor,
    core: paragraphShapeCore,
    fallback: () => {
      formatDialogs.action({ command: 'paragraph-properties' });
    },
    onClose: () => {
      host?.focus?.();
    },
    onPresentationChange: () => shell.update(),
    onUIError: () => note('문단 모양 창을 갱신하지 못했습니다.'),
  });
  const textTools = createTextToolsBridge({
    editor,
    root,
    onStatus: note,
    onClose: () => {
      host?.focus?.();
    },
    onPresentationChange: () => shell.update(),
    resolveShortcut: (event) => shortcuts?.resolveCommand(event),
  });
  const generatedTableGrid = createGeneratedTableGridTool({
    root,
    port: createTableGridPort(editor, paragraphShapeCore, () => host),
    onStatus: note,
    onPresentationChange: () => shell.update(),
  });
  const cellCore = {
    ...paragraphShapeCore,
    canEditCellProperties: (section: number, listNode: number) =>
      host?.canEditCellProperties?.(section, listNode) === true,
  };
  const tableCellProperties = createTableCellPropertiesTool({
    root,
    editor,
    core: cellCore,
    onStatus: note,
    onClose: () => {
      host?.focus?.();
    },
    onPresentationChange: () => shell.update(),
  });
  const tableCellAppearance = createTableCellAppearanceTool({
    root,
    editor,
    core: cellCore,
    onStatus: note,
    onClose: () => {
      host?.focus?.();
    },
    onPresentationChange: () => shell.update(),
  });
  const tableInsert = createTableInsertTool({
    root,
    editor,
    core: paragraphShapeCore,
    onStatus: note,
    onPresentationChange: () => shell.update(),
    onClose: () => {
      host?.focus?.();
    },
  });
  const objectProperties = createObjectPropertiesTool({
    root,
    editor,
    host: () => host,
    onStatus: note,
    onClose: () => {
      host?.focus?.();
    },
    onPresentationChange: () => shell.update(),
  });
  const symbolPort = createSymbolInsertionPort(editor);
  const symbols = createSymbolDialogController({
    root,
    port: symbolPort,
    onStatus: note,
    onClose: () => {
      host?.focus?.();
    },
  });
  const clipboard = createClipboardBridge({
    editor,
    getSurface: () => host,
    onPresentationChange: () => shell.update(),
    onStatus: note,
    onReadDenied: () => {
      host?.focus?.();
    },
    clipboard: root.ownerDocument.defaultView?.navigator.clipboard ?? null,
  });
  const viewOptions = createViewOptionsBridge({ getHost: () => host, onStatus: note });
  const documentInsert = createDocumentInsertTool({
    root,
    editor,
    onStatus: note,
    onPresentationChange: () => shell.update(),
  });
  const cellSplit = createTableCellSplitTool(root, editor, () => host, note);
  const presentation = (): DemoShellState => {
    const widthAvailability = host?.getSourceTableCellWidthAvailability?.();
    const sharedFormatting = captureFormattingPresentation(editor, () => host);
    const state = sharedFormatting.state,
      ready = state.status === 'ready';
    const formatState = formatting.getPresentation(sharedFormatting),
      history = getHistoryAvailability(state),
      fontAvailability = fontName.presentation(sharedFormatting);
    const print = host?.openPrintPreview && host.getPrintAvailability?.();
    const cellBlock = {
      enabled: host?.canRequestCellBlock?.() === true,
      reason: '표에서 선택할 수 있는 셀에 커서를 놓으세요.',
    };
    const height = host?.getSourceTableCellHeightAvailability?.();
    const heightReasons: Record<string, string> = {
      UnsupportedHwp5CellHeightMetadata:
        '원본 HWP5 셀의 metadata 또는 부호 있는 크기를 안전하게 해석할 수 없습니다.',
      SourceTableCellHeightContentOverflow: '균등 높이가 셀 내용과 상하 여백보다 작습니다.',
      SourceTableCellHeightLayoutOverflow:
        '균등 높이를 적용하면 현재 조판의 셀 높이와 일치하지 않습니다.',
      SourceTableCellHeightLayoutUnavailable: '현재 조판에서 셀 높이 전체를 확인할 수 없습니다.',
      UnsupportedSourceTableCellHeightSpans: '병합 셀이 있는 표의 높이 균등화는 지원하지 않습니다.',
      ConflictingSourceTableRowHeights: '같은 행의 원본 셀 높이가 서로 다릅니다.',
      InvalidSourceTableCellHeightRectangle:
        '표의 모든 열을 포함하는 두 행 이상의 셀 블록을 선택하세요.',
    };
    const availability = {
      ...formatState.actions,
      ...textColor.presentation(sharedFormatting),
      'font-name': {
        enabled: fontAvailability.enabled,
        surfaceSelection: fontAvailability.surfaceSelection,
        reason: !ready
          ? '문서를 먼저 열어주세요.'
          : !fontAvailability.enabled
            ? (fontAvailability.reason ?? '글꼴 이름을 반영하고 있습니다.')
            : undefined,
      },
      ...textTools.presentation(),
      'insert-table': tableInsert.presentation(),
      ...(host?.requestCellBlock
        ? { 'table-cell-block': cellBlock, 'table-cell-block-extend': cellBlock }
        : {}),
      'table-cell-split': {
        enabled: host?.captureSourceTableCellSplit?.() != null,
        reason: '편집 가능한 HWPX 원본 표의 셀이나 직사각형 셀 블록을 선택하세요.',
      },
      'table-cell-height-equal': {
        enabled: height?.available === true,
        reason:
          heightReasons[height?.reason ?? ''] ??
          '원본 HWP5/HWPX 표에서 모든 열을 포함하는 두 행 이상을 선택하세요.',
      },
      'table-cell-width-equal': {
        enabled: widthAvailability?.available ?? host?.captureSourceTableCellWidth?.() != null,
        reason:
          (
            {
              UnsupportedHwp5CellWidthMetadata:
                '원본 HWP5 셀의 metadata 또는 부호 있는 크기를 안전하게 해석할 수 없습니다.',
              UnsupportedSourceTableCellWidthGeometry:
                '병합 셀이나 지원하지 않는 원본 크기가 있는 표입니다.',
              UnsupportedSourceTableCellWidthInsets:
                '셀 안여백을 확인할 수 없거나 균등 너비가 안여백보다 작습니다.',
              NonRectangularSourceTableCellWidthGeometry:
                '선택 행의 실제 셀 경계가 같은 직사각형이 아닙니다.',
              SourceTableCellWidthInputPending: '입력이나 문서 처리가 끝난 뒤 다시 선택하세요.',
            } as Record<string, string>
          )[widthAvailability?.reason ?? ''] ??
          '원본 HWP5/HWPX 표에서 물리 경계가 같은 직사각형의 두 칸 이상을 선택하세요.',
      },
      'table-cell-merge': {
        enabled: host?.captureSourceTableCellMerge?.() != null,
        reason: '편집 가능한 HWPX 표에서 연속된 셀을 두 개 이상 선택하세요.',
      },
      'object-properties': objectProperties.presentation(),
      ...generatedTableGrid.presentation(),
      'table-cell-properties': tableCellProperties.presentation(),
      'table-cell-background': tableCellAppearance.presentation(),
      'table-cell-border': tableCellAppearance.presentation(),
      'table-cell-appearance': tableCellAppearance.presentation(),
      'insert-symbol': {
        enabled: ready && !!state.selection,
        reason: !ready
          ? '문서를 먼저 열어주세요.'
          : !state.selection
            ? '문서에서 넣을 위치를 선택하세요.'
            : undefined,
      },
      ...formatDialogs.presentation(),
      'paragraph-bullets': paragraphBullet.presentation(),
      ...(paragraphShape.available
        ? {
            'paragraph-properties': {
              enabled: ready && paragraphShape.presentation().enabled,
              reason: paragraphShape.presentation().reason ?? undefined,
            },
          }
        : {}),
      ...viewOptions.presentation(ready),
      ...clipboard.getPresentation().actions,
      'new-document': { enabled: !busy },
      ...(host?.requestBlockSelection
        ? {
            'block-selection': {
              enabled: host.canRequestBlockSelection?.() === true,
              reason: '문서의 현재 입력 위치에서 블록을 설정할 수 없습니다.',
            },
          }
        : {}),
      'insert-document': documentInsert.presentation(state, sharedFormatting.formatting.target),
      save: { enabled: ready, reason: ready ? undefined : '문서를 먼저 열어주세요.' },
      ...(print
        ? {
            'print-preview': print.available
              ? { enabled: true }
              : { enabled: false, reason: printReasons[print.reason] },
          }
        : {}),
      undo: {
        enabled: host?.canRequestHistory?.('undo') ?? history.canUndo,
        reason: !ready
          ? '문서를 먼저 열어주세요.'
          : history.available
            ? '현재 상태에서는 실행 취소 명령을 접수할 수 없습니다.'
            : '편집 이력 상태를 확인할 수 없습니다.',
      },
      redo: {
        enabled: host?.canRequestHistory?.('redo') ?? history.canRedo,
        reason: !ready
          ? '문서를 먼저 열어주세요.'
          : history.available
            ? '현재 상태에서는 다시 실행 명령을 접수할 수 없습니다.'
            : '편집 이력 상태를 확인할 수 없습니다.',
      },
      'set-zoom': { enabled: !!host },
      'zoom-in': {
        enabled: !!host && stepViewZoom(zoom, 'in') !== null,
        reason: !host ? 'Canvas 표시 기능이 연결되지 않았습니다.' : '최대 배율입니다.',
      },
      'zoom-out': {
        enabled: !!host && stepViewZoom(zoom, 'out') !== null,
        reason: !host ? 'Canvas 표시 기능이 연결되지 않았습니다.' : '최소 배율입니다.',
      },
    };
    // Cell blocks carry display cells only. Keep edit commands scoped to ordinary caret selections.
    if (host?.hasCellBlock?.())
      for (const command of DEMO_COMMANDS) {
        if (DEMO_COMMAND_REGISTRY[command].selection && command in availability)
          Object.assign(availability, {
            [command]: { enabled: false, reason: '셀 블록을 해제한 뒤 실행하세요.' },
          });
      }
    const actions = commandSupportActions({
      connectedCommands: new Set(Object.keys(availability) as DemoCommand[]),
      availability,
      document:
        state.status === 'ready' ? 'ready' : state.status === 'loading' ? 'loading' : 'none',
      hasSelection: state.selection != null,
      busy,
      disposed: closed,
    });
    return {
      ...formatState,
      title: filename || '새 문서',
      documentLabel: filename || undefined,
      status,
      busy,
      openFile: { enabled: !busy },
      openFixture: { enabled: !busy },
      zoomPercent: zoom,
      pageLabel: pageStatusLabel(ready && !closed, busy, host),
      selectionLabel: selectionStatusLabel(state),
      actions,
    };
  };
  function note(message: string) {
    if (closed) return;
    status = message;
    shell.update();
  }
  const open = createDocumentLoader({
    editor,
    askPassword: (signal, message) => askDocumentPassword(root, signal, message),
    askNormalization: (signal) => askNormalizationConsent(root, signal),
    askObservedDocInfo: (signal) => askObservedDocInfoConsent(root, signal),
    askDistribution: (signal) =>
      requireOpenConsent(signal, () => askDistributionConsent(root, signal)),
    askAvailableSections: (signal) =>
      requireOpenConsent(signal, () => askAvailableSectionsConsent(root, signal)),
  });
  const admission = createDocumentAdmission({
    cancelLoad: () => editor.cancelLoad(),
    confirmReplace: (signal) =>
      confirmDocumentReplacement(editor, signal, () =>
        askConsent(root, signal, {
          role: 'replace-unsaved-document',
          label: '저장하지 않은 변경 사항',
          message: '저장하지 않은 변경 사항이 있습니다. 문서를 교체하면 이 변경 사항은 사라집니다.',
          accept: '저장하지 않고 계속',
          acceptRole: 'accept-unsaved-replacement',
          cancelRole: 'cancel-unsaved-replacement',
        }),
      ),
    load: open,
    loading: (name) => {
      busy = true;
      note(`${name} 읽는 중…`);
    },
    loaded: (name) => {
      filename = name;
      note('문서를 열었습니다.');
    },
    settled: () => {
      busy = false;
      if (!closed) shell.update();
    },
  });
  async function openFixture(id: string) {
    if (closed) throw Error('DemoDisposed');
    const entry = fixtures.find((item) => item.id === id);
    if (!entry) throw Error('UnknownDemoFixture');
    if (!entry.available) throw Error('FixtureUnavailable');
    if (busy) throw Error('DemoBusy');
    await admission.open(entry.name, async (signal) => {
      const response = await fetcher(fixtureUrl(id), { signal });
      if (!response.ok) throw Error(`FixtureFetchFailed:${response.status}`);
      return new Uint8Array(await response.arrayBuffer());
    });
  }
  async function runAction(
    action: DemoAction,
    fromContext = false,
    mergeTarget?: SourceTableCellMergeTarget,
    splitCapture?: TableCellSplitCapture,
    widthTarget?: SourceTableCellWidthTarget,
    heightTarget?: SourceTableCellHeightTarget,
  ) {
    if (closed) return;
    const available = presentation().actions?.[action.command];
    if (!available?.enabled) {
      note(available?.reason ?? '현재 사용할 수 없습니다.');
      return;
    }
    if (action.command === 'print-preview') {
      if (!host?.openPrintPreview) throw Error('PrintSurfaceDetached');
      const name = filename.replace(/\.(?:hwp|hwpx)$/i, '') || '문서';
      await host.openPrintPreview({ filename: name + '.pdf' }).ready;
      return;
    }
    if (action.command === 'insert-document') {
      documentInsert.open();
      return;
    }
    if (action.command === 'table-cell-block' || action.command === 'table-cell-block-extend') {
      if (
        host?.requestCellBlock?.(action.command === 'table-cell-block-extend', fromContext) !== true
      )
        note('표에서 선택할 수 있는 셀에 커서를 놓으세요.');
      return;
    }
    if (action.command === 'table-cell-split') {
      cellSplit.open(fromContext ? splitCapture : undefined);
      return;
    }
    if (action.command === 'table-cell-width-equal') {
      const target = fromContext ? widthTarget : host?.captureSourceTableCellWidth?.()?.target;
      if (!target) {
        note('현재 셀 블록을 다시 선택하세요.');
        return;
      }
      const result = await editor.dispatchCommand(EQUALIZE_SOURCE_TABLE_CELL_WIDTH_COMMAND, target);
      if (result.status === 'committed-with-snapshot') note('선택한 셀의 너비를 같게 했습니다.');
      else if (result.status === 'known-no-op') note('선택한 셀의 너비가 이미 같습니다.');
      else if (result.status === 'committed-refresh-required')
        note('셀 너비 변경이 반영됐습니다. 화면을 복구한 뒤 계속하세요.');
      else note(result.error || '셀 너비를 변경하지 못했습니다.');
      return;
    }
    if (action.command === 'table-cell-height-equal') {
      const target = fromContext ? heightTarget : host?.captureSourceTableCellHeight?.()?.target;
      if (!target) {
        note('현재 셀 블록을 다시 선택하세요.');
        return;
      }
      const result = await editor.dispatchCommand(
        EQUALIZE_SOURCE_TABLE_CELL_HEIGHT_COMMAND,
        target,
      );
      if (result.status === 'committed-with-snapshot') note('선택한 셀의 높이를 같게 했습니다.');
      else if (result.status === 'known-no-op') note('선택한 셀의 높이가 이미 같습니다.');
      else if (result.status === 'committed-refresh-required')
        note('셀 높이 변경이 반영됐습니다. 화면을 복구한 뒤 계속하세요.');
      else note(result.error || '셀 높이를 변경하지 못했습니다.');
      return;
    }
    if (action.command === 'table-cell-merge') {
      const target = fromContext ? mergeTarget : host?.captureSourceTableCellMerge?.()?.target;
      if (!target) {
        note('현재 셀 블록을 다시 선택하세요.');
        return;
      }
      const result = await editor.dispatchCommand(MERGE_SOURCE_TABLE_CELLS_COMMAND, target);
      if (result.status === 'committed-with-snapshot') note('셀을 합쳤습니다.');
      else if (result.status === 'committed-refresh-required')
        note('셀 합치기가 반영됐습니다. 화면을 복구한 뒤 계속하세요.');
      else note(result.error || '셀을 합치지 못했습니다.');
      return;
    }
    if (action.command === 'block-selection') {
      if (host?.requestBlockSelection?.() !== true)
        note('문서의 현재 입력 위치에서 블록을 설정할 수 없습니다.');
      return;
    }
    if (action.command === 'new-document') {
      await admission.replace('새 문서', async (signal) => {
        const format = await askNewDocumentFormat(root, signal);
        if (signal.aborted) return;
        if (!format) throw new DocumentOpenCancelledError();
        const state = await editor.createDocument({ format });
        if (signal.aborted) return;
        const view = root.ownerDocument.defaultView;
        // The constructor publishes its verified initial caret with the document.
        if (view && host?.focus && state.selection)
          focusNewDocumentAfterPaint({
            signal,
            current: () => !closed && editor.getEditorState().documentId === state.documentId,
            focus: () => host?.focus?.() === true,
            requestFrame: (callback) => view.requestAnimationFrame(callback),
            cancelFrame: (handle) => view.cancelAnimationFrame(handle),
          });
        return newDocumentName(format);
      });
      return;
    }
    if (generatedTableGrid.handles(action.command)) {
      await generatedTableGrid.execute(action.command);
      return;
    }
    if (action.command === 'table-cell-appearance') {
      tableCellAppearance.open();
      return;
    }
    if (action.command === 'table-cell-properties') {
      tableCellProperties.open();
      return;
    }
    if (action.command === 'table-cell-background') {
      tableCellAppearance.open();
      return;
    }
    if (action.command === 'table-cell-border') {
      tableCellAppearance.open();
      return;
    }
    if (action.command === 'insert-table') {
      tableInsert.open();
      return;
    }
    if (action.command === 'object-properties') {
      objectProperties.open();
      return;
    }
    if (action.command === 'font-name') {
      fontName.open(action.language);
      return;
    }
    if (textColor.action(action.command)) return;
    if (action.command === 'paragraph-bullets') {
      paragraphBullet.open();
      return;
    }
    if (paragraphShape.action(action.command)) return;
    if (formatDialogs.action(action)) return;
    if (viewOptions.action(action)) {
      shell.update();
      return;
    }
    if (
      action.command === 'set-zoom' ||
      action.command === 'zoom-in' ||
      action.command === 'zoom-out'
    ) {
      const percent =
        action.command === 'set-zoom'
          ? action.percent
          : stepViewZoom(zoom, action.command === 'zoom-in' ? 'in' : 'out');
      if (!isMenuZoomPercent(percent)) {
        note('지원되는 표시 배율을 선택해주세요.');
        return;
      }
      if (host?.setScale(percent / 100)) {
        zoom = percent;
        shell.update();
        host.focus?.();
      } else note('표시 배율을 적용하지 못했습니다.');
      return;
    }
    if (action.command === 'undo' || action.command === 'redo') {
      if (host?.requestHistory) {
        if (!host.requestHistory(action.command))
          note('실행 취소/다시 실행 명령을 접수하지 못했습니다. 문서 상태를 확인하세요.');
        return;
      }
      const result = await editor[action.command]();
      if (result.error) throw Error(result.error);
      return;
    }
    if (await formatting.action(action)) {
      shell.update();
      return;
    }
    if (action.command === 'insert-symbol') {
      symbols.open();
      return;
    }
    if (await textTools.action(action)) {
      shell.update();
      return;
    }
    if (await clipboard.action(action)) {
      shell.update();
      return;
    }
    if (action.command !== 'save') throw Error('UnsupportedDemoAction');
    const result = await editor.save(savePolicy.options());
    const bytes = new Uint8Array(result.bytes.length);
    bytes.set(result.bytes);
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
    const link = root.ownerDocument.createElement('a');
    link.href = url;
    link.download = documentDownloadName(filename, result.format);
    root.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    note('파일을 저장했습니다.');
  }
  const shell = createDemoShell(root, {
    framework,
    routes: {
      headless: '/demo/headless',
      vanilla: '/demo/vanilla',
      react: '/demo/react',
      svelte: '/demo/svelte',
    },
    fixtures,
    getState: presentation,
    onOpenFile: (file) =>
      admission.open(file.name, async () => new Uint8Array(await file.arrayBuffer())),
    onOpenFixture: openFixture,
    onAction: runAction,
    onError: (error) => note(error instanceof Error ? error.message : '작업에 실패했습니다.'),
  });
  async function refreshFixtures() {
    if (closed) return;
    fixtureAbort?.abort();
    const generation = ++fixtureGeneration,
      controller = (fixtureAbort = new AbortController());
    try {
      const next = await fetchAvailableFixtures(fetcher, controller.signal);
      if (closed || generation !== fixtureGeneration || controller.signal.aborted) return;
      fixtures = next;
      shell.setFixtures(next);
    } catch {
      // Keep initial/last successful list. Catalog errors never replace document
      // status or imply Native support; a later refresh can retry.
    } finally {
      if (generation === fixtureGeneration) fixtureAbort = undefined;
    }
  }
  const savePolicy = mountSavePolicy(shell.saveOptionsMount, editor);
  const contextMenu = shell.surfaceMount
    ? mountDemoContextMenu({
        root: shell.surfaceMount,
        getState: presentation,
        captureTextSelection: () => captureFormattingPresentation(editor, () => host).capture,
        getTarget: () => {
          const split = host?.captureSourceTableCellSplit?.();
          const merge = host?.captureSourceTableCellMerge?.();
          const width = host?.captureSourceTableCellWidth?.();
          const height = host?.captureSourceTableCellHeight?.();
          if (merge || split || width || height)
            return {
              kind: 'source-table-cell',
              key: JSON.stringify([
                editor.getEditorState().token,
                editor.getEditorState().stateVersion,
                'cell-block',
              ]),
              current: () =>
                (!merge || merge.current()) &&
                (!split || split.current()) &&
                (!width || width.current()) &&
                (!height || height.current()),
              mergeTarget: merge?.target,
              splitCapture: split ?? undefined,
              widthTarget: width?.target,
              heightTarget: height?.target,
            };
          return (
            generatedTableGrid.contextTarget() ??
            contextTarget(editor.getEditorState(), host ? host.getContextPicture?.() : null)
          );
        },
        execute: (action, target) =>
          runAction(
            action,
            true,
            target.mergeTarget,
            target.splitCapture,
            target.widthTarget,
            target.heightTarget,
          ),
        subscribe: (listener) => editor.registerStateListener(() => listener()),
        onError: (error) =>
          note(error instanceof Error ? error.message : '명령을 실행하지 못했습니다.'),
      })
    : undefined;
  const normalizationNotice = mountNormalizationNotice(shell.saveOptionsMount, editor);
  const observedNotice = mountObservedDocInfoNotice(shell.saveOptionsMount, editor);
  const sourcePolicyNotice = mountSourcePolicyNotice(shell.saveOptionsMount, editor);
  const presentationRefresh = createPresentationRefresh(() => {
    if (!closed) shell.update();
  });
  let unsubscribe = () => {};
  let unsubscribePages = () => {};
  let headless: ReturnType<typeof mountHeadlessPanel> | undefined;
  let shortcuts: ReturnType<typeof mountShortcutSettings> | undefined;
  void refreshFixtures();
  try {
    if (shell.surfaceMount && mountHost) host = await mountHost(shell.surfaceMount, editor, note);
    if (shell.tableMenu) host?.registerCellBlockMenu?.(shell.tableMenu);
    contextMenu?.registerCellBlockMenu((menu, ownsInput) =>
      host?.registerCellBlockMenu?.(menu, ownsInput),
    );
    unsubscribePages =
      host?.subscribePageStatus?.(() => {
        presentationRefresh.request();
      }) ?? (() => {});
    // Async hosts may register Surface observers later. Refresh presentation only
    // after all synchronous state observers have seen the current state.
    unsubscribe = editor.registerStateListener((state) => {
      if (closed) return;
      traces.push({
        event: 'state',
        detail: `${state.status} · operation ${state.operationRevision} · view ${state.viewRevision}`,
      });
      if (traces.length > 100) traces.shift();
      shell.setTrace(traces);
      return presentationRefresh.request();
    });
    if (shell.surfaceMount)
      shortcuts = mountShortcutSettings({
        root: shell.saveOptionsMount,
        surface: shell.surfaceMount,
        tableRowContext: () => {
          if (closed || busy || host?.hasCellBlock?.()) return 'blocked';
          const table = generatedTableGrid.contextTarget();
          if (table?.current?.() === true) return 'table';
          const state = editor.getEditorState(),
            selected = state.selection;
          // Body fallthrough grants no edit authority; Canvas keeps its own page-break gate.
          return state.status === 'ready' &&
            typeof selected === 'object' &&
            selected !== null &&
            'owner' in selected &&
            'section' in selected &&
            typeof selected.section === 'number' &&
            Number.isSafeInteger(selected.section) &&
            selected.section >= 0 &&
            selected.owner === `section:${selected.section}:body` &&
            host?.getContextPicture?.() === null
            ? 'body'
            : 'blocked';
        },
        available: (command) =>
          !closed &&
          !busy &&
          (command === 'new-document' || editor.getEditorState().status === 'ready') &&
          (command === 'table-cell-block' || command === 'table-cell-block-extend'
            ? host?.canRequestCellBlock?.(true) === true
            : (command === 'paste' && host?.canPasteInput?.() === true) ||
              presentation().actions?.[command]?.enabled === true),
        execute: runAction,
        nativePaste: () => host?.focusForPaste?.() ?? false,
        onStatus: note,
      });
    if (shell.headlessMount) headless = mountHeadlessPanel(shell.headlessMount, editor, note);
    shell.update();
  } catch (error) {
    closed = true;
    cellSplit.dispose();
    documentInsert.dispose();
    cancelFixtureRefresh();
    presentationRefresh.dispose();
    unsubscribePages();
    unsubscribe();
    shortcuts?.dispose();
    contextMenu?.close();
    textTools.dispose();
    symbols.dispose();
    generatedTableGrid.dispose();
    tableCellProperties.dispose();
    tableCellAppearance.dispose();
    tableInsert.dispose();
    objectProperties.dispose();
    paragraphBullet.dispose();
    paragraphShape.dispose();
    formatDialogs.dispose();
    textColor.dispose();
    fontName.dispose();
    viewOptions.dispose();
    clipboard.dispose();
    sourcePolicyNotice.dispose();
    observedNotice.dispose();
    normalizationNotice.dispose();
    savePolicy.dispose();
    shell.destroy();
    await editor.dispose();
    throw error;
  }
  // Prepare code after mounting; no document/session/worker exists until open.
  // Failed preparation is evicted by the factory and the real open can retry.
  void runtimeFactory.preload().catch(() => {});
  return {
    editor,
    openFixture,
    refreshFixtures,
    shortcuts,
    async dispose() {
      if (closed) return;
      closed = true;
      cellSplit.dispose();
      documentInsert.dispose();
      formatting.dispose();
      cancelFixtureRefresh();
      const drained = admission.dispose();
      presentationRefresh.dispose();
      unsubscribePages();
      unsubscribe();
      headless?.dispose();
      shortcuts?.dispose();
      contextMenu?.close();
      textTools.dispose();
      symbols.dispose();
      generatedTableGrid.dispose();
      tableCellProperties.dispose();
      tableCellAppearance.dispose();
      tableInsert.dispose();
      objectProperties.dispose();
      paragraphBullet.dispose();
      paragraphShape.dispose();
      formatDialogs.dispose();
      textColor.dispose();
      fontName.dispose();
      viewOptions.dispose();
      clipboard.dispose();
      sourcePolicyNotice.dispose();
      observedNotice.dispose();
      normalizationNotice.dispose();
      savePolicy.dispose();
      try {
        await host?.dispose();
        await drained;
      } finally {
        try {
          await editor.dispose();
        } finally {
          shell.destroy();
        }
      }
    },
  };
}
