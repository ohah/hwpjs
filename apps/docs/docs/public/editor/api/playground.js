/** 이미 문서를 연 ready editor를 주입받는 API 예제 조각입니다. 독립 bootstrap은 포함하지 않습니다. */
export const readApiProjection = (state) => ({
  status: state.status,
  selection: state.selection,
  paragraphs: state.content?.paragraphs ?? [],
});
const fixtures = ['noori', 'page', 'textbox', 'table-caption', 'multicolumns-layout'];

export function apiLoadOptions(args = {}) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw Error('InvalidArguments');
  for (const key of Object.keys(args))
    if (!['format', 'editable', 'fixture'].includes(key)) throw Error('InvalidArgument:' + key);
  if (!['hwp5', 'hwpx'].includes(args.format)) throw Error('InvalidArgument:format');
  if (args.editable !== undefined && typeof args.editable !== 'boolean')
    throw Error('InvalidArgument:editable');
  if (args.fixture !== undefined && !fixtures.includes(args.fixture))
    throw Error('InvalidArgument:fixture');
  return {
    format: args.format,
    editable: args.editable ?? true,
    ...(args.fixture === undefined ? {} : { fixture: args.fixture }),
  };
}
export function apiSelectionTarget(editor, args, createParagraphSelection) {
  if (typeof createParagraphSelection !== 'function') throw Error('SelectionIssuerUnavailable');
  return createParagraphSelection(editor.getEditorState(), {
    section: args.section ?? 0,
    paragraph: args.paragraph ?? 0,
    startUnit: args.start ?? 0,
    endUnit: args.end ?? args.start ?? 0,
    affinity: args.affinity ?? 'forward',
  });
}

function replaceAllArgs(args, keys) {
  if (
    !args ||
    typeof args !== 'object' ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(args))
  )
    throw Error('InvalidArguments');
  for (const key of Reflect.ownKeys(args)) {
    if (!keys.includes(key)) throw Error('InvalidArgument:' + String(key));
  }
  for (const key of keys) {
    if (!Object.hasOwn(args, key) || typeof args[key] !== 'string')
      throw Error('InvalidArgument:' + key);
  }
}

const replaceAllKeys = ['query', 'replacement'];
const replaceAllOperations = ['getReplaceAllCapabilities', 'planReplaceAll', 'replaceAll'];
const replaceAllRequest = (state, { query, replacement }) => ({
  schemaVersion: 1,
  query,
  replacement,
  layoutToken: state.token,
  stateVersion: state.stateVersion,
});

