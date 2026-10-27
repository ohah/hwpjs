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
// 이 호스트는 mount 뒤 Canvas 측정 함수를 교체하지 않습니다.
// 향후 내부 측정 의미를 변경하는 기능은 새 epoch를 공급한 뒤 재투영해야 합니다.
const measurementEnvironment = () => {
  const epoch = Object.freeze({});
  return Object.freeze({ geometryMeasurementEpoch: () => epoch });
};
const hosts: Record<Exclude<DemoFramework, 'headless'>, MountDemoHost> = {
  vanilla: (root, editor, onStatus) =>
    createCanvasSurface({ root, editor, onStatus, environment: measurementEnvironment() }),
  react: (root, editor, onStatus) => {
    const tree = createRoot(root),
      ref = createRef<CanvasSurfaceHandle>();
    tree.render(
      createElement(
        StrictMode,
        null,
        createElement(CanvasSurface, {
          editor,
          environment: measurementEnvironment(),
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
        environment: measurementEnvironment(),
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
