import { createDemoSurfaceEnvironment } from './surface-environment.ts';
import { createCanvasSurface } from '@hwpjs/vanilla';
import { createElement, createRef, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { CanvasSurface, type CanvasSurfaceHandle } from '@hwpjs/react';
import { mount, unmount } from 'svelte';
import { CanvasEditor, type CanvasSurface as SvelteSurface } from '@hwpjs/svelte';
import { mountDemo, type MountDemoHost } from './demo-controller.ts';
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
          ref,
          style: { height: '100%' },
        }),
      ),
    );
    return {
      focus: () => ref.current?.focus() ?? false,
      canPasteInput: () => ref.current?.surface?.canPasteInput() ?? false,
      canRequestHistory: (kind) => ref.current?.surface?.canRequestHistory(kind) ?? false,
      requestHistory: (kind) => ref.current?.surface?.requestHistory(kind) ?? false,
      setDisplayOptions: (value) => ref.current?.surface?.setDisplayOptions(value) ?? false,
      getDisplayOptions: () => ref.current?.surface?.getDisplayOptions(),
      getContextPicture: () => ref.current?.surface?.getContextPicture(),
      focusForPaste: () => ref.current?.surface?.focusForPaste() ?? false,
      setScale: (value) => ref.current?.setScale(value) ?? false,
      dispose: () => tree.unmount(),
    };
  },
  svelte: (root, editor, onStatus) => {
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
        },
      },
    });
    return {
      focus: () => surface?.focus() ?? false,
      canPasteInput: () => surface?.canPasteInput() ?? false,
      canRequestHistory: (kind) => surface?.canRequestHistory(kind) ?? false,
      requestHistory: (kind) => surface?.requestHistory(kind) ?? false,
      setDisplayOptions: (value) => surface?.setDisplayOptions(value) ?? false,
      getDisplayOptions: () => surface?.getDisplayOptions(),
      getContextPicture: () => surface?.getContextPicture(),
      focusForPaste: () => surface?.focusForPaste() ?? false,
      setScale: (value) => surface?.setScale(value) ?? false,
      dispose: () => unmount(component),
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
