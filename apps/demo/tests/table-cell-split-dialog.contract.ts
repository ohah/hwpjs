import {
  createTableCellSplitTool,
  type TableCellSplitCapture,
} from '../src/table-cell-split-tool.ts';
import type { HeadlessEditor } from '@hwpjs/core';

/** Real DOM, controlled API/selection doubles. These are UI contracts, not Native evidence. */
export async function runTableCellSplitDialogContracts(doc: Document) {
  const cases: string[] = [];
  const assert = (v: unknown, name: string) => {
    if (!v) throw Error(name);
  };
  const root = doc.createElement('div');
  doc.body.append(root);
  let current = true,
    focusCalls = 0,
    writes = 0;
  let state = { editorId: 'contract', documentId: 'one', generation: 1, status: 'ready' };
  let settle: (value: unknown) => void = () => {};
  const notes: string[] = [];
  const host = {
    focus: () => {
      focusCalls++;
      return true;
    },
    registerCellBlockMenu: () => {},
  };
  const capture = (hwp5 = true, count = 1) =>
    ({
      target: {},
      selection: {
        selectedCells: count,
        profile: hwp5 ? 'single-unmerged-source-cell' : undefined,
      },
      current: () => current,
      bindDialog: (element: HTMLDialogElement) => element.isConnected,
    }) as unknown as TableCellSplitCapture;
  const editor = {
    getEditorState: () => state,
    dispatchCommand: async (_command: unknown, payload: any) => {
      writes++;
      assert(
        payload.rows === 1 &&
          payload.columns === 2 &&
          payload.mode === 'each' &&
          payload.equalizeRows === true,
        'intent changed',
      );
      return new Promise((resolve) => {
        settle = resolve;
      });
    },
  } as unknown as HeadlessEditor;
  const tool = createTableCellSplitTool(
    root,
    editor,
    () => host,
    (n) => notes.push(n),
  );
  const get = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const open = () => tool.open(capture());
  const click = (selector: string) => get(selector).click();
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
  try {
    const foreign = doc.createElement('dialog');
    doc.body.append(foreign);
    foreign.showModal();
    try {
      open();
      assert(!root.querySelector('dialog'), 'foreign modal admitted');
    } finally {
      foreign.close();
      foreign.remove();
    }
    cases.push('existing modal excluded');
    open();
    assert(
      get<HTMLInputElement>('[name=equalizeRows]').disabled &&
        get<HTMLInputElement>('[name=equalizeRows]').checked,
      'HWP5 equal intent changed',
    );
    assert(get<HTMLInputElement>('[value=merge-then-split]').disabled, 'HWP5 merge intent changed');
    click('[data-role=apply-cell-split]');
    assert(writes === 1, 'wrong dispatch count');
    for (const sel of [
      '[name=splitRows]',
      '[name=splitColumns]',
      '[value=each]',
      '[name=equalizeRows]',
      '[data-role=dialog-dismiss]',
      '[data-role=cancel-cell-split]',
    ])
      assert(get(sel).matches(':disabled'), 'busy control ' + sel);
    get('dialog').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    assert(get<HTMLDialogElement>('dialog').open, 'pending Escape closed');
    settle({ status: 'rejected-unapplied', error: 'UnsupportedSourceTableSplitMode' });
    await tick();
    assert(!get<HTMLInputElement>('[name=splitRows]').disabled, 'rows stayed busy');
    assert(
      get<HTMLInputElement>('[value=merge-then-split]').disabled &&
        get<HTMLInputElement>('[name=equalizeRows]').disabled,
      'disabled base intent lost',
    );
    assert(get('[role=status]').textContent?.includes('후속'), 'refusal lost');
    click('[data-role=cancel-cell-split]');
    assert(focusCalls === 1, 'cancel focus not restored');
    cases.push('pending Escape/button fence and refusal restore disabled intent');
    open();
    current = false;
    click('[data-role=apply-cell-split]');
    assert(
      writes === 1 && get<HTMLButtonElement>('[data-role=apply-cell-split]').disabled,
      'stale write admitted',
    );
    click('[data-role=cancel-cell-split]');
    current = true;
    cases.push('stale target never dispatches');
    open();
    const beforeForeignFocus = focusCalls;
    state = { ...state, documentId: 'two' };
    click('[data-role=cancel-cell-split]');
    assert(focusCalls === beforeForeignFocus, 'foreign document focus stolen');
    cases.push('foreign generation focus withheld');
    state = { ...state, documentId: 'one' };
    open();
    click('[data-role=apply-cell-split]');
    const priorFocus = focusCalls,
      priorNotes = notes.length;
    tool.dispose();
    settle({ status: 'committed-with-snapshot' });
    await tick();
    assert(
      !root.querySelector('dialog') && focusCalls === priorFocus && notes.length === priorNotes,
      'disposed callback affected UI',
    );
    cases.push('dispose during pending apply suppresses late UI and focus');
    const hx = createTableCellSplitTool(
      root,
      editor,
      () => host,
      (n) => notes.push(n),
    );
    try {
      hx.open(capture(false, 2));
      assert(
        !get<HTMLInputElement>('[value=merge-then-split]').disabled &&
          !get<HTMLInputElement>('[name=equalizeRows]').disabled,
        'HWPX supported intent disabled',
      );
    } finally {
      hx.dispose();
    }
    cases.push('HWPX multi-cell mode availability preserved');
    return { kind: 'controlled-api-real-DOM', cases };
  } finally {
    tool.dispose();
    root.remove();
  }
}
