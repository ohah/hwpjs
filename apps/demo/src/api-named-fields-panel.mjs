import { createNamedFieldInsertionPort } from './named-field-insertion-port.mjs';

const panelStyle = `
.api-named-fields {
  margin-block: 1rem 1.5rem;
  padding: 1rem;
  border: 1px solid color-mix(in srgb, currentColor 24%, transparent);
  border-radius: 0.5rem;
}

.api-named-fields h2 {
  margin-block: 0 0.75rem;
  font-size: 1.25rem;
}

.api-named-fields-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: 0.75rem;
  margin-block: 0.75rem;
}

.api-named-fields [hidden] {
  display: none;
}

.api-named-fields-controls label {
  display: grid;
  gap: 0.25rem;
}

.api-named-fields input[type='number'] {
  width: 10rem;
}

.api-named-fields-table {
  overflow: auto;
  max-height: 18rem;
}

.api-named-fields table {
  width: 100%;
  border-collapse: collapse;
  text-align: start;
}

.api-named-fields th,
.api-named-fields td {
  padding: 0.35rem 0.5rem;
  border-bottom: 1px solid color-mix(in srgb, currentColor 20%, transparent);
  text-align: start;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.api-named-fields [role='status'] {
  margin-block-end: 0;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
`;

const pageSize = 50;
const readMessages = {
  ambiguous: '같은 이름의 필드가 여러 개입니다. 목록에서 순번을 확인하세요.',
  incomplete: '부분 목록에서는 필드를 확정할 수 없습니다.',
  missing: '해당 이름과 순번의 필드가 없습니다.',
};

function selectorOf(name, occurrence) {
  if (!name.value.length) throw Error('필드 이름을 입력하세요.');
  if (occurrence.validity.badInput) throw Error('순번은 1 이상의 정수입니다.');
  if (occurrence.value === '') return { name: name.value };
  const order = occurrence.valueAsNumber;
  if (!Number.isSafeInteger(order) || order < 1) throw Error('순번은 1 이상의 정수입니다.');
  return { name: name.value, occurrence: order - 1 };
}

function valueLabel(value) {
  return value.status !== 'available' ? '조회 불가' : value.text === '' ? '빈 값' : value.text;
}

function sameView(token, state) {
  const current = state.token;
  return (
    token.editorId === current.editorId &&
    token.documentId === current.documentId &&
    token.generation === current.generation &&
    token.operationRevision === current.operationRevision &&
    token.viewRevision === current.viewRevision
  );
}

