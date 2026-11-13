import { createDialogLayer } from './dialog-layer.ts';
// @ts-ignore Existing UI/state machine is the single owner of equation drafts and source validation.
import { createEquationControls } from '../../../web/preview/equation-controls.mjs';
import type { RuntimeMessage, RuntimeReply } from '@hwpjs/core';
import './equation-view.css';

export function createEquationView(
  root: HTMLElement,
  options: {
    ready(): boolean;
    request(message: RuntimeMessage): boolean;
    onDismiss(): void;
  },
) {
  const doc = root.ownerDocument;
  let closed = false,
    composing = false,
    key229 = false;
  const layer = createDialogLayer(root, {
    role: 'equation-editor',
    title: '기존 수식 편집',
    mode: 'modal',
    onDismiss: () => {
      if (!composing && !key229) options.onDismiss();
    },
  });
  const form = doc.createElement('form'),
    fields = doc.createElement('fieldset');
  const scope = doc.createElement('p');
  scope.textContent =
    '기존 HWPX 수식의 script 목록·조회·수정 도구입니다. 새 수식 삽입은 지원하지 않습니다. 다시 조회하면 미적용 초안은 폐기됩니다.';
  const label = <T extends HTMLElement>(text: string, element: T) => {
    const row = doc.createElement('label');
    row.textContent = text;
    element.setAttribute('aria-label', text);
    row.append(element);
    form.append(row);
    return element;
  };
  const section = label('구역 번호', doc.createElement('input'));
  section.type = 'number';
  section.min = '1';
  section.step = '1';
  const button = (text: string, parent: HTMLElement = form) => {
    const value = doc.createElement('button');
    value.type = 'button';
    value.textContent = text;
    parent.append(value);
    return value;
  };
  const list = button('기존 수식 목록 조회');
  const targets = label('기존 수식', doc.createElement('select'));
  const previous = button('이전 목록'),
    next = button('다음 목록');
  const pageNote = doc.createElement('p');
  form.append(pageNote);
  const refresh = button('현재 script 다시 조회');
  const input = doc.createElement('textarea');
  input.setAttribute('aria-label', '기존 수식 script');
  input.rows = 8;
  const legend = doc.createElement('legend');
  legend.textContent = '기존 수식 script';
  fields.append(legend, input);
  const apply = button('기존 수식 수정', fields);
  apply.type = 'submit';
  const note = doc.createElement('p');
  note.setAttribute('role', 'status');
  note.setAttribute('aria-live', 'polite');
  form.append(fields, note);
  layer.body.append(scope, form);
  const controls = createEquationControls({
    form,
    fields,
    section,
    list,
    targets,
    previous,
    next,
    pageNote,
    refresh,
    input,
    note,
    ready: () => !closed && !composing && !key229 && options.ready(),
    request: options.request,
  });
  const start = () => {
    composing = true;
  };
  const end = () => {
    composing = false;
    key229 = false;
  };
  const keydown = (event: KeyboardEvent) => {
    if (event.isComposing || event.keyCode === 229) key229 = true;
  };
  const keyup = (event: KeyboardEvent) => {
    if (!event.isComposing && event.keyCode !== 229) key229 = false;
  };
  const submit = (event: Event) => {
    if (composing || key229) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };
  form.addEventListener('compositionstart', start);
  form.addEventListener('compositionend', end);
  form.addEventListener('submit', submit, true);
  layer.element.addEventListener('keydown', keydown);
  layer.element.addEventListener('keyup', keyup);
  return {
    message(message: RuntimeReply) {
      if (!closed) controls.message(message);
    },
    show() {
      if (!closed) layer.show(section);
    },
    destroy() {
      if (closed) return;
      closed = true;
      controls.close();
      form.removeEventListener('compositionstart', start);
      form.removeEventListener('compositionend', end);
      form.removeEventListener('submit', submit, true);
      layer.element.removeEventListener('keydown', keydown);
      layer.element.removeEventListener('keyup', keyup);
      layer.destroy();
    },
  };
}
