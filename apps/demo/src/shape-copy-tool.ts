import type { HeadlessEditor } from '@hwpjs/core';
import { getSelectionFormatting } from '@hwpjs/core';
import { createDialogLayer } from './dialog-layer.ts';
import { createShapeCopyPort } from './shape-copy-port.ts';
import { createCellShapeCopyPort, type CellCopySelection } from './shape-copy-cell-port.ts';
export function createShapeCopyTool(o: {
  getCellSelection?: () => CellCopySelection | null;
  hasCellBlock?: () => boolean;
  root: HTMLElement;
  editor: HeadlessEditor;
  onStatus: (text: string) => void;
  onPresentationChange: () => void;
  onClose: () => void;
}) {
  const doc = o.root.ownerDocument,
    port = createShapeCopyPort(o.editor),
    cellPort = createCellShapeCopyPort(o.editor);
  let copiedMode: 'body' | 'cell' = 'body';
  const inCell = () => {
    const state = o.editor.getEditorState(),
      t = getSelectionFormatting(state).target;
    return !!(state.content as any)?.paragraphs?.find(
      (p: any) => p.section === t?.section && p.paragraph === t?.paragraph,
    )?.tableCell;
  };
  let closed = false,
    activeDialog: (() => void) | undefined,
    busy = false,
    key229 = false;
  const composing = new Set<EventTarget>();
  const events = new AbortController();
  const active = () => {
    for (const node of composing) if ((node as Node).isConnected === false) composing.delete(node);
    return !closed && !key229 && composing.size === 0;
  };
  o.root.addEventListener(
    'compositionstart',
    (e) => {
      if (e.target) composing.add(e.target);
      o.onPresentationChange();
    },
    { capture: true, signal: events.signal },
  );
  o.root.addEventListener(
    'compositionend',
    (e) => {
      if (e.target) composing.delete(e.target);
      key229 = false;
      o.onPresentationChange();
    },
    { capture: true, signal: events.signal },
  );
  o.root.addEventListener(
    'keydown',
    (e) => {
      if ((e as KeyboardEvent).keyCode === 229 || (e as KeyboardEvent).isComposing) key229 = true;
    },
    { capture: true, signal: events.signal },
  );
  o.root.addEventListener(
    'keyup',
    () => {
      key229 = false;
      o.onPresentationChange();
    },
    { capture: true, signal: events.signal },
  );
  const note = (text: string) => {
    if (!closed) o.onStatus(text);
  };
  const unsubscribe = o.editor.registerStateListener(() => {
    cellPort.presentation();
    port.presentation(); // Discard a previous document's copied scalar DTO.
    o.onPresentationChange();
  });
  const errorText = () =>
    '현재 선택에서 모양을 복사하거나 적용할 수 없습니다. 문서·선택·지원 항목을 다시 확인하세요.';
  return {
    presentation() {
      const reason = !active()
        ? '한글 입력 조합을 마친 뒤 사용하세요.'
        : busy || activeDialog || doc.querySelector('dialog:modal')
          ? '열린 창이나 진행 중인 작업을 먼저 마치세요.'
          : null;
      if (reason) return { enabled: false, reason };
      if (o.hasCellBlock?.()) {
        if (copiedMode !== 'cell' || !cellPort.hasCopy() || !o.getCellSelection?.())
          return { enabled: false, reason: '먼저 원본 셀의 모양을 복사하세요.' };
        return cellPort.presentation();
      }
      return inCell() ? cellPort.presentation() : port.presentation();
    },
    async action(command: string) {
      if (command !== 'format-copy') return false;
      if (!this.presentation().enabled) {
        note(errorText());
        return true;
      }
      const state = o.editor.getEditorState(),
        target = getSelectionFormatting(state).target;
      if (!target) {
        note(errorText());
        return true;
      }
      const cellMode = inCell(),
        cellSelection = o.getCellSelection?.();
      if (target.startUnit !== target.endUnit || o.hasCellBlock?.()) {
        busy = true;
        o.onPresentationChange();
        try {
          if (o.hasCellBlock?.() && !cellSelection) throw Error('CellSelectionUnavailable');
          const result =
            copiedMode === 'cell' && cellMode
              ? await cellPort.apply(active, cellSelection)
              : await port.apply(active);
          if (result.status === 'committed-with-snapshot' || result.status === 'known-no-op') {
            note('선택한 지원 항목의 모양을 적용했습니다.');
            if (active() && 'state' in result && o.editor.getEditorState() === result.state)
              o.onClose();
          } else if (result.status === 'committed-refresh-required')
            note('모양이 반영됐습니다. 화면을 새로 확인한 뒤 계속하세요.');
          else if (result.error === 'ProtectedCell')
            note('보호된 셀에는 모양을 적용할 수 없습니다.');
          else if (result.error === 'CellFillTargetAlphaUnavailable')
            note('배경이 없거나 확인할 수 없는 셀에는 이 채우기를 아직 복사할 수 없습니다.');
          else note(errorText());
        } catch {
          note(errorText());
        } finally {
          busy = false;
          o.onPresentationChange();
        }
        return true;
      }
      let disposed = false,
        loading = true,
        capture: any;
      const current = () => active() && !disposed && o.editor.getEditorState() === state;
      const layer = createDialogLayer(o.root, {
        role: 'shape-copy',
        title: '모양 복사',
        mode: 'modal',
        onDismiss: () => {
          if (active()) close();
        },
      });
      const text = doc.createElement('p');
      text.textContent =
        '복사할 항목을 선택하고 [복사]를 누르세요. 적용할 부분을 블록으로 선택한 뒤 모양 복사를 다시 실행하세요.';
      const fields = doc.createElement('div'),
        notice = doc.createElement('p');
      notice.setAttribute('role', 'status');
      notice.textContent = '모양을 불러오는 중입니다.';
      layer.body.append(text, fields, notice);
      let mode: 'character' | 'paragraph' | 'both' = 'character';
      const sections = new Map<string, HTMLElement>();
      const modes = doc.createElement('fieldset'),
        modesTitle = doc.createElement('legend');
      modesTitle.textContent = cellMode ? '셀 모양만 복사' : '본문 모양 복사';
      modes.hidden = cellMode;
      modes.append(modesTitle);
      fields.append(modes);
      for (const [value, labelText] of [
        ['character', '글자 모양'],
        ['paragraph', '문단 모양'],
        ['both', '글자 모양과 문단 모양 둘 다 복사'],
      ] as const) {
        const label = doc.createElement('label'),
          radio = doc.createElement('input');
        radio.type = 'radio';
        radio.name = 'shape-copy-mode';
        radio.value = value;
        radio.checked = value === mode;
        radio.dataset.role = 'shape-copy-mode-' + value;
        label.append(radio, doc.createTextNode(labelText));
        modes.append(label);
        radio.addEventListener('change', () => {
          if (radio.checked) {
            mode = value;
            render();
          }
        });
      }
      for (const name of ['글자 스타일', '문단 스타일']) {
        const label = doc.createElement('label'),
          input = doc.createElement('input');
        input.type = 'radio';
        input.disabled = true;
        input.title = '아직 지원하지 않습니다.';
        label.append(input, doc.createTextNode(name + ' — 아직 지원하지 않습니다.'));
        modes.append(label);
      }
      const controls: {
        input: HTMLInputElement;
        id: string;
        group: 'character' | 'paragraph' | 'cell';
      }[] = [];
      const selected = () =>
        controls.filter(
          (c) =>
            c.input.checked &&
            !c.input.disabled &&
            (cellMode ? c.group === 'cell' : mode === 'both' || c.group === mode),
        );
      const copy = doc.createElement('button'),
        cancel = doc.createElement('button');
      copy.type = cancel.type = 'button';
      copy.textContent = '복사';
      cancel.textContent = '취소';
      copy.dataset.role = 'shape-copy-confirm';
      cancel.dataset.role = 'shape-copy-cancel';
      layer.footer.append(copy, cancel);
      const render = () => {
        copy.disabled = loading || !current() || !selected().length;
        for (const [group, section] of sections)
          section.hidden = cellMode ? group !== 'cell' : mode !== 'both' && group !== mode;
      };
      function close() {
        if (disposed) return;
        disposed = true;
        unlisten();
        layer.destroy();
        activeDialog = undefined;
        if (!closed) {
          o.onClose();
          o.onPresentationChange();
        }
      }
      const unlisten = o.editor.registerStateListener(() => {
        notice.textContent = '문서나 선택이 바뀌었습니다. 다시 여세요.';
        render();
      });
      activeDialog = close;
      cancel.addEventListener('click', () => {
        if (active()) close();
      });
      layer.element.addEventListener('compositionstart', (e) => {
        if (e.target) composing.add(e.target);
        render();
      });
      layer.element.addEventListener('compositionend', (e) => {
        if (e.target) composing.delete(e.target);
        key229 = false;
        render();
      });
      layer.element.addEventListener('keydown', (e) => {
        if ((e as KeyboardEvent).keyCode === 229 || (e as KeyboardEvent).isComposing) {
          key229 = true;
          render();
        }
      });
      layer.element.addEventListener('keyup', () => {
        key229 = false;
        render();
      });
      copy.addEventListener('click', () => {
        if (copy.disabled || !capture || !current()) return;
        try {
          (cellMode ? cellPort : port).remember(
            capture,
            selected().map((c) => c.id),
            current,
          );
          copiedMode = cellMode ? 'cell' : 'body';
          if (cellMode) port.clear();
          else cellPort.clear();
          note(
            cellMode
              ? '셀 모양을 기억했습니다. 대상 셀을 블록으로 선택한 뒤 모양 복사를 다시 실행하세요.'
              : '선택한 모양 항목을 기억했습니다. 대상 본문을 블록으로 선택한 뒤 모양 복사를 다시 실행하세요.',
          );
          close();
        } catch {
          notice.textContent = errorText();
          render();
        }
      });
      render();
      layer.show(cancel);
      o.onPresentationChange();
      try {
        capture = await (cellMode ? cellPort : port).readSource(current);
        if (!current()) return true;
        for (const group of (cellMode ? ['cell'] : ['character', 'paragraph']) as (
          | 'cell'
          | 'character'
          | 'paragraph'
        )[]) {
          const section = doc.createElement('fieldset'),
            legend = doc.createElement('legend');
          legend.textContent =
            group === 'cell' ? '셀 모양 복사' : group === 'character' ? '글자 모양' : '문단 모양';
          section.append(legend);
          for (const option of capture.options.filter((d: any) => d.group === group)) {
            const label = doc.createElement('label'),
              input = doc.createElement('input');
            input.type = 'checkbox';
            input.disabled = !option.enabled;
            input.checked = false;
            input.dataset.shapeCopyField = option.id;
            input.setAttribute('aria-label', option.label);
            label.append(
              input,
              doc.createTextNode(option.label + (option.enabled ? '' : ' — ' + option.reason)),
            );
            input.addEventListener('change', render);
            section.append(label);
            controls.push({ input, id: option.id, group });
          }
          if (group === 'cell') {
            const limited = doc.createElement('p');
            limited.textContent =
              '셀 속성과 본문 모양을 함께 복사하는 기능은 아직 지원하지 않습니다.';
            section.append(limited);
          }
          if (group === 'paragraph')
            for (const name of ['탭 설정', '문단 번호', '개요']) {
              const label = doc.createElement('label'),
                input = doc.createElement('input');
              input.type = 'checkbox';
              input.disabled = true;
              input.title = '아직 지원하지 않습니다.';
              label.append(input, doc.createTextNode(name + ' — 아직 지원하지 않습니다.'));
              section.append(label);
            }
          sections.set(group, section);
          fields.append(section);
        }
        notice.textContent = '체크한 항목만 복사합니다.';
      } catch {
        if (!disposed) notice.textContent = errorText();
      } finally {
        loading = false;
        if (!disposed) render();
      }
      return true;
    },
    dispose() {
      closed = true;
      activeDialog?.();
      unsubscribe();
      events.abort();
      composing.clear();
      port.dispose();
      cellPort.dispose();
    },
  };
}
