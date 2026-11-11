import {
  SPLIT_SOURCE_TABLE_CELLS_COMMAND,
  type HeadlessEditor,
  type SourceTableCellSplitCapture,
} from '@hwpjs/core';

export interface TableCellSplitCapture extends SourceTableCellSplitCapture {
  current(): boolean;
  bindDialog(element: HTMLDialogElement): boolean;
}
export interface TableCellSplitHost {
  captureSourceTableCellSplit?(): TableCellSplitCapture | null;
  registerCellBlockMenu?(menu: HTMLElement, ownsInput?: (input: HTMLElement) => boolean): void;
  focus?(): boolean;
}
const refusal = (error: string) => {
  if (error === 'UnsupportedSourceTableSplitHeights')
    return '현재 행 높이를 유지하는 이 분할은 지원하지 않습니다. 줄 높이를 같게 하거나 나눌 줄 수를 바꾸세요.';
  if (error.includes('Stale') || error.includes('Foreign'))
    return '셀 선택이 바뀌었습니다. 대화상자를 닫고 셀을 다시 선택하세요.';
  return `셀을 나누지 못했습니다. ${error}`;
};
export function createTableCellSplitTool(
  root: HTMLElement,
  editor: HeadlessEditor,
  getHost: () => TableCellSplitHost | undefined,
  note: (message: string) => void,
) {
  let disposeDialog: (() => void) | undefined;
  return {
    open(captured?: TableCellSplitCapture) {
      if (disposeDialog) return;
      const host = getHost(),
        capture = captured ?? host?.captureSourceTableCellSplit?.();
      if (!capture?.current()) {
        note('편집 가능한 HWPX 원본 표에서 셀이나 직사각형 셀 블록을 선택하세요.');
        return;
      }
      const doc = root.ownerDocument,
        dialog = doc.createElement('dialog');
      dialog.dataset.role = 'table-cell-split-dialog';
      dialog.setAttribute('aria-label', '셀 나누기');
      const title = doc.createElement('h2');
      title.textContent = '셀 나누기';
      const description = doc.createElement('p');
      description.textContent = `${capture.selection.selectedCells}개 셀 선택 · 기존 내용은 각 분할의 첫 셀에 보존됩니다.`;
      dialog.append(title, description);
      const number = (name: string, text: string, value: number) => {
        const label = doc.createElement('label'),
          input = doc.createElement('input');
        label.textContent = text;
        input.type = 'number';
        input.name = name;
        input.min = '1';
        input.max = '63';
        input.step = '1';
        input.value = String(value);
        input.style.width = '5em';
        label.append(input);
        dialog.append(label);
        return input;
      };
      const rows = number('splitRows', '줄 수 ', 1),
        columns = number('splitColumns', '칸 수 ', 2);
      const hint = doc.createElement('p');
      hint.textContent = '1은 해당 방향을 유지합니다. 나눌 방향은 2~63을 입력하세요.';
      dialog.append(hint);
      const modes = doc.createElement('fieldset'),
        legend = doc.createElement('legend');
      legend.textContent = '나누는 방법';
      modes.append(legend);
      const modeInputs: HTMLInputElement[] = [];
      for (const [value, text] of [
        ['each', '선택한 셀을 각각 나누기'],
        ['merge-then-split', '셀을 먼저 합친 뒤 나누기'],
      ]) {
        const label = doc.createElement('label'),
          input = doc.createElement('input');
        input.type = 'radio';
        input.name = 'splitMode';
        input.value = value;
        input.checked = value === 'each';
        input.disabled = value === 'merge-then-split' && capture.selection.selectedCells < 2;
        label.append(input, doc.createTextNode(text));
        modes.append(label);
        modeInputs.push(input);
      }
      dialog.append(modes);
      const equalLabel = doc.createElement('label'),
        equal = doc.createElement('input');
      equal.type = 'checkbox';
      equal.name = 'equalizeRows';
      equal.checked = true;
      equalLabel.append(equal, doc.createTextNode('줄 높이를 같게 나누기'));
      dialog.append(equalLabel);
      const status = doc.createElement('p');
      status.setAttribute('role', 'status');
      const accept = doc.createElement('button'),
        cancel = doc.createElement('button');
      accept.type = cancel.type = 'button';
      accept.textContent = '나누기';
      cancel.textContent = '취소';
      accept.dataset.role = 'apply-cell-split';
      cancel.dataset.role = 'cancel-cell-split';
      dialog.append(status, accept, cancel);
      root.append(dialog);
      let busy = false,
        closed = false;
      const close = (force = false) => {
        if (closed || (busy && !force)) return;
        closed = true;
        dialog.close();
        dialog.remove();
        disposeDialog = undefined;
        host?.focus?.();
      };
      disposeDialog = () => close(true);
      if (!capture.bindDialog(dialog)) {
        close();
        note('셀 선택이 바뀌었습니다. 다시 선택하세요.');
        return;
      }
      host?.registerCellBlockMenu?.(dialog, () => capture.current());
      cancel.addEventListener('click', () => close());
      dialog.addEventListener('cancel', (event) => {
        event.preventDefault();
        close();
      });
      dialog.addEventListener('close', () => close());
      accept.addEventListener('click', async () => {
        if (busy) return;
        if (!capture.current()) {
          status.textContent = refusal('StaleSourceTableCellSplitTarget');
          accept.disabled = true;
          return;
        }
        if (
          !rows.reportValidity() ||
          !columns.reportValidity() ||
          (rows.valueAsNumber === 1 && columns.valueAsNumber === 1)
        ) {
          status.textContent = '줄이나 칸 중 하나는 2 이상이어야 합니다.';
          return;
        }
        busy = true;
        accept.disabled = cancel.disabled = true;
        try {
          const result = await editor.dispatchCommand(SPLIT_SOURCE_TABLE_CELLS_COMMAND, {
            target: capture.target,
            rows: rows.valueAsNumber,
            columns: columns.valueAsNumber,
            mode: modeInputs[1].checked ? 'merge-then-split' : 'each',
            equalizeRows: equal.checked,
          });
          if (closed) return;
          if (
            result.status === 'committed-with-snapshot' ||
            result.status === 'committed-refresh-required'
          ) {
            busy = false;
            close();
            note(
              result.status === 'committed-with-snapshot'
                ? '셀을 나눴습니다.'
                : '셀 나누기가 반영됐습니다. 화면을 복구한 뒤 계속하세요.',
            );
            return;
          }
          status.textContent = refusal(result.error || 'NativeRejected');
        } catch (error) {
          status.textContent = refusal(error instanceof Error ? error.message : String(error));
        } finally {
          busy = false;
          cancel.disabled = false;
          accept.disabled = !capture.current();
        }
      });
      dialog.showModal();
      columns.focus();
    },
    dispose() {
      disposeDialog?.();
    },
  };
}
