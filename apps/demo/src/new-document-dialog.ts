import { DEMO_COMMAND_REGISTRY } from './command-support.ts';
export type NewDocumentFormat = 'hwp5' | 'hwpx';
export function newDocumentName(format: NewDocumentFormat): string {
  return format === 'hwp5' ? '새문서.hwp' : '새문서.hwpx';
}
/** HWPX is the initial choice; Escape, close and replacement all cancel. */
export function askNewDocumentFormat(
  root: HTMLElement,
  signal: AbortSignal,
): Promise<NewDocumentFormat | undefined> {
  if (signal.aborted) return Promise.resolve(undefined);
  const doc = root.ownerDocument,
    dialog = doc.createElement('dialog');
  dialog.dataset.role = 'new-document-dialog';
  dialog.setAttribute('aria-label', DEMO_COMMAND_REGISTRY['new-document'].label);
  const label = doc.createElement('label'),
    select = doc.createElement('select');
  label.textContent = '문서 형식';
  select.dataset.role = 'new-document-format';
  for (const [value, text] of [
    ['hwpx', 'HWPX'],
    ['hwp5', 'HWP5'],
  ]) {
    const option = doc.createElement('option');
    option.value = value;
    option.textContent = text;
    select.append(option);
  }
  select.value = 'hwpx';
  label.append(select);
  const accept = doc.createElement('button'),
    cancel = doc.createElement('button');
  accept.type = cancel.type = 'button';
  accept.dataset.role = 'create-new-document';
  cancel.dataset.role = 'cancel-new-document';
  accept.textContent = '만들기';
  cancel.textContent = '취소';
  dialog.append(label, accept, cancel);
  root.append(dialog);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (format?: NewDocumentFormat) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', aborted);
      dialog.close();
      dialog.remove();
      resolve(format);
    };
    const aborted = () => finish();
    signal.addEventListener('abort', aborted, { once: true });
    accept.addEventListener('click', () => finish(select.value === 'hwp5' ? 'hwp5' : 'hwpx'));
    cancel.addEventListener('click', () => finish());
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      finish();
    });
    dialog.addEventListener('close', () => finish());
    dialog.showModal();
    select.focus();
  });
}
