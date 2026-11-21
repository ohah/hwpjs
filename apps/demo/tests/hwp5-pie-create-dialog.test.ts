import test from 'node:test';
import assert from 'node:assert/strict';
import { Document, all, fire } from './fake-dom.mjs';
import { createInlineObjectInsertDialog } from '../src/inline-object-insert-dialog.ts';
import {
  HWP5_PIE_CHART_CREATE_PROFILE as pie,
  HWP5_CHART_CREATE_PROFILE as bar,
  HWP5_HORIZONTAL_BAR_CHART_CREATE_PROFILE as horizontal,
} from '../../../js/hwp5-chart-create-profiles.mjs';
function fixture() {
  const doc = new Document(),
    create = doc.createElement.bind(doc);
  doc.createElement = (tag: string) => {
    const node = create(tag);
    Object.assign(node, {
      insertBefore(child: typeof node, before: typeof node | null) {
        if (before === null) node.append(child);
        else {
          assert.equal(before.parentElement, node);
          child.remove();
          child.parentElement = node;
          node.children.splice(node.children.indexOf(before), 0, child);
        }
        return child;
      },
      showModal() {
        node.open = true;
      },
      close() {
        node.open = false;
      },
    });
    return node;
  };
  const host = doc.createElement('main');
  const visible = (node: ReturnType<typeof create>) => {
    for (let p: typeof node | undefined = node; p; p = p.parentElement) if (p.hidden) return false;
    return true;
  };
  const nodes = (predicate: (node: ReturnType<typeof create>) => boolean) =>
    all(host, (node: ReturnType<typeof create>) => visible(node) && predicate(node));
  function input(label: string) {
    const found = nodes((n) => n.getAttribute('aria-label') === label);
    assert.equal(found.length, 1, label);
    return found[0];
  }
  function edit(label: string, value: string) {
    const n = input(label);
    n.value = value;
    fire(n, 'input');
    return n;
  }
  function select(label: string, value: string) {
    const n = input(label);
    n.value = value;
    fire(n, 'change');
    return n;
  }
  function button(text: string) {
    const found = nodes((n) => n.tagName === 'BUTTON' && n.textContent === text);
    assert.equal(found.length, 1, text);
    return found[0];
  }
  function fill() {
    for (const node of nodes((n) => n.tagName === 'INPUT')) {
      const label = node.getAttribute('aria-label') ?? '';
      if (label.includes('이름')) node.value = 'S';
      else if (/^(범주|날짜) \d+$/.test(label)) node.value = 'A';
      else if (label.endsWith(' X')) node.value = '17';
      else if (label.endsWith(' 크기')) node.value = '9';
      else node.value = '5';
    }
  }
  return {
    doc,
    host,
    root: host as unknown as HTMLElement,
    nodes,
    input,
    edit,
    select,
    button,
    fill,
  };
}

function dialog(version: number) {
  const f = fixture(),
    outputs: any[] = [];
  const view = createInlineObjectInsertDialog(f.root, 'chart', {
    format: 'hwp5',
    chartCreateProfileVersion: version,
    onInsert: (value) => outputs.push(value),
    onDismiss() {},
  });
  return { ...f, outputs, view };
}
test('H5 version4 pie picker uses one-series typed grid and retains bar draft on roundtrip', () => {
  const f = dialog(4);
  assert(f.nodes((n) => n.tagName === 'OPTION').some((n) => n.value === pie));
  assert(f.nodes((n) => n.tagName === 'OPTION').some((n) => n.value === horizontal));
  f.select('HWP5 차트 생성 방식', pie);
  const series = f.nodes(
    (n) =>
      (n.getAttribute('aria-label') ?? '').includes('계열') &&
      (n.getAttribute('aria-label') ?? '').includes('이름'),
  );
  assert.equal(series.length, 1);
  f.fill();
  for (const n of f.nodes((n) => n.tagName === 'INPUT' && ['width', 'height'].includes(n.name)))
    n.value = '20';
  fire(f.nodes((n) => n.tagName === 'FORM')[0], 'submit');
  assert.equal(f.outputs.length, 1);
  assert.equal(f.outputs[0].profile, pie);
  assert.equal(f.outputs[0].series.length, 1);
  assert(!Object.hasOwn(f.outputs[0], 'chart'));
  f.select('HWP5 차트 생성 방식', bar);
  f.select('HWP5 차트 생성 방식', pie);
  assert.equal(f.input('계열 1 이름').value, 'S');
  f.view.destroy();
});
test('H5 version3 preserves horizontal picker but does not expose pie', () => {
  const f = dialog(3);
  assert(f.nodes((n) => n.tagName === 'OPTION').some((n) => n.value === horizontal));
  assert(!f.nodes((n) => n.tagName === 'OPTION').some((n) => n.value === pie));
  f.view.destroy();
});
test('H5 pie actual grid refuses lexical negative and nonzero underflow before number DTO conversion', () => {
  const f = dialog(4);
  f.select('HWP5 차트 생성 방식', pie);
  f.fill();
  const numeric = f.nodes(
    (n) => n.tagName === 'INPUT' && (n.getAttribute('aria-label') ?? '').endsWith('계열 1 값'),
  )[0];
  assert(numeric);
  for (const value of ['-1e-5000', '1e-5000', '-1e-400', '1e-400', '-1']) {
    numeric.value = value;
    fire(numeric, 'input');
    fire(f.nodes((n) => n.tagName === 'FORM')[0], 'submit');
    assert.equal(f.outputs.length, 0);
    assert.equal(numeric.getAttribute('aria-invalid'), 'true');
  }
  f.view.destroy();
});
