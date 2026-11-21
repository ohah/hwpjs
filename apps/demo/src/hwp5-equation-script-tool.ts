import {
  EDIT_HWP5_EQUATION_SCRIPT_COMMAND,
  checkedHwp5EquationScriptDraft,
  createParagraphSelection,
  hwp5EquationScriptAvailability,
  hwp5EquationScriptSources,
  type HeadlessEditor,
  type Hwp5EquationScriptRead,
} from '@hwpjs/core';
import { createDialogLayer } from './dialog-layer.ts';

/** Existing body EQEDIT only. Inventory is descriptive; Native capture/commit owns authority. */
export function createHwp5EquationScriptTool(o: {
  root: HTMLElement;
  editor: HeadlessEditor;
  onStatus(text: string): void;
  onClose(): void;
  onPresentationChange?(): void;
}) {
  let close: (() => void) | undefined,
    disposed = false;
  return {
    presentation() {
      const available = hwp5EquationScriptAvailability(o.editor.getEditorState());
      return { enabled: !disposed && !close && available.enabled, reason: available.reason };
    },
    open() {
      if (!this.presentation().enabled) return;
      const doc = o.root.ownerDocument,
        rows = hwp5EquationScriptSources(o.editor.getEditorState());
      let state = o.editor.getEditorState(),
        stopped = false,
        choosing = false,
        writing = false,
        composing = false,
        sequence = 0,
        stop = () => {},
        read: Extract<Hwp5EquationScriptRead, { state: 'available' }> | undefined,
        domBaseline = '',
        confirmedDraft: string | undefined;
      const layer = createDialogLayer(o.root, {
        role: 'hwp5-equation-script-dialog',
        title: '기존 HWP5 수식 편집',
        mode: 'modal',
        onDismiss: () => {
          if (!writing) destroy();
        },
      });
      const status = doc.createElement('p'),
        form = doc.createElement('form'),
        select = doc.createElement('select'),
        text = doc.createElement('textarea'),
        apply = doc.createElement('button'),
        confirm = doc.createElement('button'),
        back = doc.createElement('button'),
        cancel = doc.createElement('button');
      status.setAttribute('role', 'status');
      select.setAttribute('aria-label', '기존 수식 대상');
      text.setAttribute('aria-label', '기존 수식 스크립트');
      const empty = doc.createElement('option');
      empty.value = '';
      empty.textContent = '대상을 선택하세요.';
      select.append(empty);
      rows.forEach((row, index) => {
        const option = doc.createElement('option');
        option.value = String(index);
        option.disabled = row.issue !== null;
        option.textContent = `${row.section + 1}구역 ${row.paragraph + 1}문단 수식 ${index + 1}${row.issue ? ' (편집 불가)' : ''}`;
        select.append(option);
      });
      select.value = '';
      apply.type = 'submit';
      apply.textContent = '변경 확인';
      confirm.type = back.type = cancel.type = 'button';
      confirm.textContent = '선택한 기존 수식에 적용';
      back.textContent = '계속 편집';
      cancel.textContent = '취소';
      confirm.hidden = back.hidden = true;
      text.disabled = apply.disabled = true;
      form.append(select, text, apply, confirm, back, cancel);
      layer.body.append(status, form);
      status.textContent = rows.length
        ? '본문의 기존 수식을 선택하세요. 원본에서 관측한 version-only 형식을 사용합니다.'
        : '편집할 기존 본문 수식이 없습니다.';
      function release() {
        const previous = read;
        read = undefined;
        if (previous) void o.editor.releaseHwp5EquationScript(previous.target).catch(() => {});
      }
      function destroy() {
        if (stopped) return;
        stopped = true;
        sequence++;
        stop();
        release();
        layer.destroy();
        close = undefined;
        o.onPresentationChange?.();
        if (!disposed) o.onClose();
      }
      close = destroy;
      function resetConfirmation() {
        confirmedDraft = undefined;
        confirm.hidden = back.hidden = true;
        apply.hidden = false;
        text.disabled = !read;
        select.disabled = false;
      }
      layer.element.addEventListener('compositionstart', () => {
        composing = true;
      });
      layer.element.addEventListener('compositionend', () => {
        composing = false;
      });
      text.addEventListener('input', resetConfirmation);
      form.addEventListener('keydown', (event) => {
        if (event.isComposing || event.keyCode === 229) {
          event.preventDefault();
          event.stopPropagation();
        }
      });
      cancel.addEventListener('click', () => {
        if (!writing) destroy();
      });
      back.addEventListener('click', resetConfirmation);
      stop = o.editor.registerStateListener((current) => {
        if (!choosing && !writing && current !== state) destroy();
      });
      select.addEventListener('change', async () => {
        if (stopped || writing) return;
        const attempt = ++sequence;
        release();
        resetConfirmation();
        text.value = '';
        text.disabled = apply.disabled = true;
        if (!/^(0|[1-9][0-9]*)$/.test(select.value)) return;
        const row = rows[Number(select.value)];
        if (!row || row.issue) return;
        choosing = true;
        select.disabled = true;
        try {
          const before = o.editor.getEditorState();
          if (before !== state) throw Error('StaleHwp5EquationScriptTarget');
          const selected = await o.editor.setSelection(
            createParagraphSelection(before, {
              section: row.section,
              paragraph: row.paragraph,
              startUnit: row.unit,
              endUnit: row.unit + 1,
            }),
          );
          if (stopped || attempt !== sequence || o.editor.getEditorState() !== selected) return;
          state = selected;
          choosing = false;
          const captured = await o.editor.getHwp5EquationScript(
            { section: row.section, equationNode: row.equationNode, layout: 'version-only' },
            { token: state.token },
          );
          if (stopped || attempt !== sequence || o.editor.getEditorState() !== state) {
            if (captured.state === 'available')
              void o.editor.releaseHwp5EquationScript(captured.target).catch(() => {});
            return;
          }
          if (captured.state !== 'available') throw Error(captured.reason);
          read = captured;
          text.value = captured.script;
          domBaseline = text.value;
          text.disabled = apply.disabled = false;
          status.textContent = '선택한 기존 수식의 스크립트만 변경합니다. 적용 전에 확인하세요.';
        } catch {
          if (!stopped && attempt === sequence)
            status.textContent = '현재 원본 수식을 편집할 수 없습니다. 대상을 다시 선택하세요.';
        } finally {
          choosing = false;
          if (!stopped) select.disabled = false;
        }
      });
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        if (stopped || composing || writing || !read || o.editor.getEditorState() !== state) return;
        try {
          confirmedDraft = checkedHwp5EquationScriptDraft(
            text.value === domBaseline ? read.script : text.value,
          );
        } catch {
          status.textContent = '비어 있지 않은 올바른 수식 스크립트를 입력하세요.';
          return;
        }
        text.disabled = select.disabled = true;
        apply.hidden = true;
        confirm.hidden = back.hidden = false;
        status.textContent = '선택한 기존 수식에 이 스크립트를 적용할까요?';
      });
      confirm.addEventListener('click', async () => {
        if (
          stopped ||
          writing ||
          composing ||
          !read ||
          confirmedDraft === undefined ||
          o.editor.getEditorState() !== state
        )
          return;
        const captured = read,
          script = confirmedDraft;
        read = undefined;
        writing = true;
        confirm.disabled = back.disabled = cancel.disabled = true;
        try {
          const result = await o.editor.dispatchCommand(EDIT_HWP5_EQUATION_SCRIPT_COMMAND, {
            target: captured.target,
            script,
          });
          if (stopped) return;
          if (
            result.state.editorId !== state.editorId ||
            result.state.documentId !== state.documentId ||
            result.state.generation !== state.generation ||
            o.editor.getEditorState() !== result.state
          ) {
            destroy();
            return;
          }
          if (result.status === 'committed-with-snapshot' || result.status === 'known-no-op') {
            o.onStatus(
              result.status === 'known-no-op'
                ? '기존 수식과 같습니다.'
                : '기존 수식을 변경했습니다.',
            );
            destroy();
          } else {
            status.textContent =
              result.status === 'committed-refresh-required'
                ? '적용 상태를 다시 확인해야 합니다. 다시 적용하지 마세요.'
                : '적용하지 못했습니다. 창을 닫고 대상을 다시 확인하세요.';
          }
        } catch {
          if (!stopped)
            status.textContent = '적용 상태를 확인할 수 없습니다. 다시 적용하지 마세요.';
        } finally {
          writing = false;
          if (!stopped) cancel.disabled = false;
        }
      });
      layer.show(select);
      o.onPresentationChange?.();
    },
    dispose() {
      disposed = true;
      close?.();
    },
  };
}
