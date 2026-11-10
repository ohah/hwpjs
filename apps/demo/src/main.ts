import { createDemoSurfaceEnvironment } from './surface-environment.ts';
import { createCanvasSurface } from '@hwpjs/vanilla';
import { createElement, createRef, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { CanvasSurface, type CanvasSurfaceHandle } from '@hwpjs/react';
import { mount, unmount } from 'svelte';
import { CanvasEditor, type CanvasSurface as SvelteSurface } from '@hwpjs/svelte';
import { mountDemo, type MountDemoHost } from './demo-controller.ts';
import { createPageStatusRelay, type DemoPageStatusHost } from './page-status.ts';
import type { DemoFramework } from './shell-contract.ts';
import './shell.css';
import './demo-viewport.css';
import './editor-layout.css';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw Error('DemoRootMissing');
const segment = location.pathname.split('/').filter(Boolean).at(-1);
const framework: DemoFramework =
  segment === 'headless' || segment === 'react' || segment === 'svelte' ? segment : 'vanilla';
const hosts: Record<Exclude<DemoFramework, 'headless'>, MountDemoHost> = {
  vanilla: (root, editor, onStatus) =>
    createCanvasSurface({ root, editor, onStatus, environment: createDemoSurfaceEnvironment() }),
  react: (root, editor, onStatus) => {
    const pages = createPageStatusRelay();
    const tree = createRoot(root),
      ref = createRef<CanvasSurfaceHandle>();
    tree.render(
      createElement(
        StrictMode,
        null,
        createElement(CanvasSurface, {
          editor,
          environment: createDemoSurfaceEnvironment(),
          onStatus,
          onReady: (surface) => pages.connect(surface as DemoPageStatusHost),
          ref,
          style: { height: '100%' },
        }),
      ),
    );
    return {
      getPageStatus: pages.getPageStatus,
      subscribePageStatus: pages.subscribePageStatus,
      focus: () => ref.current?.focus() ?? false,
      canPasteInput: () => ref.current?.surface?.canPasteInput() ?? false,
      canRequestHistory: (kind) => ref.current?.surface?.canRequestHistory(kind) ?? false,
      requestHistory: (kind) => ref.current?.surface?.requestHistory(kind) ?? false,
      setDisplayOptions: (value) => ref.current?.surface?.setDisplayOptions(value) ?? false,
      getDisplayOptions: () => ref.current?.surface?.getDisplayOptions(),
      getContextPicture: () => ref.current?.surface?.getContextPicture(),
      captureSourceTableGridSelection: () =>
        ref.current?.surface?.captureSourceTableGridSelection?.() ?? null,
      captureGeneratedTableGridSelection: () =>
        ref.current?.surface?.captureGeneratedTableGridSelection?.() ?? null,
      captureCaretFormatting: () => ref.current?.surface?.captureCaretFormatting?.() ?? null,
      captureSelectionFormatting: () =>
        ref.current?.surface?.captureSelectionFormatting?.() ?? null,
      captureRangeFormatting: (property) =>
        ref.current?.surface?.captureRangeFormatting?.(property) ?? null,
      canTransferSelection: (cut, clipboard) =>
        ref.current?.surface?.canTransferSelection?.(cut, clipboard) ?? false,
      transferSelection: (options) =>
        ref.current?.surface?.transferSelection?.(options) ?? Promise.resolve(false),
      captureTransferSelection: (options) =>
        ref.current?.surface?.captureTransferSelection?.(options) ?? null,
      focusForPaste: () => ref.current?.surface?.focusForPaste() ?? false,
      setScale: (value) => ref.current?.setScale(value) ?? false,
      dispose: () => {
        pages.dispose();
        tree.unmount();
      },
    };
  },
  svelte: (root, editor, onStatus) => {
    const pages = createPageStatusRelay();
    let surface: SvelteSurface | undefined;
    const component = mount(CanvasEditor, {
      target: root,
      props: {
        editor,
        environment: createDemoSurfaceEnvironment(),
        onStatus,
        style: 'height:100%',
        onReady: (value: SvelteSurface) => {
          surface = value;
          pages.connect(value as DemoPageStatusHost);
        },
      },
    });
    return {
      getPageStatus: pages.getPageStatus,
      subscribePageStatus: pages.subscribePageStatus,
      focus: () => surface?.focus() ?? false,
      canPasteInput: () => surface?.canPasteInput() ?? false,
      canRequestHistory: (kind) => surface?.canRequestHistory(kind) ?? false,
      requestHistory: (kind) => surface?.requestHistory(kind) ?? false,
      setDisplayOptions: (value) => surface?.setDisplayOptions(value) ?? false,
      getDisplayOptions: () => surface?.getDisplayOptions(),
      getContextPicture: () => surface?.getContextPicture(),
      captureSourceTableGridSelection: () => surface?.captureSourceTableGridSelection?.() ?? null,
      captureGeneratedTableGridSelection: () =>
        surface?.captureGeneratedTableGridSelection?.() ?? null,
      captureCaretFormatting: () => surface?.captureCaretFormatting?.() ?? null,
      captureSelectionFormatting: () => surface?.captureSelectionFormatting?.() ?? null,
      captureRangeFormatting: (property) => surface?.captureRangeFormatting?.(property) ?? null,
      canTransferSelection: (cut, clipboard) =>
        surface?.canTransferSelection?.(cut, clipboard) ?? false,
      transferSelection: (options) =>
        surface?.transferSelection?.(options) ?? Promise.resolve(false),
      captureTransferSelection: (options) => surface?.captureTransferSelection?.(options) ?? null,
      focusForPaste: () => surface?.focusForPaste() ?? false,
      setScale: (value) => surface?.setScale(value) ?? false,
      dispose: () => {
        pages.dispose();
        return unmount(component);
      },
    };
  },
};
const demo = await mountDemo(
  root,
  framework,
  framework === 'headless' ? undefined : hosts[framework],
);
window.addEventListener(
  'pagehide',
  () => {
    void demo.dispose();
  },
  { once: true },
);
