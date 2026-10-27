import assert from 'node:assert/strict';
for (const key of ['window', 'document'])
  Object.defineProperty(globalThis, key, {
    configurable: true,
    get() {
      throw Error('DOMAccess:' + key);
    },
  });
if (process.argv[2] === 'root') {
  const sdk = await import('../../src/index.ts');
  assert.equal(typeof sdk.createEditor, 'function');
  console.log(
    JSON.stringify({ moduleImportNoDOM: true, codecProvided: true, actualRNExecution: false }),
  );
} else {
  Object.defineProperty(globalThis, 'TextEncoder', {
    configurable: true,
    writable: true,
    value: undefined,
  });
  const { fontNameMessage } = await import('../../src/commands/font-name.ts');
  const { EditorState } = await import('../../src/state/editor-state.ts');
  const { createParagraphSelection } = await import('../../src/state/paragraph-selection.ts');
  const s = new EditorState({
    editorId: 'no-dom',
    documentId: 'doc',
    generation: 1,
    operationRevision: 1,
    viewRevision: 1,
    stateVersion: 1,
    status: 'ready',
    content: {
      format: 'hwpx',
      characterFontNameAvailable: true,
      paragraphs: [
        { section: 0, paragraph: 0, text: 'A', editable: true, selectionOwner: 'section:0:body' },
      ],
    },
  });
  const target = createParagraphSelection(s, {
    section: 0,
    paragraph: 0,
    startUnit: 0,
    endUnit: 1,
  });
  assert.throws(
    () => fontNameMessage({ target, language: 'latin', name: 'Font' }, s),
    /FontNameEncodingUnavailable/,
  );
  assert.equal(globalThis.TextEncoder, undefined);
  console.log(
    JSON.stringify({
      fontModuleNoDOM: true,
      fontModuleWithoutCodec: true,
      commandWithoutEncoder: 'FontNameEncodingUnavailable',
      polyfillInstalled: false,
      actualRNExecution: false,
    }),
  );
}
