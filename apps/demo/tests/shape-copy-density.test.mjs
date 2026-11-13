import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { documentFixture, all, fire } from './formatting-dialog-test-dom.ts';
import { SHAPE_COPY_FIELDS } from '../src/shape-copy-fields.ts';

// Execute the current modal builders with injected ports. No Native, fixture file,
// CSS loader or browser is involved; these are DOM/event and CSS source contracts.
function builder(file, name, dependencies = {}) {
  const source = readFileSync(new URL('../src/' + file, import.meta.url), 'utf8');
  const code = stripTypeScriptTypes(source.replace(/^import[\s\S]*?;\n/gm, ''));
  return new Function(
    ...Object.keys(dependencies),
    code.replace('export function ' + name, 'function ' + name) + '\nreturn ' + name,
  )(...Object.values(dependencies));
}
const createDialogLayer = builder('dialog-layer.ts', 'createDialogLayer');
const longReason = '현재 선택에서는 원본 값을 확인할 수 없어 복사할 수 없습니다. '.repeat(8);
function fixture(cell = false) {
  const d = documentFixture();
  const state = { content: { paragraphs: [{ section: 0, paragraph: 0, tableCell: cell }] } };
  const remembered = [];
  const listeners = new Set();
  const fields = cell
    ? ['border', 'background', 'padding', 'alignment', 'height', 'width'].map((key) => ({
        id: 'cell.' + key,
        label: '셀 ' + key,
        group: 'cell',
      }))
    : SHAPE_COPY_FIELDS;
  const options = fields.map((field, i) => ({
    ...field,
    enabled: i % 3 !== 0,
    reason: i % 3 === 0 ? longReason : null,
  }));
  const capture = { options };
  const port = {
    presentation: () => ({ enabled: true }),
    readSource: async () => capture,
    remember: (value, ids, current) => {
      assert.equal(value, capture);
      assert.equal(current(), true);
      remembered.push(ids);
    },
    clear() {},
    dispose() {},
  };
  const createShapeCopyTool = builder('shape-copy-tool.ts', 'createShapeCopyTool', {
    createDialogLayer,
    getSelectionFormatting: () => ({
      target: { section: 0, paragraph: 0, startUnit: 0, endUnit: 0 },
    }),
    createShapeCopyPort: () => port,
    createCellShapeCopyPort: () => port,
  });
  const tool = createShapeCopyTool({
    root: d.root,
    editor: {
      getEditorState: () => state,
      registerStateListener: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    onStatus() {},
    onPresentationChange() {},
    onClose() {},
  });
  return { ...d, tool, options, remembered, listeners };
}
for (const cell of [false, true]) {
  test(`${cell ? 'cell' : 'body'}: actual modal preserves labels, disabled reasons and unchecked defaults`, async () => {
    const f = fixture(cell);
    try {
      await f.tool.action('format-copy');
      const dialog = f.role('shape-copy');
      assert.equal(dialog.open, true);
      assert.equal(dialog.modal, true);
      assert.equal(dialog.getAttribute('aria-label'), '모양 복사');
      assert.equal(dialog.getAttribute('aria-modal'), 'true');
      assert.equal(f.doc.activeElement, f.role('shape-copy-cancel'));
      assert.equal(f.role('shape-copy-confirm').disabled, true);
      const modes = f.role('shape-copy-mode-character').parentElement.parentElement;
      assert.equal(modes.hidden, cell);
      assert.equal(f.role('shape-copy-mode-character').checked, true);
      const controls = all(dialog).filter((n) => n.dataset.shapeCopyField);
      assert.deepEqual(
        controls.map((n) => n.dataset.shapeCopyField),
        f.options.map((o) => o.id),
      );
      for (const [i, input] of controls.entries()) {
        const option = f.options[i];
        assert.equal(input.checked, false);
        assert.equal(input.disabled, !option.enabled);
        assert.equal(input.getAttribute('aria-label'), option.label);
        assert.equal(input.parentElement.tagName, 'LABEL');
        assert.equal(
          input.parentElement.children[1].textContent,
          option.label + (option.enabled ? '' : ' — ' + longReason),
        );
        assert.equal(input.parentElement.parentElement.tagName, 'FIELDSET');
      }
      assert.equal(
        all(dialog).find((n) => n.getAttribute('role') === 'status').textContent,
        '체크한 항목만 복사합니다.',
      );
      const enabled = controls.find((n) => !n.disabled);
      enabled.checked = true;
      fire(enabled, 'change');
      assert.equal(f.role('shape-copy-confirm').disabled, false);
      fire(f.role('shape-copy-confirm'), 'click');
      assert.deepEqual(f.remembered, [[enabled.dataset.shapeCopyField]]);
      assert.equal(f.role('shape-copy'), undefined);
    } finally {
      f.tool.dispose();
    }
    assert.equal(f.listeners.size, 0);
  });
}
test('actual mode switching preserves hidden groups and selected field ownership', async () => {
  const f = fixture();
  try {
    await f.tool.action('format-copy');
    const controls = all(f.root).filter((n) => n.dataset.shapeCopyField);
    const character = controls.find(
      (n) => !n.disabled && n.dataset.shapeCopyField.startsWith('character.'),
    );
    const paragraph = controls.find(
      (n) => !n.disabled && n.dataset.shapeCopyField.startsWith('paragraph.'),
    );
    assert.equal(character.parentElement.parentElement.hidden, false);
    assert.equal(paragraph.parentElement.parentElement.hidden, true);
    character.checked = true;
    fire(character, 'change');
    const radio = f.role('shape-copy-mode-paragraph');
    radio.checked = true;
    fire(radio, 'change');
    assert.equal(character.checked, true);
    assert.equal(character.parentElement.parentElement.hidden, true);
    assert.equal(paragraph.parentElement.parentElement.hidden, false);
    assert.equal(f.role('shape-copy-confirm').disabled, true);
    paragraph.checked = true;
    fire(paragraph, 'change');
    const both = f.role('shape-copy-mode-both');
    both.checked = true;
    fire(both, 'change');
    assert.equal(character.parentElement.parentElement.hidden, false);
    assert.equal(paragraph.parentElement.parentElement.hidden, false);
    fire(f.role('shape-copy-confirm'), 'click');
    assert.deepEqual(f.remembered, [
      [character.dataset.shapeCopyField, paragraph.dataset.shapeCopyField],
    ]);
  } finally {
    f.tool.dispose();
  }
});

const css = readFileSync(new URL('../src/dialog-layer.css', import.meta.url), 'utf8');
const marker = '/* Shape copy:';
const scope = ".hwp-dialog-layer[data-role='shape-copy']";
const ownCSS = css.slice(css.indexOf(marker));
const rules = Array.from(ownCSS.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g))
  .filter((m) => !m[1].trim().startsWith('@'))
  .map((m) => ({
    selectors: m[1].split(',').map((s) => s.trim()),
    body: m[2],
  }));
