import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createParagraphSelection, EditorState, INSERT_DOCUMENT_COMMAND } from '@hwpjs/core';
import { createDocumentInsertTool } from '../src/document-insert-tool.ts';
import { all, Document, fire } from './fake-dom.mjs';

const tick = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};
function fixture(t, { capability, result } = {}) {
  const doc = new Document();
  const create = doc.createElement.bind(doc);
  doc.createElement = (tag) => {
    const node = create(tag);
    if (tag === 'dialog') {
      node.showModal = () => {
        node.open = true;
      };
      node.close = () => {
        node.open = false;
      };
    }
    return node;
  };
  const root = doc.createElement('main');
  const data = {
    editorId: 'editor',
    documentId: 'doc',
    generation: 1,
    operationRevision: 1,
    viewRevision: 1,
    stateVersion: 1,
    status: 'ready',
    content: {
      format: 'hwpx',
      paragraphs: [
        {
          section: 0,
          paragraph: 0,
          text: 'A😀BZ',
          selectionOwner: 'section:0:body',
          editable: true,
        },
      ],
    },
  };
  const withCaret = (unit, stateVersion) =>
    new EditorState({
      ...data,
      stateVersion,
      selection: createParagraphSelection(new EditorState(data), {
        section: 0,
        paragraph: 0,
        startUnit: unit,
      }),
    });
  let state = withCaret(3, 2);
  const dispatches = [],
    queries = [],
    statuses = [];
  const tool = createDocumentInsertTool({
    root,
    editor: {
      getEditorState: () => state,
      getDocumentInsertionCapabilities: async (options) => {
        queries.push(options);
        return capability ?? { available: true, maxSourceBytes: 8 };
      },
      async dispatchCommand(command, payload) {
        dispatches.push({ command, payload });
        return result ?? { status: 'committed-with-snapshot' };
      },
    },
    onStatus: (value) => statuses.push(value),
    onPresentationChange() {},
  });
  t.after(() => tool.dispose());
  const find = (predicate) => all(root, predicate)[0];
  const role = (name) => find((node) => node.dataset.role === name);
  return {
    tool,
    root,
    dispatches,
    queries,
    statuses,
    state: () => state,
    move: () => {
      state = withCaret(1, 3);
    },
    source: () => role('document-insert-source'),
    submit: () => role('document-insert-confirm'),
    status: () => find((node) => node.getAttribute('role') === 'status')?.textContent,
    select(file) {
      const input = role('document-insert-source');
      input.files = [file];
      fire(input, 'change');
    },
  };
}
const source = (overrides = {}) => ({
  name: 'donor.hwpx',
  size: 2,
  arrayBuffer: async () => new Uint8Array([1, 2]).buffer,
  ...overrides,
});

test('picker captures a public caret and version at admission and sends one typed command', async (t) => {
  const f = fixture(t);
  const admitted = f.state();
  f.tool.open();
  assert.equal(f.source().accept, '.hwpx');
  assert.equal(f.source().disabled, true);
  await tick();
  assert.deepEqual(f.queries, [{ token: admitted.token }]);
  assert.equal(f.source().disabled, false);
  f.select(source());
  const submit = f.submit();
  fire(submit, 'click');
  fire(submit, 'click');
  await tick();
  assert.equal(f.dispatches.length, 1);
  const [{ command, payload }] = f.dispatches;
  assert.equal(command, INSERT_DOCUMENT_COMMAND);
  assert.equal(payload.selectionVersion, admitted.stateVersion);
  assert.deepEqual({ ...payload.target }, { ...admitted.selection });
  assert.deepEqual([...payload.bytes], [1, 2]);
  assert.equal(f.root.children.length, 0);
  assert.deepEqual(f.statuses, ['HWPX 문서를 끼워 넣었습니다.']);
});

test('a caret change during the asynchronous file read never retargets or dispatches', async (t) => {
  const f = fixture(t);
  f.tool.open();
  await tick();
  const read = Promise.withResolvers();
  f.select(source({ arrayBuffer: () => read.promise }));
  fire(f.submit(), 'click');
  f.move();
  read.resolve(new Uint8Array([1, 2]).buffer);
  await tick();
  assert.equal(f.dispatches.length, 0);
  assert.match(f.status(), /위치가 바뀌었습니다/);
  assert.equal(f.source().disabled, true);
});

test('denied capability and invalid file names or sizes do not read or dispatch bytes', async (t) => {
  const denied = fixture(t, {
    capability: { available: false, reason: 'DocumentInsertionUnavailable' },
  });
  denied.tool.open();
  await tick();
  assert.equal(denied.source().disabled, true);
  assert.match(denied.status(), /문서 엔진.*지원하지 않습니다/);

  const f = fixture(t);
  f.tool.open();
  await tick();
  let reads = 0;
  for (const invalid of [{ name: 'other.hwp' }, { size: 0 }, { size: 9 }]) {
    f.select(
      source({
        arrayBuffer: async () => {
          reads++;
        },
        ...invalid,
      }),
    );
    assert.equal(f.submit().disabled, true);
    fire(f.submit(), 'click');
  }
  await tick();
  assert.equal(reads, 0);
  assert.equal(f.dispatches.length, 0);
});

test('profile rejection is explained and an applied refresh error cannot resend', async (t) => {
  const denied = fixture(t, {
    result: { status: 'rejected-unapplied', error: 'UnsupportedInsertBody' },
  });
  denied.tool.open();
  await tick();
  denied.select(source());
  fire(denied.submit(), 'click');
  await tick();
  assert.match(denied.status(), /한 구역의 일반 본문.*UnsupportedInsertBody/);
  assert.equal(denied.statuses.length, 0);

  const committed = fixture(t, { result: { status: 'committed-refresh-required' } });
  committed.tool.open();
  await tick();
  committed.select(source());
  const submit = committed.submit();
  fire(submit, 'click');
  await tick();
  fire(submit, 'click');
  assert.equal(committed.dispatches.length, 1);
  assert.equal(committed.root.children.length, 0);
  assert.match(committed.statuses[0], /반영됐습니다.*다시 넣지 마세요/);
});
