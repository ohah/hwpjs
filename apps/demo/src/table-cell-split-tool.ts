import {
  SPLIT_SOURCE_TABLE_CELLS_COMMAND,
  type HeadlessEditor,
  type SourceTableCellSplitCapture,
} from '@hwpjs/core';
import { createDialogLayer } from './dialog-layer.ts';
import './table-cell-split.css';

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
  if (
    error === 'UnsupportedSourceTableSplitSelection' ||
    error === 'UnsupportedSourceTableSplitMode'
  )
    return '현재 HWP5는 비병합 원본 표의 셀 하나를 지원합니다. 병합 입력과 여러 셀 나누기는 후속 지원 범위입니다.';
  if (error === 'UnsupportedSourceTableGrid')
    return '이 표에는 현재 나눌 수 없는 병합·보호·중첩 또는 복잡한 셀 구조가 있습니다.';
  if (
    [
      'UnsupportedSectionRecord',
      'UnsupportedSectionControl',
      'UnsupportedSectionStructure',
    ].includes(error)
  )
    return '구역에 지원하지 않는 필드나 개체가 있어 셀을 나눌 수 없습니다.';
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
  let disposed = false;
  return {
    open(captured?: TableCellSplitCapture) {
      if (disposed || disposeDialog || root.ownerDocument.querySelector('dialog:modal')) return;
      const host = getHost(),
        capture = captured ?? host?.captureSourceTableCellSplit?.();
      if (!capture?.current()) {
        note('지원되는 원본 표에서 셀이나 직사각형 셀 블록을 선택하세요.');
        return;
      }
      const hwp5 = capture.selection.profile === 'single-unmerged-source-cell';
      const doc = root.ownerDocument;
      const openingState = editor.getEditorState();
      const layer = createDialogLayer(root, {
        role: 'table-cell-split-dialog',
        title: '셀 나누기',
        mode: 'modal',
        onDismiss: () => close(),
      });
      const dialog = layer.element;
      dialog.classList.add('hwp-table-cell-split-dialog');
      const dismiss = dialog.querySelector<HTMLButtonElement>('[data-role=dialog-dismiss]')!;
      const description = doc.createElement('p');
      description.textContent = `${capture.selection.selectedCells}개 셀 선택 · 기존 내용은 각 분할의 첫 셀에 보존됩니다.`;
      description.className = 'hwp-cell-split-description';
      layer.body.append(description);
      if (hwp5) {
        const scope = doc.createElement('p');
        scope.dataset.role = 'cell-split-scope';
        scope.textContent =
          'HWP5는 현재 원본 비병합 표의 셀 하나를 균등하게 나눕니다. 병합 입력·여러 셀 나누기는 후속 지원 범위입니다.';
        scope.className = 'hwp-cell-split-scope';
        layer.body.append(scope);
      }
      const dimensions = doc.createElement('fieldset'),
        counts = doc.createElement('div'),
        countTitle = doc.createElement('legend');
      dimensions.className = 'hwp-cell-split-group';
      countTitle.textContent = '줄/칸 나누기';
      counts.className = 'hwp-cell-split-counts';
      dimensions.append(countTitle, counts);
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
        label.className = 'hwp-cell-split-count';
        label.append(input);
        counts.append(label);
        return input;
      };
      const rows = number('splitRows', '줄 수', 1),
        columns = number('splitColumns', '칸 수', 2);
      const hint = doc.createElement('p');
      hint.textContent = '1은 해당 방향을 유지합니다. 나눌 방향은 2~63을 입력하세요.';
      hint.className = 'hwp-cell-split-hint';
      dimensions.append(hint);
      layer.body.append(dimensions);
      const modes = doc.createElement('fieldset'),
        legend = doc.createElement('legend');
      legend.textContent = '나누는 방법';
      modes.className = 'hwp-cell-split-group hwp-cell-split-modes';
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
        input.disabled =
          value === 'merge-then-split' && (hwp5 || capture.selection.selectedCells < 2);
        label.className = 'hwp-cell-split-choice';
        label.append(input, doc.createTextNode(text));
        modes.append(label);
        modeInputs.push(input);
      }
      layer.body.append(modes);
      const equalLabel = doc.createElement('label'),
        equal = doc.createElement('input');
      equal.type = 'checkbox';
      equal.name = 'equalizeRows';
      equal.checked = true;
      equal.disabled = hwp5;
      equalLabel.append(equal, doc.createTextNode('줄 높이를 같게 나누기'));
      equalLabel.className = 'hwp-cell-split-choice';
      layer.body.append(equalLabel);
      const status = doc.createElement('p');
      status.setAttribute('role', 'status');
      status.dataset.role = 'cell-split-status';
      status.className = 'hwp-cell-split-status';
      const accept = doc.createElement('button'),
        cancel = doc.createElement('button');
      accept.type = cancel.type = 'button';
      accept.textContent = '나누기';
      cancel.textContent = '취소';
      accept.dataset.role = 'apply-cell-split';
      cancel.dataset.role = 'cancel-cell-split';
      accept.className = 'hwp-cell-split-accept';
      layer.body.append(status);
      layer.footer.append(accept, cancel);
      root.append(dialog);
      let busy = false,
        closed = false;
      const close = (force = false) => {
        if (closed || (busy && !force)) return;
        closed = true;
        layer.destroy();
        disposeDialog = undefined;
        const now = editor.getEditorState();
        if (
          !disposed &&
          getHost() === host &&
          now.editorId === openingState.editorId &&
          now.documentId === openingState.documentId &&
          now.generation === openingState.generation &&
          now.status === 'ready'
        )
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
      dialog.addEventListener('keydown', (event) => {
        if (event.key === 'F5') {
          event.preventDefault();
          event.stopPropagation();
        }
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
        accept.disabled = cancel.disabled = dismiss.disabled = true;
        rows.disabled = columns.disabled = modes.disabled = true;
        equal.disabled = true;
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
          if (!closed) {
            busy = false;
            cancel.disabled = dismiss.disabled = false;
            rows.disabled = columns.disabled = modes.disabled = false;
            equal.disabled = hwp5;
            accept.disabled = !capture.current();
          }
        }
      });
      layer.show(columns);
      columns.select();
    },
    dispose() {
      disposed = true;
      disposeDialog?.();
    },
  };
}
