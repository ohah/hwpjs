import { getSelectionFormatting, INSERT_DOCUMENT_COMMAND } from '@hwpjs/core';
import type { HeadlessEditor, SelectionTarget } from '@hwpjs/core';
import { createDialogLayer } from './dialog-layer.ts';
import type { ActionAvailability } from './shell-contract.ts';

const title = 'HWPX 문서 끼워 넣기';
const profile =
  '한 구역의 일반 본문 HWPX를 끼워 넣을 수 있습니다. 표·그림 등 지원 범위 밖의 내용이 있으면 파일 전체가 거부됩니다.';
const stale = '끼워 넣을 위치가 바뀌었습니다. 창을 닫고 커서를 다시 선택하세요.';
type State = ReturnType<HeadlessEditor['getEditorState']>;

function targetReason(state: State, target: SelectionTarget | null) {
  if (state.status !== 'ready') return '편집할 문서를 먼저 열어주세요.';
  const content = state.content as { format?: string; readOnly?: boolean } | undefined;
  if (content?.format !== 'hwpx') return '편집 가능한 HWPX 문서에서 사용할 수 있습니다.';
  if (content.readOnly) return '읽기 전용 문서에는 끼워 넣을 수 없습니다.';
  if (!target || target.startUnit !== target.endUnit)
    return '본문에서 끼워 넣을 커서 위치를 선택하세요.';
  if (target.owner !== 'section:0:body') return '첫 구역의 일반 본문 커서에서 사용할 수 있습니다.';
}

function rejection(reason: string) {
  switch (reason) {
    case 'StaleTarget':
    case 'StaleDocumentInsertSelection':
      return stale;
    case 'CompositionBlocked':
      return '입력 반영이 끝난 뒤 다시 시도하세요.';
    case 'ReadOnlyDocument':
      return '읽기 전용 문서에는 끼워 넣을 수 없습니다.';
    case 'DocumentInsertionUnavailable':
    case 'HistoryProtocol2Required':
    case 'UnsupportedAtomicRuntime':
      return '현재 문서 엔진에서는 HWPX 문서 끼워 넣기를 지원하지 않습니다.';
    case 'UnsupportedDocumentInsertOwner':
    case 'DocumentInsertionRequiresCaret':
      return '끼워 넣을 수 있는 일반 본문 커서 위치를 선택하세요.';
    case 'DocumentInsertSourceLimitExceeded':
      return '파일 크기가 끼워 넣기 한도를 초과했습니다.';
    default:
      if (reason.startsWith('UnsupportedInsert'))
        return `지원하는 HWPX 범위에 맞지 않습니다. ${profile} (${reason})`;
      return `문서를 끼워 넣지 못했습니다. (${reason})`;
  }
}

