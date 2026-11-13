export const tick = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};
export function fixture() {
  let revision = 0,
    value = 'a + b',
    state;
  const listeners = new Set(),
    calls = [],
    messages = [],
    invalidations = [];
  const replace = (patch = {}) => {
    state = {
      editorId: 'editor',
      documentId: 'doc',
      generation: 1,
      operationRevision: revision,
      viewRevision: revision,
      status: 'ready',
      historyRecoveryRequired: false,
      content: { format: 'hwpx' },
      capabilities: { equationScriptAvailable: true, equationSectionCount: 2 },
      ...patch,
    };
    state.token = {
      editorId: state.editorId,
      documentId: state.documentId,
      generation: state.generation,
      operationRevision: state.operationRevision,
      viewRevision: state.viewRevision,
    };
    for (const listener of listeners) listener(state);
    return state;
  };
  replace();
  const sources = [{ node: 3, script_node: 4, script_count: 1, active: true, issue: null }];
  const reply = (m) =>
    m.kind === 'equation-sources'
      ? { ...m, sources }
      : { ...m, equation: { section: m.section, node: m.node, value, revision } };
  const editor = {
    getEditorState: () => state,
    registerStateListener: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    readResource: async (message, options) => {
      calls.push({ message, options });
      return reply(message);
    },
    requestExperimental: async (message, options) => {
      calls.push({ message, options });
      value = message.value;
      revision++;
      replace();
      return { status: 'committed-with-snapshot', state, reply: reply(message) };
    },
  };
  return {
    editor,
    replace,
    calls,
    messages,
    invalidations,
    listeners,
    sources,
    reply,
    options: { receive: (m) => messages.push(m), invalidate: (r) => invalidations.push(r) },
  };
}
export class Element extends EventTarget {
  constructor(tagName, doc) {
    super();
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = doc;
    this.children = [];
    this.value = '';
    this.disabled = false;
    this.hidden = false;
    this.dataset = {};
    this.style = {};
    this.classList = { add() {} };
    this.attributes = {};
  }
  append(...nodes) {
    for (const n of nodes) {
      this.children.push(n);
      n.parentElement = this;
    }
  }
  replaceChildren(...nodes) {
    this.children = [];
    this.append(...nodes);
  }
  setAttribute(k, v) {
    this.attributes[k] = v;
  }
  focus() {}
  showModal() {
    this.open = true;
  }
  close() {
    this.open = false;
  }
  remove() {
    this.parentElement.children = this.parentElement.children.filter((n) => n !== this);
  }
  fire(type) {
    return this.dispatchEvent(new Event(type, { cancelable: true }));
  }
}
export function dom() {
  const doc = { createElement: (tag) => new Element(tag, doc), querySelector: () => null };
  return { doc, root: new Element('main', doc) };
}