const rule = (suffix) => {
  const found = rules.find((r) => r.selectors.includes(scope + suffix));
  assert(found, suffix);
  return found.body;
};
test('CSS scope, bounded modal and single body scroll preserve shared chrome and closed dialog behavior', () => {
  assert(css.includes(marker));
  assert(rules.length > 10);
  for (const { selectors } of rules)
    for (const selector of selectors) assert(selector.startsWith(scope), selector);
  assert.match(rule(''), /width:\s*min\(760px, calc\(100vw - 24px\)\)/);
  assert.match(rule(''), /max-height:\s*min\(640px, calc\(100dvh - 32px\)\)/);
  assert.doesNotMatch(rule(''), /display:/);
  assert.match(rule('[open]'), /display:\s*flex/);
  assert.match(rule('[open]'), /flex-direction:\s*column/);
  const body = rule(' .hwp-dialog-body');
  for (const contract of [
    /min-height:\s*0/,
    /max-height:\s*none/,
    /overflow:\s*auto/,
    /overscroll-behavior:\s*contain/,
    /scrollbar-gutter:\s*stable/,
  ])
    assert.match(body, contract);
  assert.match(rule(' .hwp-dialog-footer'), /flex:\s*0 0 auto/);
  assert.match(css, /\.hwp-dialog-layer \[hidden\]\s*\{\s*display: none !important/);
});
test('CSS separates labels with wrapping, native controls, visible focus and a narrow-screen single column', () => {
  assert.match(rule(' fieldset'), /grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(rule(' label'), /grid-template-columns:\s*18px minmax\(0, 1fr\)/);
  assert.match(rule(' label'), /overflow-wrap:\s*anywhere/);
  assert.match(rule(' label'), /min-height:\s*36px/);
  assert.match(rule(' label:has(input:focus-visible)'), /outline:\s*2px solid/);
  assert.match(rule(' label:has(input:checked)'), /box-shadow:/);
  assert.match(rule(' fieldset > p'), /grid-column:\s*1 \/ -1/);
  assert.match(ownCSS, /@media \(max-width: 580px\)/);
  assert.match(
    rules.filter((r) => r.selectors.includes(scope + ' fieldset')).at(-1).body,
    /grid-template-columns:\s*minmax\(0, 1fr\)/,
  );
  // Long reasons remain full text, and native checked/disabled controls remain visible.
  assert.doesNotMatch(ownCSS, /text-overflow|line-clamp|appearance:|pointer-events:|\border:/);
  assert.doesNotMatch(
    ownCSS,
    /(?:display:\s*none|visibility:\s*hidden|overflow:\s*hidden|opacity:)/,
  );
});