export function createDocumentInsertTool(options: {
  root: HTMLElement;
  editor: Pick<
    HeadlessEditor,
    'getEditorState' | 'getDocumentInsertionCapabilities' | 'dispatchCommand'
  >;
  onStatus(message: string): void;
  onPresentationChange(): void;
}) {
  const { root, editor } = options;
  let active: { destroy(): void } | undefined;
  let disposed = false;
  const presentation = (state: State, target: SelectionTarget | null): ActionAvailability => {
    const reason = active
      ? '문서 끼워 넣기 창이 열려 있습니다.'
      : typeof editor.getDocumentInsertionCapabilities !== 'function'
        ? '현재 문서 엔진에서는 HWPX 문서 끼워 넣기를 지원하지 않습니다.'
        : targetReason(state, target);
    return { enabled: !disposed && reason === undefined, reason };
  };
  const close = () => {
    const owned = active;
    active = undefined;
    owned?.destroy();
    if (!disposed) options.onPresentationChange();
  };
  const open = () => {
    const state = editor.getEditorState();
    const target = getSelectionFormatting(state).target;
    const availability = presentation(state, target);
    if (!availability.enabled || !target) return;

    // The picker and asynchronous file read use the cursor admitted here.
    const selectionVersion = state.stateVersion;
    let applying = false;
    let maxSourceBytes = 0;
    const doc = root.ownerDocument;
    const layer = createDialogLayer(root, {
      role: 'document-insert-dialog',
      title,
      mode: 'modal',
      onDismiss: () => {
        if (!applying) close();
      },
    });
    const hint = doc.createElement('p');
    hint.textContent = profile;
    const label = doc.createElement('label');
    label.textContent = '끼워 넣을 HWPX 파일 ';
    const file = doc.createElement('input');
    file.type = 'file';
    file.accept = '.hwpx';
    file.dataset.role = 'document-insert-source';
    file.disabled = true;
    label.append(file);
    const status = doc.createElement('p');
    status.setAttribute('role', 'status');
    status.textContent = '현재 위치에서 끼워 넣을 수 있는지 확인하는 중입니다.';
    const submit = doc.createElement('button');
    submit.type = 'button';
    submit.dataset.role = 'document-insert-confirm';
    submit.textContent = '끼워 넣기';
    submit.disabled = true;
    const cancel = doc.createElement('button');
    cancel.type = 'button';
    cancel.textContent = '취소';
    cancel.addEventListener('click', () => {
      if (!applying) close();
    });
    layer.body.append(hint, label, status);
    layer.footer.append(submit, cancel);
    active = layer;
    const owned = () => !disposed && active === layer;
    const current = () => owned() && editor.getEditorState() === state;
    const fileError = (selected: File) =>
      !/\.hwpx$/i.test(selected.name)
        ? '확장자가 .hwpx인 파일을 선택하세요.'
        : selected.size === 0
          ? '빈 파일은 끼워 넣을 수 없습니다.'
          : selected.size > maxSourceBytes
            ? '파일 크기가 끼워 넣기 한도를 초과했습니다.'
            : undefined;
    file.addEventListener('change', () => {
      if (!owned() || applying || !maxSourceBytes) return;
      const selected = file.files?.[0];
      const error = !current() ? stale : selected && fileError(selected);
      submit.disabled = !selected || Boolean(error);
      status.textContent = error || (selected ? '선택한 파일을 끼워 넣을 수 있습니다.' : '');
    });
    const apply = async () => {
      const selected = file.files?.[0];
      if (!owned() || applying || !maxSourceBytes || !selected) return;
      const error = !current() ? stale : fileError(selected);
      if (error) {
        submit.disabled = true;
        status.textContent = error;
        return;
      }
      applying = file.disabled = submit.disabled = cancel.disabled = true;
      status.textContent = '선택한 문서를 끼워 넣는 중입니다.';
      try {
        let bytes: Uint8Array;
        try {
          bytes = new Uint8Array(await selected.arrayBuffer());
        } catch {
          if (owned()) status.textContent = '선택한 파일을 읽지 못했습니다.';
          return;
        }
        if (!owned()) return;
        if (!current()) {
          status.textContent = stale;
          return;
        }
        const result = await editor.dispatchCommand(INSERT_DOCUMENT_COMMAND, {
          target,
          selectionVersion,
          bytes,
        });
        if (!owned()) return;
        if (result.status === 'committed-with-snapshot') {
          close();
          options.onStatus('HWPX 문서를 끼워 넣었습니다.');
        } else if (result.status === 'committed-refresh-required') {
          close();
          options.onStatus(
            '문서가 반영됐습니다. 화면을 복구한 뒤 계속하세요. 같은 파일을 다시 넣지 마세요.',
          );
        } else {
          status.textContent = result.error
            ? rejection(result.error)
            : '문서에 적용된 변경이 없습니다.';
        }
      } catch (error) {
        if (owned())
          status.textContent = rejection(error instanceof Error ? error.message : String(error));
      } finally {
        if (owned()) {
          applying = cancel.disabled = false;
          file.disabled = !current();
          file.value = '';
        }
      }
    };
    submit.addEventListener('click', () => void apply());
    try {
      layer.show(cancel);
    } catch (error) {
      close();
      throw error;
    }
    options.onPresentationChange();
    void (async () => {
      try {
        const capability = await editor.getDocumentInsertionCapabilities({ token: state.token });
        if (!owned()) return;
        if (!current()) {
          status.textContent = stale;
        } else if (!capability.available) {
          status.textContent = rejection(capability.reason);
        } else {
          maxSourceBytes = capability.maxSourceBytes;
          file.disabled = false;
          status.textContent = '끼워 넣을 .hwpx 파일을 선택하세요.';
        }
      } catch (error) {
        if (owned())
          status.textContent = rejection(error instanceof Error ? error.message : String(error));
      }
    })();
  };
  return {
    presentation,
    open,
    dispose() {
      disposed = true;
      close();
    },
  };
}
