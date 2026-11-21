import { EDIT_PAGE_RESTART_COMMAND, type HeadlessEditor, type PageRestartRead } from '@hwpjs/core';
import { createDialogLayer } from './dialog-layer.ts';
/** Existing source controls only. Never inserts or changes page-number placement. */
export function createPageRestartTool(o: {
  root: HTMLElement;
  editor: HeadlessEditor;
  onStatus(text: string): void;
  onClose(): void;
}) {
  let close: (() => void) | undefined;
  return {
    presentation() {
      const state = o.editor.getEditorState(),
        c = state.content as Record<string, unknown> | undefined;
      return {
        enabled:
          state.status === 'ready' &&
          (c?.format === 'hwp5' || c?.format === 'hwpx') &&
          !c?.readOnly &&
          !c?.window &&
          !c?.limited &&
          !(state.capabilities as Record<string, unknown> | undefined)?.readOnly &&
          !state.historyRecoveryRequired &&
          state.nativeHistoryStats?.protocolVersion === 2,
      };
    },
    async open() {
      if (close || !this.presentation().enabled) return;
      const doc = o.root.ownerDocument,
        state = o.editor.getEditorState();
      let disposed = false,
        busy = false,
        composing = false,
        stop = () => {};
      const layer = createDialogLayer(o.root, {
        role: 'page-restart-dialog',
        title: '기존 새 쪽 번호 편집',
        mode: 'modal',
        onDismiss: () => {
          if (!busy) destroy();
        },
      });
      function destroy() {
        if (disposed) return;
        disposed = true;
        stop();
        layer.destroy();
        close = undefined;
        o.onClose();
      }
      close = destroy;
      layer.element.addEventListener('compositionstart', () => {
        composing = true;
      });
      layer.element.addEventListener('compositionend', () => {
        composing = false;
      });
      const status = doc.createElement('p');
      status.setAttribute('role', 'status');
      status.textContent = '기존 쪽 번호 재시작을 읽고 있습니다.';
      layer.body.append(status);
      layer.show();
      stop = o.editor.registerStateListener((current) => {
        if (!busy && current !== state) destroy();
      });
      let read: PageRestartRead;
      try {
        read = await o.editor.getPageRestarts();
      } catch {
        if (!disposed) status.textContent = '현재 문서에서 기존 새 쪽 번호를 편집할 수 없습니다.';
        return;
      }
      if (disposed || o.editor.getEditorState() !== state) {
        destroy();
        return;
      }
      if (read.state !== 'available') {
        status.textContent = '현재 문서에서 기존 새 쪽 번호를 편집할 수 없습니다.';
        return;
      }
      for (const row of read.unavailable) {
        const reason = doc.createElement('p');
        reason.textContent = `${row.section + 1}구역: 기존 컨트롤의 구조나 번호를 확인할 수 없어 편집하지 않습니다.`;
        layer.body.append(reason);
      }
      if (!read.entries.length) {
        status.textContent =
          '편집할 수 있는 기존 쪽 번호 재시작이 없습니다. 새 컨트롤은 만들지 않습니다.';
        return;
      }
      const entries = read.entries;
      const form = doc.createElement('form'),
        select = doc.createElement('select'),
        input = doc.createElement('input'),
        apply = doc.createElement('button'),
        cancel = doc.createElement('button');
      select.setAttribute('aria-label', '기존 쪽 번호 재시작 대상');
      const empty = doc.createElement('option');
      empty.value = '';
      empty.textContent = '대상을 선택하세요.';
      select.append(empty);
      entries.forEach((row, index) => {
        const option = doc.createElement('option');
        option.value = String(index);
        option.textContent = `${row.section + 1}구역 ${row.paragraph + 1}문단: ${row.number}`;
        select.append(option);
      });
      select.value = entries.length === 1 ? '0' : '';
      input.type = 'text';
      input.setAttribute('aria-label', '다시 시작할 쪽 번호');
      apply.type = 'submit';
      apply.textContent = '기존 번호에 적용';
      cancel.type = 'button';
      cancel.textContent = '취소';
      let selected: number | undefined;
      const choose = () => {
        selected =
          /^(0|[1-9][0-9]*)$/.test(select.value) && Number(select.value) < entries.length
            ? Number(select.value)
            : undefined;
        input.value = selected === undefined ? '' : String(entries[selected].number);
        apply.disabled = selected === undefined;
      };
      choose();
      select.addEventListener('change', choose);
      cancel.addEventListener('click', () => {
        if (!busy) destroy();
      });
      form.append(select, input, apply, cancel);
      layer.body.append(form);
      status.textContent = read.unavailable.length
        ? '지원하지 않는 원본 컨트롤은 선택 목록에서 제외했습니다. 위치와 모양은 변경하지 않습니다.'
        : '선택한 기존 재시작의 번호만 변경합니다. 위치와 모양은 변경하지 않습니다.';
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (
          busy ||
          composing ||
          disposed ||
          selected === undefined ||
          o.editor.getEditorState() !== state
        )
          return;
        const text = input.value.trim(),
          number = Number(text);
        if (!/^[1-9][0-9]{0,4}$/.test(text) || number > 65535) {
          input.setAttribute('aria-invalid', 'true');
          status.textContent = '1부터 65535까지 정수 쪽 번호를 입력하세요.';
          input.focus();
          return;
        }
        busy = true;
        apply.disabled = true;
        select.disabled = input.disabled = cancel.disabled = true;
        try {
          const result = await o.editor.dispatchCommand(EDIT_PAGE_RESTART_COMMAND, {
            target: entries[selected].target,
            number,
          });
          if (disposed) return;
          if (
            result.state.editorId !== state.editorId ||
            result.state.documentId !== state.documentId ||
            result.state.generation !== state.generation
          ) {
            destroy();
            return;
          }
          if (result.status === 'committed-with-snapshot' || result.status === 'known-no-op') {
            o.onStatus(
              result.status === 'known-no-op'
                ? '기존 쪽 번호와 같습니다.'
                : '기존 쪽 번호 재시작을 변경했습니다.',
            );
            destroy();
            return;
          }
          status.textContent =
            result.status === 'committed-refresh-required'
              ? '적용 상태를 다시 확인해야 합니다. 다시 적용하지 마세요.'
              : '적용하지 못했습니다. 창을 닫고 대상을 다시 확인하세요.';
        } catch {
          if (!disposed)
            status.textContent = '적용 상태를 확인할 수 없습니다. 창을 닫고 다시 확인하세요.';
        } finally {
          busy = false;
          if (!disposed) cancel.disabled = false;
        }
      });
    },
    dispose() {
      close?.();
    },
  };
}
