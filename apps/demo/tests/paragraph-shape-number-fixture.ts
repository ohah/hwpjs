import { expect } from 'bun:test';
import { documentFixture, all } from './formatting-dialog-test-dom.ts';
export function numericHarness(createView: (root: any, callbacks: any) => any) {
  const { root } = documentFixture();
  const draft = new Map<string, unknown>();
  const model: any = {
    captured: {
      capabilities: {
        atomic: true,
        fields: { 'paragraph.margins.left': { readable: true, writable: true } },
      },
      result: {
        observations: {
          aggregate: {
            'paragraph.margins.left': {
              state: 'known',
              value: 100,
              writable: true,
              unit: 'HWPUNIT',
            },
          },
        },
      },
    },
    draft,
    pending: false,
    loading: false,
    stale: false,
    refreshRequired: false,
    error: null,
  };
  const view = createView(root, {
    field(name: string, value: unknown) {
      if (value === 100 || value === undefined) draft.delete(name);
      else draft.set(name, value);
      view.update(model);
    },
    apply() {},
    cancel() {},
  });
  view.update(model);
  const input = all(root).find((n) => n.dataset.role === 'margins-left')!;
  input.focus();
  return {
    view,
    input,
    draft,
    enter(value: string) {
      input.value = value;
      input.dispatchEvent(new Event('input'));
    },
  };
}
export function expectRawDecimal(createView: (root: any, callbacks: any) => any) {
  const h = numericHarness(createView);
  try {
    h.enter('1.');
    expect(h.input.value).toBe('1.');
    expect(h.draft.size).toBe(0);
  } finally {
    h.view.dispose();
  }
}
export function expectExactFraction(createView: (root: any, callbacks: any) => any) {
  const h = numericHarness(createView);
  try {
    h.enter('1.15');
    expect(h.draft.get('paragraph.margins.left')).toBe(115);
    expect(h.input.value).toBe('1.15');
    h.enter('0.001');
    expect(Number.isNaN(h.draft.get('paragraph.margins.left'))).toBe(true);
  } finally {
    h.view.dispose();
  }
}