export function createApiPlayground({
  editor,
  spliceCommand,
  loadFixture,
  getHistoryAvailability,
  getTableInsertAvailability: queryTableInsertAvailability,
  createParagraphSelection,
  planReplaceAll: queryReplaceAllPlan,
  replaceAllCommand,
  surface,
  operations,
}) {
  let saved = null,
    closed = false,
    pending = false;
  const snapshot = () =>
    editor.read((state) => ({
      status: state.status,
      documentId: state.documentId,
      generation: state.generation,
      operationRevision: state.operationRevision,
      stateVersion: state.stateVersion,
      nativeHistoryRevision: state.nativeHistoryRevision,
      selection: state.selection,
      history: getHistoryAvailability(state),
      readOnly: state.content?.readOnly,
      capabilities: state.capabilities,
      format: state.content?.format,
      contentWindow: state.content?.window ?? null,
      paragraphs: (state.content?.paragraphs ?? []).map((r) => ({
        section: r.section,
        paragraph: r.paragraph,
        text: r.text,
        editable: r.editable,
        owner: r.selectionOwner,
      })),
    }));
  const target = (args) => apiSelectionTarget(editor, args, createParagraphSelection);
  const registry = Object.freeze({
    async load(args) {
      const { fixture, ...options } = apiLoadOptions(args);
      const bytes =
        fixture === undefined
          ? await loadFixture(options.format)
          : await loadFixture(options.format, fixture);
      return editor.load(bytes, options);
    },
    getPageText({ pageIndex, include, ...unknown }) {
      if (Object.keys(unknown).length) throw Error('InvalidArgument:' + Object.keys(unknown)[0]);
      return surface.getPageText(pageIndex, include === undefined ? undefined : { include });
    },
    async invalidLoad(args) {
      if (!['hwp5', 'hwpx'].includes(args.format)) throw Error('InvalidArgument:format');
      return editor.load(new Uint8Array([0, 1, 2, 3]), { format: args.format });
    },
    read() {
      return editor.read(readApiProjection);
    },
    select(args) {
      return editor.setSelection(target(args));
    },
    getTableInsertAvailability(args) {
      if (typeof queryTableInsertAvailability !== 'function')
        throw Error('ApiTableInsertAvailabilityUnavailable');
      const selected = target(args);
      return queryTableInsertAvailability(editor.getEditorState(), selected);
    },
    getReplaceAllCapabilities(args) {
      replaceAllArgs(args, []);
      return editor.getReplaceAllCapabilities({ token: editor.getEditorState().token });
    },
    planReplaceAll(args) {
      replaceAllArgs(args, replaceAllKeys);
      const state = editor.getEditorState();
      return queryReplaceAllPlan(state, replaceAllRequest(state, args));
    },
    async replaceAll(args) {
      replaceAllArgs(args, replaceAllKeys);
      const { query, replacement } = args;
      const { documentId, generation } = editor.getEditorState();
      await editor.update(() => {});
      if (closed) throw Error('ApiPlaygroundDisposed');
      const state = editor.getEditorState();
      if (state.documentId !== documentId || state.generation !== generation)
        throw Error('StaleTarget');
      return editor.dispatchCommand(
        replaceAllCommand,
        replaceAllRequest(state, { query, replacement }),
      );
    },
    splice(args) {
      if (typeof args.text !== 'string') throw Error('InvalidArgument:text');
      return editor.dispatchCommand(spliceCommand, { target: target(args), text: args.text });
    },
    undo() {
      return editor.undo();
    },
    redo() {
      return editor.redo();
    },
    async save(args) {
      if (Object.keys(args).some((key) => key !== 'allowStaleLayout'))
        throw Error('UnsupportedSaveOption');
      if (args.allowStaleLayout !== undefined && typeof args.allowStaleLayout !== 'boolean')
        throw Error('InvalidArgument:allowStaleLayout');
      const options =
        args.allowStaleLayout === undefined ? {} : { allowStaleLayout: args.allowStaleLayout };
      const value = await editor.save(options);
      saved = { bytes: value.bytes.slice(), format: value.format };
      const digest = await crypto.subtle.digest('SHA-256', saved.bytes);
      return {
        format: value.format,
        bytes: value.bytes.length,
        sha256: Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join(''),
        operationRevision: value.operationRevision,
        staleSnapshot: value.staleSnapshot,
      };
    },
    async reopen() {
      if (!saved) throw Error('NoSavedDocument');
      return editor.load(saved.bytes.slice(), { format: saved.format });
    },
  });
  const hasReplaceAll =
    typeof editor.getReplaceAllCapabilities === 'function' &&
    typeof editor.update === 'function' &&
    typeof editor.dispatchCommand === 'function' &&
    typeof queryReplaceAllPlan === 'function' &&
    typeof replaceAllCommand?.id === 'symbol';
  const allowedOperations = Object.freeze(
    (operations ?? Object.keys(registry)).filter(
      (operation) =>
        Object.hasOwn(registry, operation) &&
        (hasReplaceAll || !replaceAllOperations.includes(operation)) &&
        (operation !== 'getPageText' || typeof surface?.getPageText === 'function'),
    ),
  );
  return Object.freeze({
    snapshot,
    operations: allowedOperations,
    async execute(operation, args = {}) {
      if (closed) throw Error('ApiPlaygroundDisposed');
      if (pending) throw Error('ApiPlaygroundBusy');
      pending = true;
      const before = snapshot(),
        startedAt = performance.now();
      let effectiveArgs = args;
      try {
        if (!allowedOperations.includes(operation)) throw Error('UnknownApiSample');
        if (!args || typeof args !== 'object' || Array.isArray(args))
          throw Error('InvalidArguments');
        effectiveArgs = operation === 'load' ? apiLoadOptions(args) : args;
        const value = await registry[operation](effectiveArgs);
        const result = value?.getEditorState ? undefined : value;
        const error =
          operation === 'getPageText' && result?.state === 'unavailable'
            ? result.reason
            : (result?.error ?? null);
        return {
          operation,
          args: effectiveArgs,
          ok: !error,
          result,
          error,
          before,
          after: snapshot(),
          startedAt,
          finishedAt: performance.now(),
        };
      } catch (error) {
        return {
          operation,
          args,
          ok: false,
          result: null,
          error: error instanceof Error ? error.message : String(error),
          before,
          after: snapshot(),
          startedAt,
          finishedAt: performance.now(),
        };
      } finally {
        pending = false;
      }
    },
    getSaved() {
      return saved ? { bytes: saved.bytes.slice(), format: saved.format } : null;
    },
    dispose() {
      closed = true;
      saved = null;
    },
  });
}

