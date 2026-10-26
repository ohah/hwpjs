import assert from 'node:assert/strict';
import test from 'node:test';
import { findText } from '../../web/preview/text-search.mjs';
import { createFindControls } from '../../web/preview/find-controls.mjs';
const row = (text, extra = {}) => ({ section: 0, paragraph: 0, text, selectable: true, ...extra });

test('find focus opens the containing disclosure before focus without retaining a second open state', () => {
  const form = new EventTarget(),
    disclosure = { open: false };
  form.closest = (selector) => {
    assert.equal(selector, 'details');
    return disclosure;
  };
  let calls = 0;
  const input = {
    focus() {
      assert.equal(disclosure.open, true);
      calls++;
    },
    select() {},
  };
  const control = createFindControls({
    form,
    input,
    note: {},
    search() {
      throw new Error('UnexpectedSearch');
    },
    select() {
      throw new Error('UnexpectedEdit');
    },
  });
  control.focus();
  disclosure.open = false;
  control.focus();
  assert.equal(calls, 2);
  disclosure.open = false;
  control.close();
  assert.equal(control.focus(), false);
  assert.equal(disclosure.open, false);
});

test('find menu focus shares shortcut authority without searching or editing and closes safely', () => {
  const form = new EventTarget();
  let focused = 0,
    selected = 0;
  const input = {
    value: '사용자 초안',
    focus() {
      focused++;
    },
    select() {
      selected++;
    },
  };
  const control = createFindControls({
    form,
    input,
    note: {},
    search() {
      throw new Error('FocusMustNotSearch');
    },
    select() {
      throw new Error('FocusMustNotEdit');
    },
  });
  assert.equal(control.focus(), true);
  assert.equal(input.value, '사용자 초안');
  assert.equal(focused, 1);
  assert.equal(selected, 1);
  control.close();
  control.close();
  assert.equal(control.focus(), false);
  assert.equal(focused, 1);
  assert.equal(selected, 1);
});

test('find shortcut is scoped to Canvas and ignores composition modifiers repeats and removed listeners', () => {
  const form = new EventTarget(),
    shortcuts = new EventTarget();
  let focused = 0,
    selected = 0,
    inside = true;
  const input = {
    value: 'query',
    focus() {
      focused++;
    },
    select() {
      selected++;
    },
  };
  const control = createFindControls({
    form,
    input,
    note: {},
    search: () => {
      throw new Error('ShortcutMustNotSearch');
    },
    select: () => {
      throw new Error('ShortcutMustNotEdit');
    },
    shortcuts,
    scope: { contains: () => inside },
  });
  const key = (properties) => {
    const event = new Event('keydown', { cancelable: true });
    Object.assign(event, { key: 'f', ctrlKey: true }, properties);
    shortcuts.dispatchEvent(event);
    return event.defaultPrevented;
  };
  assert.equal(key({}), true);
  assert.equal(key({ ctrlKey: false, metaKey: true, key: 'F' }), true);
  for (const properties of [
    { isComposing: true },
    { keyCode: 229 },
    { repeat: true },
    { altKey: true },
    { shiftKey: true },
    { ctrlKey: false },
    { key: 'g' },
  ])
    assert.equal(key(properties), false);
  inside = false;
  assert.equal(key({}), false);
  inside = true;
  control.close();
  assert.equal(key({}), false);
  assert.equal(focused, 2);
  assert.equal(selected, 2);
  assert.equal(input.value, 'query');
});

test('literal search includes protected selectable text and respects grapheme boundaries', () => {
  const paragraphs = [
    row('가😀 e\u0301 .* 가'),
    row('가', { paragraph: 1, clipped: true }),
    row('가', { paragraph: 2, selectable: false }),
  ];
  assert.deepEqual(
    findText(paragraphs, '가').matches.map((m) => m.startUnit),
    [0, 10],
  );
  assert.equal(findText(paragraphs, '😀').matches[0].endUnit, 3);
  assert.equal(findText(paragraphs, 'e').matches.length, 0);
  assert.equal(findText(paragraphs, 'e\u0301').matches.length, 1);
  assert.equal(findText(paragraphs, '.*').matches.length, 1);
  assert.throws(() => findText(paragraphs, '\ud800'), /InvalidTextSearch/);
});

test('find controls refresh matches on each submit and never advance a refused selection', () => {
  const form = new EventTarget(),
    input = { value: 'a' },
    note = {},
    selected = [];
  let allowed = true,
    paragraphs = [row('aa')];
  const controls = createFindControls({
    form,
    input,
    note,
    search: (query) => findText(paragraphs, query),
    select: (match) => {
      if (!allowed) return false;
      selected.push(match);
      return true;
    },
  });
  const submit = () => form.dispatchEvent(new Event('submit', { cancelable: true }));
  submit();
  assert.equal(selected.at(-1).startUnit, 0);
  allowed = false;
  submit();
  assert.equal(selected.length, 1);
  allowed = true;
  submit();
  assert.equal(selected.at(-1).startUnit, 1);
  paragraphs = [row('ba', { paragraph: 3 })];
  submit();
  assert.equal(selected.at(-1).paragraph, 3);
  paragraphs = [];
  submit();
  assert.match(note.textContent, /찾지 못했습니다/);
  controls.close();
  submit();
  assert.equal(selected.length, 3);
});
test('search is bounded and does not mutate current text', () => {
  const paragraphs = [row('aaa')],
    before = structuredClone(paragraphs);
  assert.deepEqual(findText(paragraphs, 'aa', 1), {
    matches: [{ section: 0, paragraph: 0, startUnit: 0, endUnit: 2 }],
    limited: true,
  });
  assert.equal(findText(paragraphs, 'aaa', 1).limited, false);
  assert.deepEqual(findText(paragraphs, ''), { matches: [], limited: false });
  assert.deepEqual(paragraphs, before);
});

test('replace reselects fresh hits, allows deletion, and refuses stale or protected results', () => {
  const form = new EventTarget(),
    button = new EventTarget(),
    input = { value: 'a' },
    replacement = { value: '' },
    note = {};
  let paragraphs = [row('aa')],
    allowed = true;
  const calls = [],
    selections = [];
  const control = createFindControls({
    form,
    input,
    replacement,
    replaceButton: button,
    note,
    search: (query) => findText(paragraphs, query),
    select: (match) => {
      selections.push(match);
      return true;
    },
    replace: (text) => {
      if (!allowed) return false;
      calls.push(text);
      return true;
    },
  });
  form.dispatchEvent(new Event('submit'));
  button.dispatchEvent(new Event('click'));
  assert.deepEqual(calls, ['']);
  assert.equal(selections.at(-1).startUnit, 0);
  allowed = false;
  button.dispatchEvent(new Event('click'));
  assert.deepEqual(calls, ['']);
  assert.match(note.textContent, /바꿀 수 없거나/);
  paragraphs = [row('bb')];
  button.dispatchEvent(new Event('click'));
  assert.equal(selections.length, 3);
  assert.match(note.textContent, /다시 찾은/);
  control.close();
  button.dispatchEvent(new Event('click'));
  assert.deepEqual(calls, ['']);
});