/** Mount beside the existing playground controls, with the same ready Core editor. */
export function mountNamedFieldsPanel(
  host,
  { editor, setNamedFieldValueCommand, createNamedFieldCommand, getSelectionClipboard },
) {
  const doc = host.ownerDocument;
  const panel = doc.createElement('section');
  panel.className = 'api-named-fields';
  panel.setAttribute('aria-label', '이름 필드');
  panel.innerHTML = `
    <style>${panelStyle}</style>
    <h2>이름 필드</h2>
    <div class="api-named-fields-controls">
      <label>HWPX 파일 열기 <input type="file" accept=".hwpx"></label>
      <button type="button" data-action="list">필드 목록 조회</button>
    </div>
    <p data-inventory-status>목록을 조회하세요.</p>
    <div class="api-named-fields-table" hidden>
      <table aria-label="이름 필드 목록">
        <thead><tr><th scope="col">이름</th><th scope="col">순번</th><th scope="col">값</th><th scope="col">쓰기</th></tr></thead>
        <tbody></tbody>
      </table>
    </div>
    <div class="api-named-fields-controls" data-pages hidden>
      <button type="button" data-action="previous">이전 목록</button>
      <span data-page-range></span>
      <button type="button" data-action="next">다음 목록</button>
    </div>
    <div class="api-named-fields-controls">
      <label>필드 이름 <input data-name type="text" autocomplete="off"></label>
      <label>이름 내 순번 (1부터) <input data-occurrence type="number" min="1" step="1"></label>
      <button type="button" data-action="read">필드 값 읽기</button>
    </div>
    <div class="api-named-fields-controls">
      <label>기대 기존 값 <input data-expected type="text" autocomplete="off"></label>
      <label>새 필드 값 <input data-value type="text" autocomplete="off"></label>
      <button type="button" data-action="write">필드 값 적용</button>
    </div>
    <fieldset data-create-fields>
      <legend>누름틀 만들기</legend>
      <p>본문에서 텍스트나 빈 위치를 선택한 뒤 현재 선택을 가져오세요.</p>
      <button type="button" data-action="capture-create">현재 선택 가져오기</button>
      <p data-create-selection>문서 본문에서 넣을 위치나 텍스트를 선택하세요.</p>
      <label>선택한 내용 <textarea data-create-text readonly rows="2"></textarea></label>
      <div class="api-named-fields-controls">
        <label>새 누름틀 이름 <input data-create-name type="text" autocomplete="off"></label>
        <label>안내문 <input data-create-direction type="text" autocomplete="off"></label>
        <label>도움말 <input data-create-memo type="text" autocomplete="off"></label>
        <button type="button" data-action="create">누름틀 만들기</button>
      </div>
      <p>선택한 내용과 서식을 유지합니다. 안내문과 도움말은 누름틀 정보에 저장합니다.</p>
    </fieldset>
    <p role="status" data-result>이름을 입력하고 값을 읽으세요.</p>
  `;
  const find = (selector) => panel.querySelector(selector);
  const file = find('input[type=file]');
  const list = find('[data-action=list]');
  const previous = find('[data-action=previous]');
  const next = find('[data-action=next]');
  const name = find('[data-name]');
  const occurrence = find('[data-occurrence]');
  const read = find('[data-action=read]');
  const expected = find('[data-expected]');
  const value = find('[data-value]');
  const write = find('[data-action=write]');
  const result = find('[data-result]');
  const captureCreate = find('[data-action=capture-create]');
  const create = find('[data-action=create]');
  const createName = find('[data-create-name]');
  const createDirection = find('[data-create-direction]');
  const createMemo = find('[data-create-memo]');
  const createSelection = find('[data-create-selection]');
  const createText = find('[data-create-text]');
  const insertion = createNamedFieldInsertionPort({
    editor,
    command: createNamedFieldCommand,
    getSelectionClipboard,
  });
  let capturedCreation = null;
  const inventoryStatus = find('[data-inventory-status]');
  const table = find('.api-named-fields-table');
  const body = find('tbody');
  const pages = find('[data-pages]');
  const pageRange = find('[data-page-range]');
  let disposed = false;
  let busy = false;
  let inventory = null;
  let observed = null;
  let page = 0;

  function writable(state) {
    return (
      state.status === 'ready' &&
      state.content?.format === 'hwpx' &&
      state.content?.readOnly !== true &&
      typeof setNamedFieldValueCommand?.id === 'symbol'
    );
  }

  function updateControls() {
    const state = editor.getEditorState();
    const canRead = state.status === 'ready' && !busy;
    file.disabled = name.disabled = occurrence.disabled = busy;
    list.disabled = !canRead || typeof editor.listNamedFields !== 'function';
    read.disabled = !canRead || typeof editor.readNamedField !== 'function';
    expected.disabled =
      value.disabled =
      write.disabled =
        !canRead || !observed || !observed.canSetValue || !writable(state);
    const creation = insertion.capture();
    captureCreate.disabled = busy || Boolean(creation.reason);
    createName.disabled = createDirection.disabled = createMemo.disabled = busy;
    create.disabled = busy || !insertion.current(capturedCreation) || !createName.value.trim();
    if (!capturedCreation)
      createSelection.textContent = creation.reason ?? '현재 선택을 가져오세요.';
    previous.disabled = busy || page === 0;
    next.disabled = busy || (page + 1) * pageSize >= (inventory?.rows.length ?? 0);
  }

  function showInventory() {
    const rows = inventory?.rows ?? [];
    const from = page * pageSize;
    const until = Math.min(from + pageSize, rows.length);
    const content = doc.createDocumentFragment();
    for (const { field, order } of rows.slice(from, until)) {
      const row = doc.createElement('tr');
      const access =
        field.protection === 'protected'
          ? '보호됨'
          : field.canSetValue && writable(editor.getEditorState())
            ? '가능'
            : '사용 불가';
      for (const cell of [
        field.name === null ? '이름 없음' : field.name === '' ? '빈 이름' : field.name,
        order ?? '—',
        valueLabel(field.value),
        access,
      ]) {
        const td = doc.createElement('td');
        td.textContent = String(cell);
        row.append(td);
      }
      content.append(row);
    }
    body.replaceChildren(content);
    table.hidden = rows.length === 0;
    pages.hidden = rows.length <= pageSize;
    pageRange.textContent = rows.length ? `${from + 1}–${until} / ${rows.length}` : '';
    updateControls();
  }

  function clearRead() {
    observed = null;
    expected.value = value.value = '';
    updateControls();
  }

  function onState(state) {
    if (disposed) return;
    if (capturedCreation && !insertion.current(capturedCreation)) {
      capturedCreation = null;
      createText.value = '';
      if (!busy) result.textContent = '선택이 바뀌었습니다. 현재 선택을 다시 가져오세요.';
    }
    if (inventory && (state.status !== 'ready' || !sameView(inventory.token, state))) {
      inventory = null;
      page = 0;
      inventoryStatus.textContent = '문서가 바뀌었습니다. 목록을 다시 조회하세요.';
      showInventory();
    }
    if (
      observed &&
      (state.status !== 'ready' || state.stateVersion !== observed.selectionVersion)
    ) {
      clearRead();
      if (!busy) result.textContent = '현재 상태가 바뀌었습니다. 값을 다시 읽으세요.';
    }
    updateControls();
  }

  async function run(action) {
    if (disposed || busy) return;
    busy = true;
    updateControls();
    result.textContent = '실행 중';
    try {
      const message = await action();
      if (!disposed) result.textContent = message;
    } catch (error) {
      if (!disposed) result.textContent = error instanceof Error ? error.message : String(error);
    } finally {
      busy = false;
      if (!disposed) updateControls();
    }
  }

  file.addEventListener('change', () => {
    const selected = file.files?.[0];
    if (!selected) return;
    file.value = '';
    void run(async () => {
      const bytes = await selected.arrayBuffer();
      if (disposed) return '';
      await editor.load(bytes, { format: 'hwpx', editable: true });
      return 'HWPX 문서를 열었습니다.';
    });
  });

  list.addEventListener(
    'click',
    () =>
      void run(async () => {
        const state = editor.getEditorState();
        const snapshot = await editor.listNamedFields({ token: state.token });
        if (disposed) return '';
        if (!sameView(snapshot.token, editor.getEditorState())) throw Error('StaleTarget');
        const counts = new Map();
        const rows = snapshot.rows.map((field) => {
          if (snapshot.coverage !== 'complete' || !field.name) return { field };
          const order = (counts.get(field.name) ?? 0) + 1;
          counts.set(field.name, order);
          return { field, order };
        });
        inventory = { token: snapshot.token, rows };
        page = 0;
        inventoryStatus.textContent =
          snapshot.coverage === 'complete'
            ? `전체 목록 · ${rows.length}개`
            : `부분 목록 · ${rows.length}개 확인됨`;
        showInventory();
        return '필드 목록을 조회했습니다.';
      }),
  );

  previous.addEventListener('click', () => {
    page--;
    showInventory();
  });
  next.addEventListener('click', () => {
    page++;
    showInventory();
  });
  for (const input of [name, occurrence]) {
    input.addEventListener('input', () => {
      if (!observed) return;
      clearRead();
      result.textContent = '대상이 바뀌었습니다. 값을 다시 읽으세요.';
    });
  }

  read.addEventListener(
    'click',
    () =>
      void run(async () => {
        clearRead();
        const selector = selectorOf(name, occurrence);
        const state = editor.getEditorState();
        const resolution = await editor.readNamedField(selector, { token: state.token });
        if (disposed) return '';
        if (editor.getEditorState().stateVersion !== state.stateVersion)
          throw Error('현재 상태가 바뀌었습니다. 값을 다시 읽으세요.');
        if (resolution.status !== 'found') return readMessages[resolution.status];
        const { field } = resolution;
        if (field.value.status !== 'available')
          return field.protection === 'protected' ? '보호된 필드 · 값 조회 불가' : '값 조회 불가';
        const canSetValue = field.protection !== 'protected' && field.canSetValue === true;
        observed = {
          selector,
          token: state.token,
          selectionVersion: state.stateVersion,
          canSetValue,
        };
        expected.value = value.value = field.value.text;
        const shownValue = valueLabel(field.value);
        if (field.protection === 'protected') return `보호된 필드 · ${shownValue}`;
        return canSetValue && writable(state)
          ? `현재 값 · ${shownValue}`
          : `읽기 전용 값 · ${shownValue}`;
      }),
  );

  write.addEventListener(
    'click',
    () =>
      void run(async () => {
        const binding = observed;
        const state = editor.getEditorState();
        if (
          !binding?.canSetValue ||
          !writable(state) ||
          state.stateVersion !== binding.selectionVersion
        )
          throw Error('현재 상태가 바뀌었습니다. 값을 다시 읽으세요.');
        const { selector, token, selectionVersion } = binding;
        const outcome = await editor.dispatchCommand(setNamedFieldValueCommand, {
          selector,
          token,
          selectionVersion,
          expectedValue: expected.value,
          text: value.value,
        });
        if (disposed) return '';
        if (outcome.status === 'committed-with-snapshot') {
          clearRead();
          return '필드 값을 적용했습니다. 다시 수정하려면 값을 읽으세요.';
        }
        if (outcome.status === 'committed-refresh-required') {
          clearRead();
          return '값이 반영되었을 수 있습니다. 문서 상태를 복구한 뒤 다시 읽으세요.';
        }
        if (outcome.status === 'known-no-op') return '값이 동일합니다.';
        return outcome.error ?? outcome.status;
      }),
  );

  // Keep the live Canvas selection while capturing it with the pointer.
  captureCreate.addEventListener('pointerdown', (event) => event.preventDefault());
  captureCreate.addEventListener('click', () => {
    capturedCreation = insertion.capture();
    if (capturedCreation.reason) {
      result.textContent = capturedCreation.reason;
      capturedCreation = null;
      updateControls();
      return;
    }
    const { target, expectedText } = capturedCreation;
    createText.value = expectedText;
    createSelection.textContent =
      `본문 문단 ${target.paragraph + 1} · ${target.startUnit}–${target.endUnit}` +
      (target.startUnit === target.endUnit ? ' · 빈 위치' : '');
    result.textContent = '현재 선택을 가져왔습니다. 이름을 입력하고 누름틀을 만드세요.';
    updateControls();
  });
  createName.addEventListener('input', updateControls);
  create.addEventListener(
    'click',
    () =>
      void run(async () => {
        const captured = capturedCreation;
        const outcome = await insertion.insert(captured, {
          name: createName.value,
          direction: createDirection.value,
          memo: createMemo.value,
        });
        if (disposed) return '';
        if (outcome.status === 'committed-with-snapshot') {
          capturedCreation = null;
          createText.value = '';
          name.value = createName.value;
          occurrence.value = '';
          return '누름틀을 만들었습니다. 필드 목록에서 확인하거나 값을 읽으세요.';
        }
        if (outcome.status.startsWith('committed')) {
          capturedCreation = null;
          createText.value = '';
          return '누름틀이 반영되었을 수 있습니다. 문서 상태를 확인한 뒤 다시 조회하세요.';
        }
        const errors = {
          DuplicateNamedFieldName: '같은 이름의 필드가 있습니다. 다른 이름을 입력하세요.',
          IncompleteNamedFieldInventory:
            '이 문서의 전체 필드 이름을 확인할 수 없어 생성할 수 없습니다.',
          ProtectedFieldRange: '기존 필드와 겹치는 위치에는 누름틀을 만들 수 없습니다.',
          UnsupportedNamedFieldCreateSite: '하나의 텍스트 요소 안에서 범위를 선택하세요.',
          UnsupportedNamedFieldCreateSection:
            '현재 구역의 편집 상태에서는 누름틀을 만들 수 없습니다.',
          InvalidNamedFieldName: '누름틀 이름을 입력하세요.',
        };
        return errors[outcome.error] ?? outcome.error ?? outcome.status;
      }),
  );

  host.append(panel);
  const unsubscribe = editor.registerStateListener(onState);
  updateControls();
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      insertion.dispose();
      unsubscribe();
      panel.remove();
    },
  };
}