const examples = Object.freeze({
  load: { format: 'hwpx', editable: true },
  invalidLoad: { format: 'hwpx' },
  getPageText: { pageIndex: 0, include: ['body', 'table', 'textbox', 'caption'] },
  read: {},
  select: { section: 0, paragraph: 0, start: 0, end: 0 },
  splice: { section: 0, paragraph: 0, start: 0, end: 0, text: 'API 검증' },
  getTableInsertAvailability: { section: 0, paragraph: 0, start: 0, end: 0 },
  getReplaceAllCapabilities: {},
  planReplaceAll: { query: '누리', replacement: '우리' },
  replaceAll: { query: '누리', replacement: '우리' },
  undo: {},
  redo: {},
  save: {},
  reopen: {},
});
const snippets = Object.freeze({
  load: 'await editor.load(bytes, { format });',
  invalidLoad: 'await editor.load(new Uint8Array([0, 1, 2, 3]), { format });',
  read: 'editor.read(' + readApiProjection.toString() + ');',
  select: 'await editor.setSelection(target);',
  splice: 'await editor.dispatchCommand(SPLICE_TEXT_COMMAND, { target, text });',
  getTableInsertAvailability: 'getTableInsertAvailability(editor.getEditorState(), target);',
  undo: 'await editor.undo();',
  redo: 'await editor.redo();',
  save: 'await editor.save({});',
  reopen: 'await editor.load(saved.bytes, { format: saved.format });',
});
export function apiSampleCode(operation, args = {}) {
  if (operation === 'getPageText') {
    const { pageIndex, include } = args;
    const filter = include === undefined ? '' : ', ' + JSON.stringify({ include });
    return (
      '// 전제: 같은 editor에 연결된 Canvas Surface를 사용합니다.\n' +
      'const result = surface.getPageText(' +
      JSON.stringify(pageIndex) +
      filter +
      ');'
    );
  }
  if (operation === 'getReplaceAllCapabilities') {
    replaceAllArgs(args, []);
    return (
      '// 전제: 문서를 이미 연 ready editor를 주입합니다.\n' +
      'await editor.getReplaceAllCapabilities({ token: editor.getEditorState().token });'
    );
  }
  if (operation === 'planReplaceAll' || operation === 'replaceAll') {
    replaceAllArgs(args, replaceAllKeys);
    const planOnly = operation === 'planReplaceAll';
    return (
      '// 전제: 문서를 이미 연 ready editor를 주입합니다.\n' +
      'import { ' +
      (planOnly ? 'planReplaceAll' : 'REPLACE_ALL_COMMAND') +
      " } from '@ohah/hwpjs';\n\n" +
      (planOnly
        ? ''
        : 'const { documentId, generation } = editor.getEditorState();\n' +
          'await editor.update(() => {});\n') +
      'const state = editor.getEditorState();\n' +
      (planOnly
        ? ''
        : 'if (state.documentId !== documentId || state.generation !== generation)\n' +
          "  throw Error('StaleTarget');\n") +
      'const args = ' +
      JSON.stringify(args, null, 2) +
      ';\n' +
      'const request = (' +
      replaceAllRequest.toString() +
      ')(state, args);\n' +
      (planOnly
        ? 'const plan = planReplaceAll(state, request); // executionAuthority: false'
        : 'const result = await editor.dispatchCommand(REPLACE_ALL_COMMAND, request);\n' +
          '// committed-refresh-required이면 상태를 다시 읽고 같은 편집을 재전송하지 않습니다.')
    );
  }
  const call =
    operation === 'load'
      ? (() => {
          const { fixture, ...options } = apiLoadOptions(args);
          const sample = fixture === undefined ? '' : '// 샘플: ' + fixture + '\n';
          return sample + 'await editor.load(bytes, ' + JSON.stringify(options) + ');';
        })()
      : operation === 'save'
        ? 'await editor.save(' + JSON.stringify(args) + ');'
        : snippets[operation];
  const prepare = ['select', 'splice', 'getTableInsertAvailability'].includes(operation)
    ? 'const createTarget = ' +
      apiSelectionTarget.toString() +
      ';\n' +
      'const args = ' +
      JSON.stringify(args, null, 2) +
      ';\n' +
      'const target = createTarget(editor, args, createParagraphSelection);\n' +
      (operation === 'splice' ? 'const text = args.text;\n' : '')
    : '';
  return (
    '// 전제: 문서를 이미 연 ready editor를 주입합니다.\n' +
    (operation === 'getTableInsertAvailability'
      ? "import { createParagraphSelection, getTableInsertAvailability } from '@ohah/hwpjs';\n\n"
      : 'import { createEditor, SPLICE_TEXT_COMMAND, createParagraphSelection } from "@ohah/hwpjs";\nimport { createWorkerRuntimeFactory } from "@ohah/hwpjs/runtime";\n\n') +
    prepare +
    call
  );
}
export function mountApiPlayground(root, options) {
  const doc = root.ownerDocument;
  const section = doc.createElement('section');
  const scene = doc.createElement('div');
  scene.setAttribute('role', 'region');
  scene.setAttribute('aria-label', '문서 Canvas');
  scene.style.cssText = 'height:300px;border:1px solid #9ca3af;margin-block:1rem';
  root.append(section);
  let surface;
  if (options.createSurface) {
    section.append(scene);
    try {
      surface = options.createSurface({ root: scene, editor: options.editor });
    } catch (error) {
      section.remove();
      throw error;
    }
  }
  const api = createApiPlayground({ ...options, surface });
  section.className = 'api-playground';
  const title = doc.createElement('h1');
  title.textContent = surface ? '공개 API 실행' : 'Headless API 실행';
  const intro = doc.createElement('p');
  intro.textContent =
    '실제 WASM 엔진을 호출합니다. 고정 샘플과 입력한 인수만 실행하며 임의 JavaScript는 실행하지 않습니다. 문서는 브라우저 안에서 처리됩니다. 문단 목록은 현재 content/window 관측 범위이며 전체 문서 목록을 보장하지 않습니다. save의 allowStaleLayout은 명시적 boolean 옵션만 지원합니다.';
  const label = doc.createElement('label'),
    operation = doc.createElement('select');
  label.textContent = '실행할 API ';
  operation.setAttribute('aria-label', '실행할 API');
  for (const name of api.operations) {
    const o = doc.createElement('option');
    o.value = name;
    o.textContent = name;
    operation.append(o);
  }
  label.append(operation);
  const modeLabel = doc.createElement('label'),
    loadMode = doc.createElement('select');
  modeLabel.textContent = '문서 열기 모드 ';
  loadMode.setAttribute('aria-label', '문서 열기 모드');
  for (const [value, text] of [
    ['true', '편집 허용'],
    ['false', '읽기 전용'],
  ]) {
    const item = doc.createElement('option');
    item.value = value;
    item.textContent = text;
    loadMode.append(item);
  }
  modeLabel.append(loadMode);
  const modeNote = doc.createElement('p');
  modeNote.textContent =
    '읽기 전용에서는 조회·선택을 사용할 수 있고 편집·이력 변경은 거부됩니다. 모드를 바꾸려면 load를 다시 실행하세요. 저장은 별도 정책을 따릅니다.';
  const argsLabel = doc.createElement('label'),
    args = doc.createElement('textarea');
  argsLabel.textContent = 'JSON 인수 ';
  args.setAttribute('aria-label', 'JSON 인수');
  args.rows = 7;
  argsLabel.append(args);
  const pageFields = doc.createElement('fieldset');
  const pageLegend = doc.createElement('legend');
  pageLegend.textContent = '쪽 텍스트';
  const pageLabel = doc.createElement('label');
  pageLabel.textContent = '물리 쪽 인덱스 (0부터) ';
  const pageIndex = doc.createElement('input');
  pageIndex.type = 'number';
  pageIndex.min = '0';
  pageIndex.step = '1';
  pageIndex.value = '0';
  pageLabel.append(pageIndex);
  const kindChoices = doc.createElement('div');
  kindChoices.style.cssText = 'display:flex;flex-wrap:wrap;gap:0.75rem;margin-block:0.5rem';
  const kindInputs = [];
  for (const [kind, text] of [
    ['body', '본문'],
    ['table', '표'],
    ['textbox', '글상자'],
    ['caption', '캡션'],
  ]) {
    const choice = doc.createElement('label');
    const input = doc.createElement('input');
    input.type = 'checkbox';
    input.value = kind;
    input.checked = true;
    choice.append(input, doc.createTextNode(text));
    kindChoices.append(choice);
    kindInputs.push(input);
  }
  pageFields.append(pageLegend, pageLabel, kindChoices);
  const pageTextArgs = () => ({
    pageIndex: Number.isSafeInteger(pageIndex.valueAsNumber) ? pageIndex.valueAsNumber : null,
    include: kindInputs.filter((input) => input.checked).map((input) => input.value),
  });
  const code = doc.createElement('pre');
  code.setAttribute('aria-label', '실행 예제');
  const execute = doc.createElement('button');
  execute.type = 'button';
  execute.textContent = 'API 실행';
  const download = doc.createElement('button');
  download.type = 'button';
  download.textContent = '마지막 저장 파일 다운로드';
  download.disabled = true;
  const status = doc.createElement('p');
  status.setAttribute('role', 'status');
  const output = doc.createElement('pre');
  output.setAttribute('aria-label', '실행 결과');
  output.tabIndex = 0;
  const state = doc.createElement('pre');
  state.setAttribute('aria-label', '현재 엔진 상태');
  let disposed = false,
    sequence = 0;
  const renderState = () => {
    if (!disposed) state.textContent = JSON.stringify(api.snapshot(), null, 2);
  };
  const updateCode = () => {
    try {
      const parsed = operation.value === 'getPageText' ? pageTextArgs() : JSON.parse(args.value);
      code.textContent = apiSampleCode(operation.value, parsed);
      if (operation.value === 'load') loadMode.value = String(apiLoadOptions(parsed).editable);
    } catch {
      code.textContent = '// JSON 인수를 확인하세요.';
    }
  };
  const choose = () => {
    modeLabel.hidden = modeNote.hidden = operation.value !== 'load';
    const readingPage = operation.value === 'getPageText';
    argsLabel.hidden = readingPage;
    pageFields.hidden = !readingPage;
    args.value = JSON.stringify(examples[operation.value], null, 2);
    updateCode();
  };
  const changeMode = () => {
    try {
      const parsed = JSON.parse(args.value);
      parsed.editable = loadMode.value === 'true';
      apiLoadOptions(parsed);
      args.value = JSON.stringify(parsed, null, 2);
      updateCode();
    } catch {
      status.textContent = 'JSON 인수를 확인하세요.';
    }
  };
  loadMode.addEventListener('change', changeMode);
  operation.addEventListener('change', choose);
  args.addEventListener('input', updateCode);
  pageFields.addEventListener('input', updateCode);
  const run = async () => {
    execute.disabled = true;
    status.textContent = '실제 엔진 실행 중';
    try {
      const name = operation.value;
      let value;
      try {
        value = name === 'getPageText' ? pageTextArgs() : JSON.parse(args.value);
      } catch {
        throw Error('InvalidJSON');
      }
      const record = await api.execute(name, value);
      if (disposed) return;
      record.sequence = ++sequence;
      output.textContent = JSON.stringify(record, null, 2);
      output.dataset.sequence = String(sequence);
      output.dataset.ok = String(record.ok);
      if (record.operation === 'getPageText' && record.result) {
        const result = record.result;
        status.textContent =
          result.state === 'unavailable'
            ? '조회할 수 없음 (unavailable) · ' + result.reason
            : result.coverage === 'partial'
              ? '부분 결과 (partial)'
              : '전체 결과 (complete)';
      } else {
        status.textContent =
          record.operation === 'replaceAll' &&
          record.result?.status === 'committed-refresh-required'
            ? '변경은 이미 반영되었습니다. 상태 복구가 필요하므로 같은 요청을 다시 실행하지 마세요.'
            : record.ok
              ? '완료'
              : record.error === 'ReadOnlyDocument'
                ? '읽기 전용: 쓰기가 거부되었습니다.'
                : '오류: ' + record.error;
      }
      download.disabled = !api.getSaved();
    } catch (error) {
      if (!disposed) {
        output.textContent = JSON.stringify({ ok: false, error: error.message });
        output.dataset.sequence = String(++sequence);
        output.dataset.ok = 'false';
        status.textContent = '오류: ' + error.message;
      }
    } finally {
      if (!disposed) {
        execute.disabled = false;
        renderState();
      }
    }
  };
  execute.addEventListener('click', run);
  const saveDownload = () => {
    const saved = api.getSaved();
    if (!saved) return;
    const url = URL.createObjectURL(new Blob([saved.bytes]));
    const link = doc.createElement('a');
    link.href = url;
    link.download = 'api-playground.' + (saved.format === 'hwp5' ? 'hwp' : 'hwpx');
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  download.addEventListener('click', saveDownload);
  section.append(
    title,
    intro,
    label,
    modeLabel,
    modeNote,
    argsLabel,
    pageFields,
    code,
    execute,
    download,
    status,
    ...(surface ? [scene] : []),
    output,
    state,
  );
  const unsubscribe = options.editor.registerStateListener(renderState);
  choose();
  renderState();
  return {
    api,
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribe();
      api.dispose();
      execute.removeEventListener('click', run);
      operation.removeEventListener('change', choose);
      loadMode.removeEventListener('change', changeMode);
      args.removeEventListener('input', updateCode);
      pageFields.removeEventListener('input', updateCode);
      download.removeEventListener('click', saveDownload);
      const disposal = surface?.dispose();
      section.remove();
      return disposal;
    },
  };
}
