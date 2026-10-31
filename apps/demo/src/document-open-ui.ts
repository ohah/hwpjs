import { createDialogLayer } from './dialog-layer.ts';
import { openAvailability } from './shell-model.ts';
import type { DemoFixture, DemoShellState } from './shell-contract.ts';
import './document-open-ui.css';
export function exampleAvailability(entries: readonly DemoFixture[]) {
  const result = new Map<string, boolean>();
  for (const entry of entries) {
    if (
      !entry.id ||
      result.has(entry.id) ||
      (entry.available !== undefined && typeof entry.available !== 'boolean')
    )
      throw TypeError('InvalidDemoFixtureCatalog');
    result.set(entry.id, entry.available !== false);
  }
  return result;
}
export interface DocumentOpenUIOptions {
  readonly id: string;
  readonly fixtures: readonly DemoFixture[];
  readonly getState: () => DemoShellState;
  readonly fileConnected: boolean;
  readonly fixtureConnected: boolean;
  readonly onFile: (file: File) => void;
  readonly onFixture: (id: string) => void;
  readonly onSelected: () => void;
}
/** File chooser affordance and example view only. Admission/bytes/passwords stay outside. */
export function createDocumentOpenUI(root: HTMLElement, options: DocumentOpenUIOptions) {
  const doc = root.ownerDocument;
  let closed = false,
    availability = exampleAvailability(options.fixtures);
  const removals: (() => void)[] = [];
  const listen = (node: EventTarget, type: string, fn: (event: Event) => void) => {
    node.addEventListener(type, fn);
    removals.push(() => node.removeEventListener(type, fn));
  };
  const button = (text: string, role: string) => {
    const node = doc.createElement('button');
    node.type = 'button';
    node.className = 'hwp-demo-button';
    node.textContent = text;
    node.dataset.role = role;
    return node;
  };
  const fileAction = button('열기…', 'open-document'),
    examplesAction = button('예제 문서…', 'open-examples');
  const directFileAction = button('파일열기', 'open-document-direct');
  directFileAction.className += ' hwp-demo-open-file';
  const fileActions = [fileAction, directFileAction];
  const file = doc.createElement('input');
  file.type = 'file';
  file.accept = '.hwp,.hwpx';
  file.id = options.id + '-file';
  file.dataset.role = 'file-picker';
  file.hidden = true;
  file.setAttribute('aria-label', '문서 파일');
  const fileReason = doc.createElement('span');
  fileReason.className = 'hwp-demo-sr';
  fileReason.id = options.id + '-file-reason';
  for (const action of fileActions) action.setAttribute('aria-describedby', fileReason.id);
  const state = () => options.getState();
  const hideExamples = () => {
    if (layer.element.open) layer.element.close();
  };
  const layer = createDialogLayer(root, {
    role: 'example-documents',
    title: '예제 문서',
    mode: 'modal',
    onDismiss: hideExamples,
  });
  layer.element.className += ' hwp-example-dialog';
  // Closed dialog remains attached for stable field identity and async catalog refresh.
  root.append(layer.element);
  const label = doc.createElement('label'),
    fixture = doc.createElement('select');
  label.textContent = '문서를 선택하세요.';
  fixture.id = options.id + '-fixture';
  label.htmlFor = fixture.id;
  fixture.dataset.role = 'fixture-picker';
  fixture.setAttribute('aria-label', '예제 문서');
  const fixtureReason = doc.createElement('p');
  fixtureReason.id = options.id + '-fixture-reason';
  fixtureReason.setAttribute('role', 'status');
  fixture.setAttribute('aria-describedby', fixtureReason.id);
  examplesAction.setAttribute('aria-describedby', fixtureReason.id);
  const fixtureOpen = button('예제 열기', 'open-selected-example'),
    cancel = button('취소', 'cancel-examples');
  fixtureOpen.setAttribute('aria-describedby', fixtureReason.id);
  layer.body.append(label, fixture, fixtureReason);
  layer.footer.append(fixtureOpen, cancel);
  const render = (entries: readonly DemoFixture[]) => {
    const selected = fixture.value;
    const nodes = entries.map((entry) => {
      const node = doc.createElement('option'),
        available = availability.get(entry.id) === true;
      node.value = entry.id;
      node.disabled = !available;
      node.textContent = (entry.label || entry.name) + (available ? '' : ' (파일 없음)');
      return node;
    });
    fixture.replaceChildren(...nodes);
    fixture.value =
      availability.get(selected) === true
        ? selected
        : (entries.find((entry) => availability.get(entry.id) === true)?.id ?? '');
  };
  render(options.fixtures);
  const update = () => {
    if (closed) return;
    const current = state(),
      canFile = openAvailability(current.openFile, current.busy, options.fileConnected),
      canFixture = openAvailability(current.openFixture, current.busy, options.fixtureConnected),
      any = [...availability.values()].some(Boolean);
    file.disabled = !canFile.enabled;
    fileReason.textContent = canFile.enabled ? '' : canFile.reason || '파일 열기 불가';
    for (const action of fileActions) {
      action.disabled = !canFile.enabled;
      action.title = fileReason.textContent;
    }
    examplesAction.disabled = fixture.disabled = !canFixture.enabled || !any;
    fixtureOpen.disabled = !canFixture.enabled || availability.get(fixture.value) !== true;
    fixtureReason.textContent = !any
      ? '사용 가능한 예제 파일이 없습니다.'
      : !canFixture.enabled
        ? canFixture.reason || '예제 열기 불가'
        : availability.get(fixture.value) !== true
          ? '선택한 예제 파일이 없습니다.'
          : '';
    examplesAction.title = fixture.title = fixtureOpen.title = fixtureReason.textContent;
  };
  // 두 진입은 같은 동기 사용자 활성화 경로를 사용한다.
  const chooseFile = () => {
    if (closed) return;
    const current = state();
    if (!openAvailability(current.openFile, current.busy, options.fileConnected).enabled) return;
    file.click();
  };
  for (const action of fileActions) listen(action, 'click', chooseFile);
  listen(file, 'change', () => {
    if (closed) return;
    const current = state(),
      allowed = openAvailability(current.openFile, current.busy, options.fileConnected),
      selected = file.files?.[0];
    file.value = '';
    if (!allowed.enabled || !selected) return;
    options.onSelected();
    options.onFile(selected);
  });
  listen(examplesAction, 'click', () => {
    if (closed) return;
    update();
    if (examplesAction.disabled || doc.querySelector?.('dialog:modal')) return;
    layer.show(fixture);
  });
  listen(fixture, 'change', update);
  listen(fixtureOpen, 'click', () => {
    if (closed || availability.get(fixture.value) !== true) return;
    const current = state();
    if (!openAvailability(current.openFixture, current.busy, options.fixtureConnected).enabled)
      return;
    file.value = '';
    const id = fixture.value;
    hideExamples();
    options.onSelected();
    options.onFixture(id);
  });
  listen(cancel, 'click', hideExamples);
  return {
    directFileAction,
    fileAction,
    examplesAction,
    file,
    fileReason,
    containsExampleTarget: (node: Node) => layer.element.contains(node),
    update,
    setFixtures(entries: readonly DemoFixture[]) {
      if (closed) return;
      const next = exampleAvailability(entries);
      availability = next;
      render(entries);
      update();
    },
    destroy() {
      if (closed) return;
      closed = true;
      for (const remove of removals.splice(0)) remove();
      layer.destroy();
      file.remove();
    },
  };
}
