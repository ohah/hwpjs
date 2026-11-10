import { createDialogLayer } from './dialog-layer.ts';
import './text-tools-dialog.css';
let searchInstance = 0;
export type SearchDirection = 'down' | 'up' | 'all';
export interface SearchDraft {
  query: string;
  replacement: string;
  direction: SearchDirection;
}
export function createTextToolsDialog(
  root: HTMLElement,
  options: {
    replace: boolean;
    draft: SearchDraft;
    onDismiss: () => void;
    onChange: () => void;
    onFind: (continuing?: boolean) => void;
    onReplace: () => void;
    onReplaceAll?: () => void;
    onMode: (replace: boolean) => void;
  },
) {
  const doc = root.ownerDocument,
    layer = createDialogLayer(root, {
      role: 'text-search',
      title: options.replace ? '찾아 바꾸기' : '찾기',
      mode: 'modeless',
      onDismiss: options.onDismiss,
    });
  let replace = options.replace,
    busy = false,
    destroyed = false,
    replaceAllAvailable = false;
  const listen = <K extends keyof HTMLElementEventMap>(
    node: HTMLElement,
    type: K,
    handler: (event: HTMLElementEventMap[K]) => void,
  ) => {
    node.addEventListener(type, (event) => {
      if (!destroyed) handler(event);
    });
  };
  const grid = doc.createElement('div'),
    fields = doc.createElement('div'),
    actions = doc.createElement('div');
  grid.className = 'hwp-search-grid';
  fields.className = 'hwp-search-fields';
  actions.className = 'hwp-search-actions';
  const row = (label: string, role: string) => {
    const wrap = doc.createElement('label'),
      text = doc.createElement('span'),
      input = doc.createElement('input');
    wrap.className = 'hwp-search-field';
    text.textContent = label;
    input.type = 'text';
    input.autocomplete = 'off';
    input.setAttribute('aria-label', label);
    input.dataset.role = role;
    wrap.append(text, input);
    return { wrap, input };
  };
  const query = row('찾을 내용', 'search-query'),
    replacement = row('바꿀 내용', 'search-replacement');
  query.input.value = options.draft.query;
  replacement.input.value = options.draft.replacement;
  const directions = doc.createElement('fieldset'),
    legend = doc.createElement('legend');
  legend.textContent = '찾을 방향';
  directions.append(legend);
  const radios: HTMLInputElement[] = [];
  let direction = options.draft.direction;
  const directionName = 'hwpjs-search-direction-' + ++searchInstance;
  for (const [value, label] of [
    ['down', '아래로'],
    ['up', '위로'],
    ['all', '문서 전체'],
  ] as const) {
    const wrap = doc.createElement('label'),
      radio = doc.createElement('input');
    radio.type = 'radio';
    radio.name = directionName;
    radio.dataset.role = 'search-direction-' + value;
    radio.value = value;
    radio.checked = value === direction;
    listen(radio, 'change', () => {
      if (radio.checked) {
        direction = value;
        for (const other of radios) other.checked = other === radio;
        options.onChange();
      }
    });
    wrap.append(radio, doc.createTextNode(label));
    radios.push(radio);
    directions.append(wrap);
  }
  const button = (label: string, role: string, click: () => void) => {
    const node = doc.createElement('button');
    node.type = 'button';
    node.textContent = label;
    node.dataset.role = role;
    listen(node, 'click', click);
    return node;
  };
  const next = button('다음 찾기', 'find-next', () => options.onFind()),
    continuation = button('계속 찾기', 'continue-search', () => options.onFind(true)),
    apply = button('선택 바꾸기', 'replace-selection', options.onReplace),
    replaceAll = button('모두 바꾸기', 'replace-all', () => {
      if (!replaceAll.disabled) options.onReplaceAll?.();
    }),
    close = button('닫기', 'close-text-tool', options.onDismiss);
  replaceAll.disabled = true;
  replaceAll.setAttribute('title', '현재 엔진과 문서의 지원 범위를 확인 중입니다.');
  continuation.hidden = true;
  const message = doc.createElement('p');
  message.dataset.role = 'search-status';
  message.setAttribute('role', 'status');
  message.setAttribute('aria-live', 'polite');
  message.className = 'hwp-search-message';
  message.textContent = '현재 불러온 내용에서 찾습니다.';
  const limit = doc.createElement('p');
  const limitId = directionName + '-limit';
  limit.setAttribute('id', limitId);
  limit.className = 'hwp-search-limit';
  limit.textContent =
    '찾기는 현재 불러온 표시 범위에서 수행합니다. 전체 바꾸기의 지원 범위를 확인 중입니다.';
  replaceAll.setAttribute('aria-describedby', limitId);
  fields.append(query.wrap, replacement.wrap, directions);
  actions.append(apply, next, replaceAll, continuation, close);
  grid.append(fields, actions);
  layer.body.append(grid, message, limit);
  const changed = () => options.onChange();
  listen(query.input, 'input', changed);
  listen(replacement.input, 'input', changed);
  const findOnEnter = (event: KeyboardEvent) => {
    if (event.key === 'Enter' && !event.isComposing && event.keyCode !== 229) {
      event.preventDefault();
      if (!next.disabled) options.onFind();
    }
  };
  listen(query.input, 'keydown', findOnEnter);
  listen(replacement.input, 'keydown', findOnEnter);
  const refresh = () => {
    replacement.wrap.hidden = !replace;
    apply.hidden = !replace;
    replaceAll.hidden = !replace;
    layer.setTitle(replace ? '찾아 바꾸기' : '찾기');
    for (const node of [query.input, replacement.input, ...radios, next, apply, continuation])
      node.disabled = busy;
    next.disabled = busy || !query.input.value;
    apply.disabled = busy || !query.input.value;
    replaceAll.disabled =
      busy || !query.input.value || !replaceAllAvailable || !options.onReplaceAll;
  };
  listen(query.input, 'input', refresh);
  refresh();
  return {
    element: layer.element,
    show() {
      layer.show(query.input);
    },
    focus() {
      query.input.focus();
    },
    setMode(value: boolean) {
      replace = value;
      refresh();
    },
    getDraft(): SearchDraft {
      return { query: query.input.value, replacement: replacement.input.value, direction };
    },
    setBusy(value: boolean) {
      busy = value;
      refresh();
    },
    setReplaceAllAvailable(value: boolean) {
      replaceAllAvailable = value;
      replaceAll.setAttribute(
        'title',
        value
          ? '문서 전체에서 일치하는 내용을 한 번에 바꿉니다.'
          : '현재 엔진 또는 문서에서는 전체 바꾸기를 사용할 수 없습니다.',
      );
      limit.textContent = value
        ? '찾기는 현재 표시 범위에서 수행합니다. 모두 바꾸기는 문서 전체를 검사하며 지원하지 않는 대상이 있으면 변경하지 않습니다.'
        : '찾기는 현재 표시 범위에서 수행합니다. 현재 엔진 또는 문서에서는 전체 바꾸기를 사용할 수 없습니다.';
      refresh();
    },
    setStatus(value: string) {
      message.textContent = value;
    },
    continueFromEnd(label?: string) {
      continuation.hidden = !label;
      if (label) continuation.textContent = label;
    },
    destroy() {
      destroyed = true;
      layer.destroy();
    },
  };
}
