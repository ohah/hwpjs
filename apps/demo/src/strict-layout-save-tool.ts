import type { HeadlessEditor, SaveResult } from '@hwpjs/core';
import type { createMeasuredPlainLayoutSaver } from '@hwpjs/core/runtime';
import { documentDownloadName } from './download-name.ts';

type Saver = ReturnType<typeof createMeasuredPlainLayoutSaver>;
export function mountStrictLayoutSaveTool({
  root,
  editor,
  saver,
  filename,
  consent,
}: {
  root: HTMLElement;
  editor: HeadlessEditor;
  saver: Saver;
  filename(): string;
  consent(): boolean;
}) {
  const doc = root.ownerDocument,
    panel = doc.createElement('details'),
    summary = doc.createElement('summary');
  panel.dataset.role = 'strict-layout-save-options';
  summary.textContent = '글꼴 측정 후 HWP 저장';
  const description = doc.createElement('p');
  description.textContent =
    '원문 글꼴 파일로 단일 쪽의 일반 본문을 측정합니다. 표·차트·각주·줄 자동 넘김은 지원하지 않습니다.';
  const label = doc.createElement('label'),
    font = doc.createElement('input');
  font.type = 'file';
  font.accept = '.ttf,.otf,.woff,.woff2';
  font.dataset.role = 'strict-layout-font';
  label.append(doc.createTextNode('원문과 일치하는 글꼴 파일 '), font);
  const button = doc.createElement('button'),
    status = doc.createElement('span');
  button.type = 'button';
  button.textContent = '글꼴 측정 후 HWP 저장';
  button.dataset.role = 'strict-layout-save';
  status.dataset.role = 'strict-layout-save-status';
  status.setAttribute('role', 'status');
  panel.append(summary, description, label, button, status);
  root.append(panel);
  let closed = false,
    busy = false,
    operation = 0,
    abort: AbortController | undefined;
  let documentId = editor.getEditorState().documentId;
  const refresh = () => {
    const state = editor.getEditorState();
    if (state.documentId !== documentId || state.status === 'disposed') {
      documentId = state.documentId;
      operation++;
      abort?.abort();
      font.value = '';
      button.dataset.state = 'idle';
      status.textContent = '';
    }
    const hwp5 = (state.content as { format?: string } | undefined)?.format === 'hwp5';
    button.disabled = closed || busy || !saver.available();
    font.disabled = closed || busy || !hwp5 || state.status !== 'ready';
    if (!busy)
      button.title = button.disabled ? 'HWP5 일반 본문과 정상 편집 이력이 필요합니다.' : '';
  };
  const changed = () => {
    operation++;
    abort?.abort();
    saver.clearFont();
    button.dataset.state = 'cancelled';
    status.textContent = '글꼴 파일을 선택했습니다. 원문 글꼴과 일치해야 합니다.';
  };
  const click = async () => {
    if (closed || busy || !saver.available()) return;
    const current = ++operation,
      name = filename(),
      allowUnprotectedOutput = consent();
    abort = new AbortController();
    busy = true;
    refresh();
    button.dataset.state = 'measuring';
    status.textContent = '본문과 글꼴을 측정하고 있습니다.';
    let recoverFontFocus = false;
    try {
      await saver.save({
        fontFile: font.files?.[0],
        signal: abort.signal,
        allowUnprotectedOutput,
        publish(result: SaveResult) {
          if (closed || current !== operation) throw Error('StrictLayoutMeasurementExpired');
          if (allowUnprotectedOutput && !consent()) throw Error('UnprotectedOutputConsentExpired');
          const bytes = new Uint8Array(result.bytes.length);
          bytes.set(result.bytes);
          const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
          const link = doc.createElement('a');
          link.href = url;
          link.download = documentDownloadName(name, result.format);
          try {
            root.append(link);
            link.click();
          } finally {
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }
        },
      });
      if (!closed && current === operation) {
        button.dataset.state = 'saved';
        status.textContent = '측정값으로 편집본을 저장했습니다.';
      }
    } catch (error) {
      if (!closed && current === operation) {
        button.dataset.state = 'failed';
        if (error instanceof Error && error.message === 'StrictFontDecodeFailed') {
          recoverFontFocus = true;
          status.textContent =
            '선택한 글꼴 파일을 브라우저가 읽지 못했습니다. 문서 글꼴과 일치하는 웹 호환 글꼴 파일을 선택하세요. 파일 메뉴의 기존 저장 옵션도 직접 선택할 수 있습니다.';
        } else {
          status.textContent = `측정 저장 실패: ${error instanceof Error ? error.message : String(error)}`;
        }
      }
    } finally {
      busy = false;
      abort = undefined;
      if (!closed) {
        refresh();
        if (recoverFontFocus && current === operation && !font.disabled) font.focus();
      }
    }
  };
  font.addEventListener('change', changed);
  button.addEventListener('click', click);
  const unsubscribe = editor.registerStateListener(refresh);
  refresh();
  return {
    dispose() {
      if (closed) return;
      closed = true;
      operation++;
      abort?.abort();
      saver.dispose();
      unsubscribe();
      font.removeEventListener('change', changed);
      button.removeEventListener('click', click);
      panel.remove();
    },
  };
}
