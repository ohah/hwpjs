import { createEditor, createParagraphSelection } from '@hwpjs/core';
import { createFormattingBridge } from '../src/formatting-bridge.ts';
export const languages = ['hangul', 'latin', 'hanja', 'japanese', 'other', 'symbol', 'user'];
export async function fixture(options = {}) {
  const messages = [],
    requests = [],
    statuses = [],
    results = [];
  let serial = 0,
    composing = false,
    host,
    captures = 0,
    focused = 0;
  const typing = { size: 1500, bold: true, italic: false };
  const content = {
    format: 'hwp5',
    characterPropertiesAvailable: true,
    characterFontNameAvailable: true,
    characterUnderlineAvailable: true,
    characterStrikeAvailable: true,
    characterTextColorAvailable: true,
    paragraphAlignmentAvailable: true,
    characterShapes: [{ id: 0, height: 1500, bold: true, italic: false }],
    characterFontReferences: [{ id: 0, fontIds: languages.map(() => 0) }],
    fontFaces: languages.map((language) => ({ language, id: 0, name: '문서원본' })),
    paragraphs: [
      {
        section: 0,
        paragraph: 0,
        text: 'AB',
        editable: true,
        selectionOwner: 'section:0:body',
        currentReference: { kind: 'original', section: 0, id: '0' },
        characterRanges: [{ start: 0, end: 2, charShapeId: 0 }],
      },
    ],
  };
  const core = createEditor({
    runtimeFactory: () => ({
      async request(m) {
        messages.push(m);
        return { kind: m.kind, content, meta: { application: 'unapplied', changed: false } };
      },
      dispose() {},
    }),
  });
  await core.load(new Uint8Array([1]), { format: 'hwp5', editable: !options.readonly });
  const select = (start = 1, end = start) =>
    core.setSelection(
      createParagraphSelection(core.getEditorState(), {
        section: 0,
        paragraph: 0,
        startUnit: start,
        endUnit: end,
      }),
    );
  await select();
  const editor = {
    getEditorState: () => core.getEditorState(),
    registerStateListener: (fn) => core.registerStateListener(fn),
    dispatchCommand: (...args) => core.dispatchCommand(...args),
    async update(fn) {
      options.onUpdate?.(f);
      await core.update(fn);
    },
  };
  const originalHost = {
    captureCaretFormatting() {
      captures++;
      if (composing) return null;
      const state = core.getEditorState(),
        seen = serial;
      let applied = false;
      const reason = options.readonly ? 'ReadOnlyDocument' : null;
      const names = Object.fromEntries(
        languages.map((k) => [k, { kind: 'single', name: typing[k] ?? '문서원본' }]),
      );
      const capture = {
        mode: 'typing',
        state,
        observation: {
          ...typing,
          underline: false,
          strike: false,
          textColor: '#123456',
          fontNames: names,
          align: null,
        },
        reasons: {
          characterAvailableReason: reason,
          underlineAvailableReason: 'CaretUnderlineUnsupported',
          strikeAvailableReason: 'CaretStrikeUnsupported',
          textColorAvailableReason: 'CaretColorUnsupported',
          fontNameAvailableReasons: Object.fromEntries(languages.map((k) => [k, reason])),
          fontNamesAvailableReason: 'CaretRepresentativeFontUnsupported',
          paragraphAvailableReason: reason,
        },
        current: () => seen === serial && !composing && core.getEditorState() === state,
        appliedCurrent: () =>
          applied && seen === serial && !composing && core.getEditorState() === state,
        bindDialog: () => seen === serial && !options.bindFailure,
        request(intent) {
          if (reason || !capture.current()) return false;
          options.beforeRequest?.(f);
          if (!capture.current()) return false;
          if (intent.kind === 'character-properties') Object.assign(typing, intent.properties);
          else if (intent.kind === 'font-name') typing[intent.language] = intent.name;
          else return false;
          requests.push(intent);
          applied = true;
          return true;
        },
      };
      options.onCapture?.(f, capture);
      return capture;
    },
  };
  host = originalHost;
  const f = {
    core,
    editor,
    content,
    messages,
    requests,
    typing,
    statuses,
    results,
    select,
    change: () => serial++,
    compose: (v) => (composing = v),
    replaceHost: () => (host = { ...originalHost }),
    getHost: () => host,
    get captures() {
      return captures;
    },
    get focused() {
      return focused;
    },
    async dispose() {
      f.bridge.dispose();
      await core.dispose();
    },
  };
  f.bridge = createFormattingBridge({
    editor,
    getSurfaceFormattingHost: () => host,
    onStatus(s) {
      statuses.push(s);
      options.onStatus?.(f, s);
    },
    onResult: (r) => results.push(r),
    onFocus() {
      focused++;
    },
  });
  return f;
}
