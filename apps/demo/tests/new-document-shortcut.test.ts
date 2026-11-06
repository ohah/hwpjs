import { test, expect, mock } from 'bun:test';
import * as sourceCore from '../../../packages/core/src/index.ts';
// Source-only test: installed dist is intentionally not rebuilt by this cohort.
mock.module('@hwpjs/core', () => sourceCore);
const { mountShortcutSettings } = await import('../src/shortcut-settings.ts');
// @ts-ignore Shared fixture is an event/ownership oracle, not a browser.
const { Document, all, fire } = await import('./fake-dom.mjs');
for (const [platform, modifier] of [
  ['Win32', 'ctrlKey'],
  ['Linux', 'ctrlKey'],
  ['MacIntel', 'metaKey'],
] as const)
  test(`${platform} default new document shortcut is configurable and reset restores Mod+N`, () => {
    const doc = new Document();
    doc.defaultView = { navigator: { platform } };
    const create = doc.createElement.bind(doc);
    doc.createElement = (tag: string) => {
      const node = create(tag),
        append = node.append.bind(node);
      node.append = (...nodes: any[]) =>
        append(...nodes.map((n) => (typeof n === 'string' ? doc.createTextNode(n) : n)));
      return node;
    };
    const root = doc.createElement('div'),
      surface = doc.createElement('div'),
      calls: string[] = [];
    const settings = mountShortcutSettings({
      root,
      surface,
      available: () => true,
      execute: (action) => {
        calls.push(action.command);
      },
      onStatus: () => {},
    });
    const key = (code: string) =>
      fire(surface, 'keydown', {
        code,
        ctrlKey: modifier === 'ctrlKey',
        metaKey: modifier === 'metaKey',
        altKey: false,
        shiftKey: false,
        isComposing: false,
        repeat: false,
        getModifierState: () => false,
      });
    try {
      key('KeyN');
      expect(calls).toEqual(['new-document']);
      settings.setConfig({
        version: 1,
        bindings: [{ id: 'new-document', command: 'new-document', code: 'F9', modifiers: ['Mod'] }],
      });
      key('KeyN');
      key('F9');
      expect(calls).toEqual(['new-document', 'new-document']);
      const reset = all(root, (node: any) => node.dataset.role === 'shortcut-reset')[0];
      reset.onclick();
      expect(settings.getConfig().bindings.find((b) => b.id === 'new-document')?.code).toBe('KeyN');
      key('F9');
      key('KeyN');
      expect(calls).toEqual(['new-document', 'new-document', 'new-document']);
      expect(
        sourceCore.resolveShortcutLabel(
          settings.getConfig(),
          settings.getConfig().bindings.find((b) => b.id === 'new-document')!,
          'ko',
        ),
      ).toBe('새 문서');
    } finally {
      settings.dispose();
    }
  });
