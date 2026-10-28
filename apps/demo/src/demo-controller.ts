import { createCharacterShapePort } from './character-shape-port.ts';
import { decorateParagraphAlignmentFallback } from './paragraph-shape-fallback-view.ts';
import * as paragraphShapeCore from '@hwpjs/core';
import { createParagraphShapeTool } from './paragraph-shape-tool.ts';
import type { CanvasDisplayOptions } from '@hwpjs/vanilla';
import { createViewOptionsBridge } from './view-options-bridge.ts';
import { isMenuZoomPercent, stepViewZoom } from './view-zoom.ts';
import { mountShortcutSettings } from './shortcut-settings.ts';
import {
  getHistoryAvailability,
  getSelectionFormatting,
  SET_CHARACTER_FONT_NAME_COMMAND,
} from '@hwpjs/core';
import { createEditor, type HeadlessEditor } from '@hwpjs/core';
import { createWorkerRuntimeFactory } from '@hwpjs/core/runtime';
import { createFormattingDialogController } from './formatting-dialog-controller.ts';
import { createFontNameTool } from './font-name-tool.ts';
import { createTextColorTool } from './text-color-tool.ts';
import { createFormattingBridge } from './formatting-bridge.ts';
import { createTextToolsBridge } from './text-tools-bridge.ts';
import { createSymbolDialogController } from './symbol-dialog-controller.ts';
import { createSymbolInsertionPort } from './symbol-insertion-port.ts';
import { createClipboardBridge } from './clipboard-bridge.ts';
import { commandSupportActions } from './command-support.ts';
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
import { createDocumentAdmission } from './document-admission.ts';
import { mountSavePolicy } from './save-policy.ts';
import { askDocumentPassword } from './password-dialog.ts';
import { documentDownloadName } from './download-name.ts';
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

export interface DemoHost {
  /** undefined는 관측 미연결/불확실, null은 현재 그림 선택 없음입니다. */
  getContextPicture?(): ContextPicture | null | undefined;
  canRequestHistory?(kind: 'undo' | 'redo'): boolean;
  requestHistory?(kind: 'undo' | 'redo'): boolean;
  focus?(): boolean;
  canPasteInput?(): boolean;
  focusForPaste?(): boolean;
  setScale(value: number): boolean;
  setDisplayOptions?(options: CanvasDisplayOptions): boolean;
  getDisplayOptions?(): Readonly<CanvasDisplayOptions> | undefined;
  dispose(): void | Promise<void>;
}
export type MountDemoHost = (
  root: HTMLElement,
  editor: HeadlessEditor,
  onStatus: (message: string) => void,
) => DemoHost | Promise<DemoHost>;

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
  const runtimeFactory = createWorkerRuntimeFactory({
    workerURL: '/hwpjs/worker.js',
    wasmURL: '/hwpjs/hwpjs.wasm',
  });
  const editor = createEditor({
    runtimeFactory,
    onError: () => {
      if (!closed) note('문서 작업에 실패했습니다.');
    },
  });
  const formatting = createFormattingBridge({ editor, onStatus: note });
  const textColor = createTextColorTool({
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
    characterPort: createCharacterShapePort(editor),
    port: formatting,
    getState: () => editor.getEditorState(),
    subscribe: (listener) => editor.registerStateListener(listener),
    onStatus: note,
    onClose: () => {
      host?.focus?.();
    },
    onPresentationChange: () => shell.update(),
  });
  const paragraphShape = createParagraphShapeTool({
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
    onStatus: note,
    onReadDenied: () => {
      host?.focus?.();
    },
    clipboard: root.ownerDocument.defaultView?.navigator.clipboard ?? null,
  });
  const viewOptions = createViewOptionsBridge({ getHost: () => host, onStatus: note });
  const presentation = (): DemoShellState => {
    const state = editor.getEditorState(),
      ready = state.status === 'ready';
    const formatState = formatting.getPresentation(),
      history = getHistoryAvailability(state);
    const availability = {
      ...formatState.actions,
      ...textColor.presentation(),
      'font-name': {
        enabled: fontName.presentation().enabled,
        reason: !ready
          ? '문서를 먼저 열어주세요.'
          : !fontName.presentation().enabled
            ? '글꼴 이름을 반영하고 있습니다.'
            : undefined,
      },
      ...textTools.presentation(),
      'insert-symbol': {
        enabled: ready && !!state.selection,
        reason: !ready
          ? '문서를 먼저 열어주세요.'
          : !state.selection
            ? '문서에서 넣을 위치를 선택하세요.'
            : undefined,
      },
      ...formatDialogs.presentation(),
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
      save: { enabled: ready, reason: ready ? undefined : '문서를 먼저 열어주세요.' },
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
      pageLabel: ready ? '문서 열림' : '',
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
  async function runAction(action: DemoAction) {
    if (closed) return;
    const available = presentation().actions?.[action.command];
    if (!available?.enabled) {
      note(available?.reason ?? '현재 사용할 수 없습니다.');
      return;
    }
    if (action.command === 'font-name') {
      fontName.open();
      return;
    }
    if (textColor.action(action.command)) return;
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
        getTarget: () =>
          contextTarget(editor.getEditorState(), host ? host.getContextPicture?.() : null),
        execute: runAction,
        subscribe: (listener) => editor.registerStateListener(() => listener()),
        onError: (error) =>
          note(error instanceof Error ? error.message : '명령을 실행하지 못했습니다.'),
      })
    : undefined;
  const normalizationNotice = mountNormalizationNotice(shell.saveOptionsMount, editor);
  const observedNotice = mountObservedDocInfoNotice(shell.saveOptionsMount, editor);
  const sourcePolicyNotice = mountSourcePolicyNotice(shell.saveOptionsMount, editor);
  const unsubscribe = editor.registerStateListener((state) => {
    if (closed) return;
    traces.push({
      event: 'state',
      detail: `${state.status} · operation ${state.operationRevision} · view ${state.viewRevision}`,
    });
    if (traces.length > 100) traces.shift();
    shell.setTrace(traces);
    shell.update();
  });
  let headless: ReturnType<typeof mountHeadlessPanel> | undefined;
  let shortcuts: ReturnType<typeof mountShortcutSettings> | undefined;
  void refreshFixtures();
  try {
    if (shell.surfaceMount && mountHost) host = await mountHost(shell.surfaceMount, editor, note);
    if (shell.surfaceMount)
      shortcuts = mountShortcutSettings({
        root: shell.saveOptionsMount,
        surface: shell.surfaceMount,
        available: (command) =>
          !closed &&
          !busy &&
          editor.getEditorState().status === 'ready' &&
          ((command === 'paste' && host?.canPasteInput?.() === true) ||
            presentation().actions?.[command]?.enabled === true),
        execute: runAction,
        nativePaste: () => host?.focusForPaste?.() ?? false,
        onStatus: note,
      });
    if (shell.headlessMount) headless = mountHeadlessPanel(shell.headlessMount, editor, note);
    shell.update();
  } catch (error) {
    closed = true;
    cancelFixtureRefresh();
    unsubscribe();
    shortcuts?.dispose();
    contextMenu?.close();
    textTools.dispose();
    symbols.dispose();
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
      cancelFixtureRefresh();
      const drained = admission.dispose();
      unsubscribe();
      headless?.dispose();
      shortcuts?.dispose();
      contextMenu?.close();
      textTools.dispose();
      symbols.dispose();
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
