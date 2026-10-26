/** Fixed API samples. The editor/command/fetch dependencies are real injected implementations. */
export const readApiProjection = (state) => ({
  status: state.status,
  selection: state.selection,
  paragraphs: state.content?.paragraphs ?? [],
});
export function apiLoadOptions(args = {}) {
  if (!args || typeof args !== "object" || Array.isArray(args)) throw Error("InvalidArguments");
  for (const key of Object.keys(args))
    if (!["format", "editable"].includes(key)) throw Error("InvalidArgument:" + key);
  if (!["hwp5", "hwpx"].includes(args.format)) throw Error("InvalidArgument:format");
  if (args.editable !== undefined && typeof args.editable !== "boolean")
    throw Error("InvalidArgument:editable");
  return { format: args.format, editable: args.editable ?? true };
}
export function createApiPlayground({
  editor,
  spliceCommand,
  loadFixture,
  getHistoryAvailability,
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
  const integer = (value, name) => {
    if (!Number.isSafeInteger(value) || value < 0) throw Error("InvalidArgument:" + name);
    return value;
  };
  const target = (args) => {
    const state = editor.getEditorState(),
      row = state.content?.paragraphs?.find(
        (r) =>
          r.section === integer(args.section ?? 0, "section") &&
          r.paragraph === integer(args.paragraph ?? 0, "paragraph"),
      );
    if (!row) throw Error(state.status === "ready" ? "ParagraphNotFound" : "DocumentNotReady");
    return {
      ...state.token,
      format: state.content.format,
      coordinateSpace: "display",
      owner: row.selectionOwner,
      section: row.section,
      paragraph: row.paragraph,
      startUnit: integer(args.start ?? 0, "start"),
      endUnit: integer(args.end ?? args.start ?? 0, "end"),
      affinity: "forward",
    };
  };
  const registry = Object.freeze({
    async load(args) {
      const options = apiLoadOptions(args);
      return editor.load(await loadFixture(options.format), options);
    },
    async invalidLoad(args) {
      if (!["hwp5", "hwpx"].includes(args.format)) throw Error("InvalidArgument:format");
      return editor.load(new Uint8Array([0, 1, 2, 3]), { format: args.format });
    },
    read() {
      return editor.read(readApiProjection);
    },
    select(args) {
      return editor.setSelection(target(args));
    },
    splice(args) {
      if (typeof args.text !== "string") throw Error("InvalidArgument:text");
      return editor.dispatchCommand(spliceCommand, { target: target(args), text: args.text });
    },
    undo() {
      return editor.undo();
    },
    redo() {
      return editor.redo();
    },
    async save(args) {
      if (Object.keys(args).some((key) => key !== "allowStaleLayout"))
        throw Error("UnsupportedSaveOption");
      if (args.allowStaleLayout !== undefined && typeof args.allowStaleLayout !== "boolean")
        throw Error("InvalidArgument:allowStaleLayout");
      const options =
        args.allowStaleLayout === undefined ? {} : { allowStaleLayout: args.allowStaleLayout };
      const value = await editor.save(options);
      saved = { bytes: value.bytes.slice(), format: value.format };
      const digest = await crypto.subtle.digest("SHA-256", saved.bytes);
      return {
        format: value.format,
        bytes: value.bytes.length,
        sha256: Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join(""),
        operationRevision: value.operationRevision,
        staleSnapshot: value.staleSnapshot,
      };
    },
    async reopen() {
      if (!saved) throw Error("NoSavedDocument");
      return editor.load(saved.bytes.slice(), { format: saved.format });
    },
  });
  return Object.freeze({
    snapshot,
    operations: operations ?? Object.keys(registry),
    async execute(operation, args = {}) {
      if (closed) throw Error("ApiPlaygroundDisposed");
      if (pending) throw Error("ApiPlaygroundBusy");
      pending = true;
      const before = snapshot(),
        startedAt = performance.now();
      let effectiveArgs = args;
      try {
        if (!Object.hasOwn(registry, operation) || (operations && !operations.includes(operation)))
          throw Error("UnknownApiSample");
        if (!args || typeof args !== "object" || Array.isArray(args))
          throw Error("InvalidArguments");
        effectiveArgs = operation === "load" ? apiLoadOptions(args) : args;
        const value = await registry[operation](effectiveArgs);
        const result = value?.getEditorState ? undefined : value;
        return {
          operation,
          args: effectiveArgs,
          ok: !result?.error,
          result,
          error: result?.error ?? null,
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
  load: { format: "hwpx", editable: true },
  invalidLoad: { format: "hwpx" },
  read: {},
  select: { section: 0, paragraph: 0, start: 0, end: 0 },
  splice: { section: 0, paragraph: 0, start: 0, end: 0, text: "API 검증" },
  undo: {},
  redo: {},
  save: {},
  reopen: {},
});
const snippets = Object.freeze({
  load: "await editor.load(bytes, { format });",
  invalidLoad: "await editor.load(new Uint8Array([0, 1, 2, 3]), { format });",
  read: "editor.read(" + readApiProjection.toString() + ");",
  select: "await editor.setSelection(target);",
  splice: "await editor.dispatchCommand(SPLICE_TEXT_COMMAND, { target, text });",
  undo: "await editor.undo();",
  redo: "await editor.redo();",
  save: "await editor.save({});",
  reopen: "await editor.load(saved.bytes, { format: saved.format });",
});
export function apiSampleCode(operation, args = {}) {
  const call =
    operation === "load"
      ? "await editor.load(bytes, " + JSON.stringify(apiLoadOptions(args)) + ");"
      : operation === "save"
        ? "await editor.save(" + JSON.stringify(args) + ");"
        : snippets[operation];
  return (
    'import { createEditor, SPLICE_TEXT_COMMAND } from "@ohah/hwpjs";\nimport { createWorkerRuntimeFactory } from "@ohah/hwpjs/runtime";\n\n' +
    call
  );
}
export function mountApiPlayground(root, options) {
  const doc = root.ownerDocument,
    api = createApiPlayground(options),
    section = doc.createElement("section");
  section.className = "api-playground";
  const title = doc.createElement("h1");
  title.textContent = "Headless API 실행";
  const intro = doc.createElement("p");
  intro.textContent =
    "실제 WASM 엔진을 호출합니다. 고정 샘플과 JSON 인수만 실행하며 임의 JavaScript는 실행하지 않습니다. 문서는 브라우저 안에서 처리됩니다. 문단 목록은 현재 content/window 관측 범위이며 전체 문서 목록을 보장하지 않습니다. save의 allowStaleLayout은 명시적 boolean 옵션만 지원합니다.";
  const label = doc.createElement("label"),
    operation = doc.createElement("select");
  label.textContent = "실행할 API ";
  operation.setAttribute("aria-label", "실행할 API");
  for (const name of api.operations) {
    const o = doc.createElement("option");
    o.value = name;
    o.textContent = name;
    operation.append(o);
  }
  label.append(operation);
  const modeLabel = doc.createElement("label"),
    loadMode = doc.createElement("select");
  modeLabel.textContent = "문서 열기 모드 ";
  loadMode.setAttribute("aria-label", "문서 열기 모드");
  for (const [value, text] of [
    ["true", "편집 허용"],
    ["false", "읽기 전용"],
  ]) {
    const item = doc.createElement("option");
    item.value = value;
    item.textContent = text;
    loadMode.append(item);
  }
  modeLabel.append(loadMode);
  const modeNote = doc.createElement("p");
  modeNote.textContent =
    "읽기 전용에서는 조회·선택을 사용할 수 있고 편집·이력 변경은 거부됩니다. 모드를 바꾸려면 load를 다시 실행하세요. 저장은 별도 정책을 따릅니다.";
  const argsLabel = doc.createElement("label"),
    args = doc.createElement("textarea");
  argsLabel.textContent = "JSON 인수 ";
  args.setAttribute("aria-label", "JSON 인수");
  args.rows = 7;
  argsLabel.append(args);
  const code = doc.createElement("pre");
  code.setAttribute("aria-label", "실행 예제");
  const execute = doc.createElement("button");
  execute.type = "button";
  execute.textContent = "API 실행";
  const download = doc.createElement("button");
  download.type = "button";
  download.textContent = "마지막 저장 파일 다운로드";
  download.disabled = true;
  const status = doc.createElement("p");
  status.setAttribute("role", "status");
  const output = doc.createElement("pre");
  output.setAttribute("aria-label", "실행 결과");
  output.tabIndex = 0;
  const state = doc.createElement("pre");
  state.setAttribute("aria-label", "현재 엔진 상태");
  let disposed = false,
    sequence = 0;
  const renderState = () => {
    if (!disposed) state.textContent = JSON.stringify(api.snapshot(), null, 2);
  };
  const updateCode = () => {
    try {
      const parsed = JSON.parse(args.value);
      code.textContent = apiSampleCode(operation.value, parsed);
      if (operation.value === "load") loadMode.value = String(apiLoadOptions(parsed).editable);
    } catch {
      code.textContent = "// JSON 인수를 확인하세요.";
    }
  };
  const choose = () => {
    modeLabel.hidden = modeNote.hidden = operation.value !== "load";
    args.value = JSON.stringify(examples[operation.value], null, 2);
    updateCode();
  };
  const changeMode = () => {
    try {
      const parsed = JSON.parse(args.value);
      parsed.editable = loadMode.value === "true";
      apiLoadOptions(parsed);
      args.value = JSON.stringify(parsed, null, 2);
      updateCode();
    } catch {
      status.textContent = "JSON 인수를 확인하세요.";
    }
  };
  loadMode.addEventListener("change", changeMode);
  operation.addEventListener("change", choose);
  args.addEventListener("input", updateCode);
  const run = async () => {
    execute.disabled = true;
    status.textContent = "실제 엔진 실행 중";
    try {
      let value;
      try {
        value = JSON.parse(args.value);
      } catch {
        throw Error("InvalidJSON");
      }
      const record = await api.execute(operation.value, value);
      if (disposed) return;
      record.sequence = ++sequence;
      output.textContent = JSON.stringify(record, null, 2);
      output.dataset.sequence = String(sequence);
      output.dataset.ok = String(record.ok);
      status.textContent = record.ok
        ? "완료"
        : record.error === "ReadOnlyDocument"
          ? "읽기 전용: 쓰기가 거부되었습니다."
          : "오류: " + record.error;
      download.disabled = !api.getSaved();
    } catch (error) {
      if (!disposed) {
        output.textContent = JSON.stringify({ ok: false, error: error.message });
        output.dataset.sequence = String(++sequence);
        output.dataset.ok = "false";
        status.textContent = "오류: " + error.message;
      }
    } finally {
      if (!disposed) {
        execute.disabled = false;
        renderState();
      }
    }
  };
  execute.addEventListener("click", run);
  const saveDownload = () => {
    const saved = api.getSaved();
    if (!saved) return;
    const url = URL.createObjectURL(new Blob([saved.bytes]));
    const link = doc.createElement("a");
    link.href = url;
    link.download = "api-playground." + (saved.format === "hwp5" ? "hwp" : "hwpx");
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  download.addEventListener("click", saveDownload);
  section.append(
    title,
    intro,
    label,
    modeLabel,
    modeNote,
    argsLabel,
    code,
    execute,
    download,
    status,
    output,
    state,
  );
  root.append(section);
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
      execute.removeEventListener("click", run);
      operation.removeEventListener("change", choose);
      loadMode.removeEventListener("change", changeMode);
      args.removeEventListener("input", updateCode);
      download.removeEventListener("click", saveDownload);
      section.remove();
    },
  };
}
