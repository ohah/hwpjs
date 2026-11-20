import {
  INSERT_FOOTNOTE_COMMAND,
  INSERT_ENDNOTE_COMMAND,
  getNoteInsertAvailability,
  type HeadlessEditor,
  type NoteKind,
  type NoteInsertOptions,
} from '@hwpjs/core';
import type { InlineObjectCaretCapture } from './inline-object-insert-port.ts';
export function createNoteInsertTool(options: {
  root: HTMLElement;
  editor: HeadlessEditor;
  captureCaret(): InlineObjectCaretCapture | null;
  onStatus(text: string): void;
  onClose(): void;
  onPresentationChange(): void;
}) {
  const { editor } = options;
  let stopView: (() => void) | undefined;
  let dialog: HTMLDialogElement | undefined,
    pending = false,
    opening = false,
    disposed = false,
    epoch = 0;
  function presentation() {
    const result = getNoteInsertAvailability(editor.getEditorState());
    if (pending || opening || disposed)
      return { enabled: false, reason: '주석 입력을 처리하고 있습니다.' };
    if (!result.enabled)
      return {
        enabled: false,
        reason:
          result.reason === 'NoteCreationUnavailable'
            ? '현재 엔진에서 각주와 미주 생성을 지원하지 않습니다.'
            : '문서 전체를 편집 가능한 상태로 열고 현재 입력 위치를 선택하세요.',
      };
    const content = editor.getEditorState().content as any;
    if (!content?.tableCreationResources || !content?.noteShapes || content.noteShapesError)
      return { enabled: false, reason: '주석의 문서 설정을 읽을 수 없습니다.' };
    return options.captureCaret()?.current() === true
      ? { enabled: true }
      : { enabled: false, reason: '선택 영역 없이 편집 가능한 본문이나 표 셀에 커서를 놓으세요.' };
  }
  function close() {
    epoch++;
    stopView?.();
    stopView = undefined;
    dialog?.remove();
    dialog = undefined;
    if (!disposed) options.onPresentationChange();
  }
  async function open(kind: NoteKind) {
    if (!presentation().enabled) return;
    if (dialog) {
      dialog.focus();
      return;
    }
    if (options.root.querySelector('dialog[open]')) {
      options.onStatus('열린 창을 먼저 닫아주세요.');
      return;
    }
    const captured = options.captureCaret();
    if (!captured?.current()) return;
    opening = true;
    const ticket = ++epoch;
    options.onPresentationChange();
    try {
      const target = await editor.getInlineObjectInsertTarget(captured.selector, captured.unit, {
        affinity: captured.affinity ?? 'forward',
      });
      if (disposed || ticket !== epoch) return;
      const state = editor.getEditorState();
      if (state !== captured.state || !captured.current()) throw Error('StaleNoteInsertSelection');
      const content = state.content as any,
        resources = content.tableCreationResources,
        policies = content.noteShapes;
      const doc = options.root.ownerDocument;
      const view = doc.createElement('dialog');
      dialog = view;
      const title = doc.createElement('h2');
      title.textContent = kind === 'foot' ? '각주 넣기' : '미주 넣기';
      view.append(title);
      const form = doc.createElement('form');
      const body = doc.createElement('textarea');
      body.rows = 5;
      body.setAttribute('aria-label', '주석 본문');
      form.append(body);
      // Product insertion preset uses explicit IDs from the validated Native inventory.
      // Missing definitions refuse insertion; no numeric zero fallback or host rewrite.
      const observedResources = {
        paragraph: resources.paragraph?.[0],
        character: resources.character?.[0],
        style: resources.style?.[0],
      };
      if (
        !Object.values(observedResources).every(
          (id) => Number.isInteger(id) && id >= 0 && id <= 0xffffffff,
        )
      )
        throw Error('MissingNoteResources');
      const info = doc.createElement('p');
      info.textContent = '번호는 문서의 연속 번호 설정을 따릅니다. 새 번호 모양은 1) 형식입니다.';
      form.append(info);
      const error = doc.createElement('p');
      error.setAttribute('role', 'status');
      form.append(error);
      const submit = doc.createElement('button');
      submit.type = 'submit';
      submit.textContent = '넣기';
      form.append(submit);
      const cancel = doc.createElement('button');
      cancel.type = 'button';
      cancel.textContent = '취소';
      cancel.onclick = () => {
        if (!pending) {
          close();
          options.onClose();
        }
      };
      form.append(cancel);
      const current = () => editor.getEditorState() === state && captured.current();
      const unsubscribe = editor.registerStateListener(() => {
        if (!pending && !current()) {
          submit.disabled = true;
          error.textContent = '입력 위치가 바뀌었습니다. 창을 다시 열어주세요.';
        }
      });
      stopView = unsubscribe;
      const oldClose = close;
      view.addEventListener('cancel', (event) => {
        event.preventDefault();
        if (!pending) {
          unsubscribe();
          oldClose();
          options.onClose();
        }
      });
      cancel.onclick = () => {
        if (!pending) {
          unsubscribe();
          oldClose();
          options.onClose();
        }
      };
      form.onsubmit = (event) => {
        event.preventDefault();
        if (pending || !current() || disposed) {
          submit.disabled = true;
          return;
        }
        const format = {
          number_type: 'DIGIT',
          user_char: '',
          prefix_char: '',
          suffix_char: ')',
          superscript: false,
        };
        const initial_policies: NonNullable<NoteInsertOptions['initial_policies']>[number][] = [];
        for (let section = 0; section < policies.sections; section++) {
          if (!policies.notes.some((p: any) => p.section_ordinal === section && p.kind === kind))
            initial_policies.push({
              section,
              shape: {
                format,
                line_length: kind === 'foot' ? -1 : -4,
                line_type: 'SOLID',
                line_width: '0.12 mm',
                line_color: '#000000',
                between_notes: kind === 'foot' ? 283 : 0,
                below_line: 567,
                above_line: 850,
                start: 1,
                place: kind === 'foot' ? 'EACH_COLUMN' : 'END_OF_DOCUMENT',
                beneath_text: false,
              },
            });
        }
        const value: NoteInsertOptions = {
          body: body.value,
          format,
          resources: { ...observedResources },
          initial_policies,
        };
        pending = true;
        submit.disabled = true;
        cancel.disabled = true;
        options.onPresentationChange();
        void editor
          .dispatchCommand(kind === 'foot' ? INSERT_FOOTNOTE_COMMAND : INSERT_ENDNOTE_COMMAND, {
            target,
            selectionVersion: state.stateVersion,
            options: value,
          })
          .then((result) => {
            if (disposed) return;
            options.onStatus(
              result.status === 'committed-with-snapshot'
                ? '주석을 넣었습니다. 주석 본문에 이어서 입력할 수 있습니다.'
                : result.status === 'committed-refresh-required'
                  ? '삽입 결과의 표시를 확인해야 합니다. 다시 넣지 마세요.'
                  : (result.error ?? '주석을 넣지 못했습니다.'),
            );
          })
          .catch((error) => {
            if (!disposed) options.onStatus('삽입 결과를 확인할 수 없습니다. ' + String(error));
          })
          .finally(() => {
            pending = false;
            unsubscribe();
            close();
            if (!disposed) options.onClose();
          });
      };
      view.append(form);
      options.root.append(view);
      view.showModal();
      body.focus();
    } catch (error) {
      close();
      if (!disposed) options.onStatus('현재 위치에 주석을 넣을 수 없습니다. ' + String(error));
    } finally {
      opening = false;
      if (!disposed) options.onPresentationChange();
    }
  }
  return {
    presentation,
    open,
    dispose() {
      disposed = true;
      close();
    },
  };
}
