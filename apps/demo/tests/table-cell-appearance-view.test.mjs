import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createTableCellAppearanceView } from '../src/table-cell-appearance-view.ts';
import { createTableCellAppearancePort } from '../src/table-cell-appearance-port.ts';
import { createTableCellAppearanceController } from '../src/table-cell-appearance-tool.ts';
import { createTableInsertDialog } from '../src/table-insert-dialog.ts';
import { documentFixture, fire, all } from './formatting-dialog-test-dom.ts';
import { fixture } from './table-cell-properties-fixture.mjs';
function setup(cap = true, options = {}) {
  const f = fixture(options.actualFormat ?? 'hwp5');
  if (options.actualFormat) {
    const cases = JSON.parse(
      readFileSync(
        new URL(
          '../../../tools/tests/fixtures/table-cell-appearance-observation.json',
          import.meta.url,
        ),
        'utf8',
      ),
    ).cases;
    const paragraph = f.state.content.paragraphs[0];
    f.state.content = structuredClone(cases[options.actualFormat]);
    const tableNode = options.actualFormat === 'hwp5' ? 20 : 59;
    const listNode = options.actualFormat === 'hwp5' ? 21 : 66;
    f.state.content.paragraphs = [
      { ...paragraph, paragraph: 2, tableCell: { tableNode, listNode } },
    ];
    f.state.selection.paragraph = 2;
  }
  if (options.diagonalSource && options.actualFormat) {
    if (options.actualFormat === 'hwp5') {
      const cell = f.state.content.tables[0].cells.find((cell) => cell.listNode === 21);
      const style = f.state.content.hwp5BorderFillSources[cell.layoutSource.border_fill_id - 1];
      style.attributes = options.diagonalSource.attributes ?? 0x40;
      style.borders[4] = { kind: 1, width: 0, color: 0x332211, ...options.diagonalSource.border };
    } else {
      const report = f.state.content.tableBorderSources[0],
        binding = report.cells.find((cell) => cell.list_node === 66);
      Object.assign(
        report.styles[binding.style_index],
        {
          slash: 'CENTER',
          back_slash: 'NONE',
          center_line: 'NONE',
          slash_crooked: '0',
          slash_is_counter: '0',
          back_slash_crooked: '0',
          back_slash_is_counter: '0',
          diagonal: { style: 'SOLID', width: '0.1 mm', color: '#112233' },
        },
        options.diagonalSource,
      );
    }
  }
  if (options.diagonalCap !== undefined)
    f.state.capabilities.cellDiagonalAvailable = options.diagonalCap;
  if (options.fourCells) {
    const table = f.state.content.tables[0],
      original = table.cells[0];
    table.rows = table.columns = 2;
    table.cells = Array.from({ length: 4 }, (_, i) => ({
      ...original,
      listNode: 82 + i,
      row: i >> 1,
      column: i % 2,
      paragraphs: i === 0 ? [15] : [16 + i],
    }));
  }
  f.state.capabilities.cellAppearanceAvailable = cap;
  if (options.styleBatch !== undefined)
    f.state.capabilities.cellStyleBatchAvailable = options.styleBatch;
  const p = createTableCellAppearancePort(f.editor, f.api),
    c = options.observed ? { ...p.capture(), observed: options.observed } : p.capture(),
    dom = documentFixture(),
    calls = [];
  const view = createTableCellAppearanceView(dom.root, c, {
    apply: (d, keepOpen) => calls.push({ d, keepOpen }),
    dismiss: () => calls.push('dismiss'),
  });
  const role = (n) => dom.role('appearance-' + n),
    choose = (n, v) => {
      role(n).value = v;
      fire(role(n), 'change');
    };
  const border = () => {
    choose('border-style', 'SOLID');
    choose('border-width', '12');
    choose('border-hex', '#000000');
  };
  return { f, p, c, dom, view, calls, role, choose, border };
}
test('supported two tabs with explicit current-value unknown; initial confirm dismisses without mutation', () => {
  const s = setup();
  assert.equal(s.role('border-style').value, '');
  assert.equal(s.role('border-hex').value, '');
  const tabs = all(s.dom.root).filter((n) => n.getAttribute('role') === 'tab');
  assert.deepEqual(
    tabs.map((n) => n.textContent),
    ['테두리', '배경'],
  );
  assert.equal(s.role('apply').disabled, true);
  assert.equal(s.role('confirm').disabled, false);
  fire(s.role('confirm'), 'click');
  assert.deepEqual(s.calls, ['dismiss']);
  s.view.destroy();
});
test('explicit border plus background produces one combined draft; apply keeps open and confirm closes', () => {
  const s = setup();
  s.border();
  s.choose('background-hex', '#abcdef');
  fire(s.role('apply'), 'click');
  fire(s.role('confirm'), 'click');
  assert.equal(s.calls.length, 2);
  assert.equal(s.calls[0].keepOpen, true);
  assert.equal(s.calls[1].keepOpen, false);
  assert.equal(s.calls[0].d.border.edges, 15);
  assert.equal(s.calls[0].d.background.color, '#abcdef');
  s.view.destroy();
});
test('range is explicit one-based input and background cannot silently apply to one cell', () => {
  const s = setup();
  s.border();
  s.choose('background-hex', '#abcdef');
  s.choose('mode', 'range');
  assert.equal(s.role('apply').disabled, true);
  assert.match(s.role('status').textContent, /현재 셀/);
  s.role('background-enabled').checked = false;
  fire(s.role('background-enabled'), 'change');
  assert.equal(s.role('apply').disabled, false);
  fire(s.role('apply'), 'click');
  assert.equal(s.calls[0].d.border.startRow, '1');
  assert.equal(s.calls[0].d.border.endColumn, '1');
  assert.equal(s.calls[0].d.background, null);
  assert.equal(s.role('background-hex').disabled, true);
  s.view.destroy();
});
test('IME, busy, stale and detached handlers prevent duplicate submissions and dismissal', () => {
  const s = setup();
  s.border();
  const dialog = s.dom.role('table-cell-appearance-dialog');
  fire(dialog, 'compositionstart');
  fire(s.role('apply'), 'click');
  fire(s.role('cancel'), 'click');
  assert.equal(s.calls.length, 0);
  fire(dialog, 'compositionend');
  s.view.setBusy(true);
  fire(s.role('apply'), 'click');
  s.view.setBusy(false);
  s.view.setStale('stale');
  fire(s.role('confirm'), 'click');
  assert.equal(s.calls.length, 0);
  const cancel = s.role('cancel'),
    apply = s.role('apply');
  s.view.destroy();
  fire(cancel, 'click');
  fire(apply, 'click');
  assert.equal(s.calls.length, 0);
});
test('reset after recapture clears every dirty intent without fabricating observed values', () => {
  const s = setup();
  s.border();
  s.choose('background-hex', '#ffffff');
  s.view.reset(s.p.capture());
  assert.equal(s.role('border-enabled').checked, false);
  assert.equal(s.role('background-enabled').checked, false);
  assert.equal(s.role('border-style').value, '');
  assert.equal(s.role('background-hex').value, '');
  assert.equal(s.role('apply').disabled, true);
  s.choose('border-style', 'SOLID');
  s.choose('border-width', '12');
  assert.equal(s.role('apply').disabled, true);
  s.view.destroy();
});
test('capability unavailable disables all mutation fields but allows cancel', () => {
  const s = setup(false);
  for (const n of [
    'border-style',
    'border-width',
    'border-hex',
    'background-hex',
    'apply',
    'confirm',
  ])
    assert.equal(s.role(n).disabled, true);
  fire(s.role('cancel'), 'click');
  assert.deepEqual(s.calls, ['dismiss']);
  s.view.destroy();
});
test('tab keyboard navigation follows focus and ignores composition', () => {
  const s = setup(),
    a = s.role('border-tab'),
    b = s.role('background-tab');
  fire(a, 'keydown', { key: 'ArrowRight', isComposing: true });
  assert.equal(a.getAttribute('aria-selected'), 'true');
  fire(a, 'keydown', { key: 'ArrowRight' });
  assert.equal(s.dom.doc.activeElement, b);
  assert.equal(b.getAttribute('aria-selected'), 'true');
  fire(b, 'keydown', { key: 'Home' });
  assert.equal(s.dom.doc.activeElement, a);
  s.view.destroy();
});
test('table creation uses five-by-five defaults with only real fixed dimensions', () => {
  const dom = documentFixture(),
    calls = [];
  const view = createTableInsertDialog(dom.root, {
    onInsert: (d) => calls.push(d),
    onDismiss: () => {},
  });
  assert.equal(dom.role('table-rows').value, '5');
  assert.equal(dom.role('table-columns').value, '5');
  fire(dom.role('table-insert'), 'click');
  assert.deepEqual(calls, [{ rows: '5', columns: '5', widthPoints: '360', rowHeightPoints: '18' }]);
  assert.equal(all(dom.root).filter((n) => n.tagName === 'FIELDSET').length, 2);
  view.destroy();
});
test('Native refusal remains visible when pending is released and clears only on next submission or recapture', () => {
  const s = setup();
  s.border();
  s.view.setBusy(true);
  s.view.setStatus('보호된 셀입니다.');
  s.view.setBusy(false);
  assert.equal(s.role('status').textContent, '보호된 셀입니다.');
  s.view.reset(s.p.capture());
  assert.doesNotMatch(s.role('status').textContent, /보호된/);
  s.view.destroy();
});

test('compact edge choices preserve semantic keys and preview reflects selected edges and bulk region', () => {
  const s = setup();
  const choices = s.role('edge-choices');
  assert.equal(choices.children.length, 4);
  assert.equal(s.role('edge-preview').dataset.edges, '15');
  s.role('left').checked = false;
  fire(s.role('left'), 'change');
  assert.equal(s.role('edge-preview').dataset.left, 'false');
  assert.doesNotMatch(s.role('edge-preview').getAttribute('aria-label'), /왼쪽/);
  s.choose('mode', 'table');
  s.choose('region', 'inner');
  assert.equal(choices.hidden, true);
  assert.equal(s.role('edge-preview').dataset.region, 'inner');
  assert.match(s.role('edge-preview').getAttribute('aria-label'), /안쪽/);
  assert.equal(s.role('edge-preview').dataset.top, 'false');
  s.view.destroy();
});

test('legacy capability does not expose experimental fill controls or accept synthetic hidden changes', () => {
  const s = setup();
  for (const n of ['fill-kind', 'hatch-style', 'hatch-hex', 'end-hex', 'angle', 'step']) {
    assert.equal(s.role(n).disabled, true, n);
    fire(s.role(n), 'change');
  }
  assert.equal(s.role('background-enabled').checked, false);
  assert.equal(s.role('apply').disabled, true);
  s.choose('background-hex', '#123456');
  fire(s.role('apply'), 'click');
  assert.deepEqual(s.calls[0].d.background, { color: '#123456', dirty: true });
  assert.equal('target' in s.calls[0].d, false);
  s.view.destroy();
});

test('Apply recapture preserves background tab but clears prior scope, region and dirty intent', () => {
  const s = setup();
  fire(s.role('background-tab'), 'click');
  s.choose('mode', 'range');
  s.choose('startRow', '2');
  s.choose('region', 'inner');
  s.view.reset(s.p.capture());
  assert.equal(s.role('background-tab').getAttribute('aria-selected'), 'true');
  assert.equal(s.role('mode').value, 'cell');
  assert.equal(s.role('region').value, 'outer');
  assert.equal(s.role('startRow').value, '1');
  assert.equal(s.role('apply').disabled, true);
  assert.equal(s.role('edge-preview').dataset.region, 'cell');
  s.view.destroy();
});

test('verified observations seed without dirty intent; mixed and unknown edges do not become black', () => {
  const edge = { state: 'known', style: 'SOLID', width: 12, color: '#123456' };
  const s = setup(true, {
    observed: {
      edges: { left: edge, right: edge, top: edge, bottom: edge },
      fill: { state: 'known', kind: 'solid', color: '#e7e7a5' },
    },
  });
  assert.equal(s.role('border-hex').value, '#123456');
  assert.equal(s.role('background-hex').value, '#e7e7a5');
  assert.equal(s.role('border-enabled').checked, false);
  assert.equal(s.role('background-enabled').checked, false);
  assert.equal(s.role('apply').disabled, true);
  fire(s.role('confirm'), 'click');
  assert.deepEqual(s.calls, ['dismiss']);
  const unknown = { state: 'unavailable' };
  s.view.reset({
    ...s.p.capture(),
    observed: {
      edges: { left: edge, right: unknown, top: edge, bottom: edge },
      fill: { state: 'unsupported', kind: 'image' },
    },
  });
  assert.equal(s.role('border-hex').value, '');
  assert.equal(s.role('background-hex').value, '');
  assert.match(s.role('current').textContent, /오른쪽: 미확인/);
  assert.match(s.role('current').textContent, /현재 배경: 미확인/);
  s.view.destroy();
});

test('hatch observation keeps face and foreground distinct; linear missing values stay blank', () => {
  const s = setup(true, {
    styleBatch: true,
    observed: {
      fill: {
        state: 'known',
        kind: 'hatch',
        color: '#999999',
        background: '#ffffff',
        pattern: 'HORIZONTAL',
      },
    },
  });
  assert.equal(s.role('fill-kind').value, 'hatch');
  assert.equal(s.role('background-hex').value, '#ffffff');
  assert.equal(s.role('hatch-hex').value, '#999999');
  assert.equal(s.role('hatch-style').value, 'HORIZONTAL');
  assert.equal(s.role('apply').disabled, true);
  s.view.reset({
    ...s.p.capture(),
    observed: {
      fill: {
        state: 'known',
        kind: 'linear',
        angle: 45,
        centerX: 20,
        colors: ['#123456', '#abcdef'],
        stops: [
          { offset: 0, color: '#123456' },
          { offset: 1, color: '#abcdef' },
        ],
      },
    },
  });
  assert.equal(s.role('angle').value, '45');
  assert.equal(s.role('centerX').value, '20');
  assert.equal(s.role('centerY').value, '');
  assert.equal(s.role('step').value, '');
  assert.equal(s.role('background-hex').value, '#123456');
  assert.equal(s.role('end-hex').value, '#abcdef');
  assert.equal(s.role('apply').disabled, true);
  s.view.destroy();
});

test('style capability requires exact true; arbitrary truthy values never enable hidden mutations', () => {
  for (const styleBatch of [1, 'true', {}, null]) {
    const s = setup(true, { styleBatch });
    assert.equal(s.role('fill-kind').disabled, true);
    assert.equal(s.role('hatch-hex').disabled, true);
    assert.equal(s.role('angle').disabled, true);
    s.view.destroy();
  }
});

test('experimental controls produce one combined form draft and retain exact numeric strings', () => {
  const s = setup(true, { styleBatch: true });
  s.border();
  s.choose('fill-kind', 'hatch');
  s.choose('background-hex', '#ffffff');
  s.choose('hatch-hex', '#999999');
  s.choose('hatch-style', 'HORIZONTAL');
  fire(s.role('apply'), 'click');
  assert.equal(s.calls.length, 1);
  assert.equal(s.calls[0].d.background.kind, 'hatch');
  assert.equal(s.calls[0].d.background.color, '#ffffff');
  assert.equal(s.calls[0].d.background.hatchColor, '#999999');
  assert.equal(s.calls[0].d.background.hatchStyle, 'HORIZONTAL');
  assert.equal(s.calls[0].d.target.mode, 'cell');
  assert.equal(s.calls[0].d.border.edges, 15);
  s.choose('fill-kind', 'linear');
  s.choose('end-hex', '#123456');
  for (const [key, value] of Object.entries({
    angle: '45',
    centerX: '20',
    centerY: '30',
    step: '40',
    stepCenter: '50',
  }))
    s.choose(key, value);
  fire(s.role('apply'), 'click');
  assert.equal(s.calls.length, 2);
  assert.deepEqual(s.calls[1].d.background, {
    color: '#ffffff',
    dirty: true,
    kind: 'linear',
    endColor: '#123456',
    angle: '45',
    centerX: '20',
    centerY: '30',
    step: '40',
    stepCenter: '50',
  });
  assert.equal(s.role('hatch-style').disabled, true);
  s.view.destroy();
});

test('busy, stale and detached guards cover every new fill field', () => {
  const s = setup(true, { styleBatch: true });
  s.choose('fill-kind', 'linear');
  s.view.setBusy(true);
  for (const n of [
    'fill-kind',
    'background-hex',
    'end-hex',
    'angle',
    'centerX',
    'centerY',
    'step',
    'stepCenter',
  ]) {
    assert.equal(s.role(n).disabled, true, n);
    fire(s.role(n), 'change');
  }
  s.view.setBusy(false);
  s.view.setStale('새 선택을 확인하세요.');
  assert.equal(s.role('angle').disabled, true);
  assert.equal(s.role('apply').disabled, true);
  const input = s.role('angle');
  s.view.destroy();
  fire(input, 'change');
  assert.equal(s.calls.length, 0);
});

test('diagonal hatch labels follow official canonical XML names without swapping enum values', () => {
  const s = setup(true, { styleBatch: true });
  const options = Object.fromEntries(
    s.role('hatch-style').children.map((option) => [option.value, option.textContent]),
  );
  assert.equal(options.SLASH, '하향 대각선');
  assert.equal(options.BACK_SLASH, '상향 대각선');
  s.choose('fill-kind', 'hatch');
  s.choose('background-hex', '#ffffff');
  s.choose('hatch-hex', '#999999');
  for (const value of ['SLASH', 'BACK_SLASH']) {
    s.choose('hatch-style', value);
    fire(s.role('apply'), 'click');
    assert.equal(s.calls.at(-1).d.background.hatchStyle, value);
  }
  assert.equal(s.calls.length, 2);
  s.view.destroy();
});

test('canonical source colors seed two endpoints despite four derived stops; stops alone or multicolor never collapse', () => {
  const s = setup(true, {
    styleBatch: true,
    observed: {
      fill: {
        state: 'known',
        kind: 'linear',
        colors: ['#ff0000', '#0000ff'],
        stops: [
          { offset: 0, color: '#111111' },
          { offset: 0.25, color: '#222222' },
          { offset: 0.75, color: '#333333' },
          { offset: 1, color: '#444444' },
        ],
      },
    },
  });
  assert.equal(s.role('background-hex').value, '#ff0000');
  assert.equal(s.role('end-hex').value, '#0000ff');
  assert.equal(s.role('background-enabled').checked, false);
  assert.equal(s.role('apply').disabled, true);
  for (const fill of [
    {
      state: 'known',
      kind: 'linear',
      stops: [
        { offset: 0, color: '#ff0000' },
        { offset: 1, color: '#0000ff' },
      ],
    },
    { state: 'known', kind: 'linear', colors: ['#ff0000', '#00ff00', '#0000ff'] },
    { state: 'unsupported', kind: 'linear', colors: ['#ff0000', '#0000ff'] },
  ]) {
    s.view.reset({ ...s.p.capture(), observed: { fill } });
    assert.equal(s.role('background-hex').value, '');
    assert.equal(s.role('end-hex').value, '');
    assert.equal(s.role('apply').disabled, true);
  }
  s.view.destroy();
});

for (const format of ['hwp5', 'hwpx'])
  test(
    format +
      ' actual observer values remain clean; explicit color edit emits only sparse color through real port',
    async () => {
      const s = setup(false, { styleBatch: true, actualFormat: format });
      assert.equal(s.c.observed.fill.color, '#e7e7a5');
      assert.equal(s.role('background-hex').value, '#e7e7a5');
      assert.equal(s.role('border-enabled').checked, false);
      assert.equal(s.role('background-enabled').checked, false);
      assert.equal(s.role('apply').disabled, true);
      fire(s.role('confirm'), 'click');
      assert.deepEqual(s.calls, ['dismiss']);
      assert.equal(s.f.mutationCalls().length, 0);
      s.choose('border-hex', '#123456');
      assert.equal(s.role('apply').disabled, false);
      fire(s.role('apply'), 'click');
      const draft = s.calls.at(-1).d;
      assert.deepEqual(draft.border.dirty, { style: false, width: false, color: true });
      const result = await s.p.apply(s.c, draft);
      assert.equal(result.status, 'committed-with-snapshot');
      const message = s.f.mutationCalls()[0].message;
      assert.equal(message.kind, 'cell-styles');
      assert.equal(message.borders.length, 1);
      assert.equal(message.borders[0].color, 0x123456);
      assert.equal('style' in message.borders[0], false);
      assert.equal('width' in message.borders[0], false);
      assert.deepEqual(message.fills, []);
      s.view.destroy();
    },
  );

for (const format of ['hwp5', 'hwpx'])
  test(
    format +
      ' intentionally enabling observed uniform border writes known full values; mixed source requires a choice',
    async () => {
      const s = setup(false, { styleBatch: true, actualFormat: format });
      s.role('border-enabled').checked = true;
      fire(s.role('border-enabled'), 'change');
      assert.equal(s.role('apply').disabled, format === 'hwpx');
      if (format === 'hwp5') {
        fire(s.role('apply'), 'click');
        assert.deepEqual(s.calls[0].d.border.dirty, { style: false, width: false, color: false });
        assert.equal((await s.p.apply(s.c, s.calls[0].d)).status, 'committed-with-snapshot');
        const border = s.f.mutationCalls()[0].message.borders[0];
        assert.equal(border.style, 'SOLID');
        assert.equal(border.width, 70);
        assert.equal(border.color, 0x654321);
      } else {
        assert.equal(s.c.currentBorder, null);
        assert.match(s.role('status').textContent, /선 종류/);
        assert.equal(s.f.mutationCalls().length, 0);
      }
      s.view.destroy();
    },
  );

for (const mode of ['range', 'table'])
  for (const kind of ['none', 'hatch', 'linear'])
    test(
      mode + ' ' + kind + ' background applies explicit shared scope through new-cap actual port',
      async () => {
        const s = setup(false, { styleBatch: true, fourCells: true });
        fire(s.role('background-tab'), 'click');
        s.choose('mode', mode);
        if (mode === 'range') {
          s.choose('startRow', '1');
          s.choose('endRow', '2');
          s.choose('startColumn', '2');
          s.choose('endColumn', '2');
        }
        assert.equal(s.role('fill-kind').disabled, false);
        s.choose('fill-kind', kind);
        if (kind !== 'none') s.choose('background-hex', '#ffffff');
        if (kind === 'hatch') {
          s.choose('hatch-hex', '#999999');
          s.choose('hatch-style', 'SLASH');
        }
        if (kind === 'linear') {
          s.choose('end-hex', '#123456');
          for (const [key, value] of Object.entries({
            angle: '45',
            centerX: '20',
            centerY: '30',
            step: '40',
            stepCenter: '50',
          }))
            s.choose(key, value);
        }
        assert.equal(s.role('apply').disabled, false, s.role('status').textContent);
        fire(s.role('apply'), 'click');
        assert.equal(s.calls[0].keepOpen, true);
        assert.equal(s.calls[0].d.border, null);
        assert.equal(s.calls[0].d.target.mode, mode);
        const result = await s.p.apply(s.c, s.calls[0].d);
        assert.equal(result.status, 'committed-with-snapshot', result.error);
        const message = s.f.mutationCalls()[0].message;
        assert.equal(message.kind, 'cell-styles');
        assert.deepEqual(message.borders, []);
        assert.deepEqual(
          message.fills.map((v) => v.listNode),
          mode === 'range' ? [83, 85] : [82, 83, 84, 85],
        );
        for (const row of message.fills) {
          assert.equal(row.fill.kind, kind);
          if (kind === 'none') assert.deepEqual(row.fill, { kind: 'none' });
          if (kind === 'hatch')
            assert.deepEqual(row.fill, {
              kind: 'hatch',
              face: 0xffffff,
              hatch: 0x999999,
              style: 'SLASH',
            });
          if (kind === 'linear')
            assert.deepEqual(row.fill, {
              kind: 'linear',
              colors: [0xffffff, 0x123456],
              angle: 45,
              centerX: 20,
              centerY: 30,
              step: 40,
              stepCenter: 50,
            });
        }
        assert.ok(Object.isFrozen(message.fills));
        assert.ok(Object.isFrozen(message.fills[0].fill));
        assert.deepEqual(s.f.mutationCalls()[0].options, {
          mutation: true,
          token: s.c.state.token,
        });
        s.view.reset(s.p.capture());
        assert.equal(s.role('background-tab').getAttribute('aria-selected'), 'true');
        assert.equal(s.role('background-enabled').checked, false);
        assert.equal(s.role('apply').disabled, true);
        s.view.destroy();
      },
    );

test('new-cap real controller and view Apply recapture observed values with fresh token and preserve background tab', async () => {
  const s = setup(false, { styleBatch: true, actualFormat: 'hwp5' });
  s.view.destroy();
  let creates = 0,
    closes = 0;
  const captures = [],
    messages = [];
  s.f.editor.requestExperimental = async (message, options) => {
    s.f.calls.push({ type: 'mutation', message, options });
    const content = structuredClone(s.f.state.content);
    const cell = content.tables[0].cells.find((cell) => cell.listNode === 21);
    const resource = content.hwp5BorderFillSources.find(
      (style) => style.id === cell.layoutSource.border_fill_id,
    );
    // Test adapter snapshot response, not Native execution evidence.
    resource.pattern.background = 0xffffff;
    const operationRevision = s.f.state.operationRevision + 1;
    s.f.replace({
      content,
      selection: undefined,
      operationRevision,
      token: { ...s.f.state.token, operationRevision },
    });
    return { status: 'committed-with-snapshot', state: s.f.state };
  };
  const controller = createTableCellAppearanceController({
    root: s.dom.root,
    port: s.p,
    onStatus: (v) => messages.push(v),
    onClose: () => closes++,
    createView(root, capture, callbacks) {
      creates++;
      captures.push(capture);
      return createTableCellAppearanceView(root, capture, callbacks);
    },
  });
  const tick = async () => {
    for (let i = 0; i < 40; i++) await Promise.resolve();
  };
  controller.open();
  fire(s.role('background-tab'), 'click');
  s.choose('background-hex', '#ffffff');
  fire(s.role('apply'), 'click');
  await tick();
  assert.equal(creates, 1);
  assert.equal(closes, 0);
  assert.equal(s.role('background-tab').getAttribute('aria-selected'), 'true');
  assert.equal(s.role('background-hex').value, '#ffffff');
  assert.equal(s.role('background-enabled').checked, false);
  assert.equal(s.role('apply').disabled, true);
  assert.equal(s.p.isCurrent(captures[0]), false);
  assert.equal(s.f.state.token.operationRevision, 1);
  s.choose('background-hex', '#ffffff');
  fire(s.role('confirm'), 'click');
  await tick();
  assert.equal(s.f.mutationCalls().length, 2);
  assert.deepEqual(
    s.f.mutationCalls().map((call) => call.options.token.operationRevision),
    [0, 1],
  );
  assert.ok(s.f.mutationCalls().every((call) => call.message.kind === 'cell-styles'));
  assert.equal(closes, 1);
  assert.equal(creates, 1);
  controller.dispose();
  assert.equal(s.f.listeners.size, 0);
});

for (const cap of [undefined, false, 1, 'true', {}])
  test('diagonal third tab requires exact true capability ' + String(cap), () => {
    const s = setup(true, { styleBatch: true, diagonalCap: cap });
    assert.deepEqual(
      all(s.dom.root)
        .filter((n) => n.getAttribute('role') === 'tab')
        .map((n) => n.textContent),
      ['테두리', '배경'],
    );
    assert.equal(s.role('diagonal-tab'), undefined);
    assert.equal(s.role('diagonal-directions'), undefined);
    s.view.destroy();
  });

test('new diagonal tab exposes only proven directions and no fabricated current/default edit intent', () => {
  const s = setup(true, { styleBatch: true, diagonalCap: true });
  const tabs = all(s.dom.root).filter((n) => n.getAttribute('role') === 'tab');
  assert.deepEqual(
    tabs.map((n) => n.textContent),
    ['테두리', '배경', '대각선'],
  );
  for (const n of ['diagonal-directions', 'diagonal-style', 'diagonal-width', 'diagonal-hex'])
    assert.equal(s.role(n).value, '');
  assert.equal(s.role('diagonal-enabled').checked, false);
  assert.equal(s.role('apply').disabled, true);
  assert.deepEqual(
    s.role('diagonal-directions').children.map((n) => n.value),
    ['', 'none', 'rising', 'falling', 'cross'],
  );
  assert.equal(s.role('diagonal-complex').disabled, true);
  assert.match(s.role('diagonal-complex').title, /꺾인.*중심선/);
  assert.equal(
    s.role('diagonal-style').children.find((n) => n.value === 'DOUBLE_SLIM').disabled,
    true,
  );
  fire(s.role('confirm'), 'click');
  assert.deepEqual(s.calls, ['dismiss']);
  s.view.destroy();
});

test('three-tab keyboard wraps both directions and respects IME; recapture keeps active diagonal tab', () => {
  const s = setup(true, { styleBatch: true, diagonalCap: true });
  const first = s.role('border-tab'),
    last = s.role('diagonal-tab');
  fire(first, 'keydown', { key: 'ArrowLeft' });
  assert.equal(s.dom.doc.activeElement, last);
  fire(last, 'keydown', { key: 'ArrowRight', isComposing: true });
  assert.equal(s.dom.doc.activeElement, last);
  fire(last, 'keydown', { key: 'ArrowRight' });
  assert.equal(s.dom.doc.activeElement, first);
  fire(first, 'keydown', { key: 'End' });
  assert.equal(s.dom.doc.activeElement, last);
  s.view.reset(s.p.capture());
  assert.equal(last.getAttribute('aria-selected'), 'true');
  assert.equal(s.role('apply').disabled, true);
  s.view.destroy();
});

for (const format of ['hwp5', 'hwpx'])
  test(
    format + ' actual diagonal observation seeds exact geometry/stroke without dirty values',
    () => {
      const s = setup(true, {
        styleBatch: true,
        diagonalCap: true,
        actualFormat: format,
        diagonalSource: {},
      });
      assert.equal(s.role('diagonal-directions').value, format === 'hwp5' ? 'falling' : 'rising');
      assert.equal(s.role('diagonal-style').value, 'SOLID');
      assert.equal(s.role('diagonal-width').value, '10');
      assert.equal(s.role('diagonal-hex').value, '#112233');
      assert.equal(s.role('diagonal-enabled').checked, false);
      assert.equal(s.role('apply').disabled, true);
      fire(s.role('diagonal-tab'), 'click');
      fire(s.role('confirm'), 'click');
      assert.deepEqual(s.calls, ['dismiss']);
      assert.equal(s.f.mutationCalls().length, 0);
      s.view.destroy();
    },
  );

test('unsupported complex geometry stays unselected while independently known stroke remains visible', () => {
  const s = setup(true, {
    styleBatch: true,
    diagonalCap: true,
    actualFormat: 'hwp5',
    diagonalSource: { attributes: 0x248 },
  });
  assert.equal(s.role('diagonal-directions').value, '');
  assert.equal(s.role('diagonal-style').value, 'SOLID');
  assert.equal(s.role('diagonal-hex').value, '#112233');
  assert.match(s.role('diagonal-current').textContent, /미확인·복합/);
  assert.equal(s.role('apply').disabled, true);
  s.view.destroy();
});

for (const mode of ['cell', 'range', 'table'])
  for (const directions of ['none', 'rising', 'falling', 'cross'])
    test(
      'new diagonal ' +
        mode +
        ' ' +
        directions +
        ' uses actual port with only direction edit intent',
      async () => {
        const s = setup(false, { styleBatch: true, diagonalCap: true, fourCells: true });
        fire(s.role('diagonal-tab'), 'click');
        s.choose('mode', mode);
        if (mode === 'range') {
          s.choose('endRow', '2');
          s.choose('startColumn', '2');
          s.choose('endColumn', '2');
        }
        s.choose('diagonal-directions', directions);
        assert.equal(s.role('apply').disabled, false, s.role('status').textContent);
        fire(s.role('apply'), 'click');
        const call = s.calls[0];
        assert.equal(call.keepOpen, true);
        assert.equal(call.d.border, null);
        assert.equal(call.d.background, null);
        assert.deepEqual(call.d.diagonal.dirty, {
          directions: true,
          style: false,
          width: false,
          color: false,
        });
        assert.equal((await s.p.apply(s.c, call.d)).status, 'committed-with-snapshot');
        const message = s.f.mutationCalls()[0].message;
        assert.equal(message.kind, 'cell-styles');
        assert.deepEqual(message.borders, []);
        assert.deepEqual(message.fills, []);
        const owners = mode === 'cell' ? [82] : mode === 'range' ? [83, 85] : [82, 83, 84, 85];
        assert.deepEqual(
          message.diagonals,
          owners.map((listNode) => ({ section: 0, tableNode: 81, listNode, directions })),
        );
        assert.ok(Object.isFrozen(message.diagonals));
        assert.ok(Object.isFrozen(message.diagonals[0]));
        assert.deepEqual(s.f.mutationCalls()[0].options, {
          mutation: true,
          token: s.c.state.token,
        });
        s.view.destroy();
      },
    );

test('stroke NONE and color-only changes do not clear directions or invent black/default width', async () => {
  for (const [control, value, expected] of [
    ['diagonal-style', 'NONE', { style: 'NONE' }],
    ['diagonal-hex', '#123456', { color: 0x123456 }],
    ['diagonal-width', '50', { width: 50 }],
  ]) {
    const s = setup(false, {
      styleBatch: true,
      diagonalCap: true,
      actualFormat: 'hwp5',
      diagonalSource: {},
    });
    s.choose(control, value);
    fire(s.role('apply'), 'click');
    assert.equal(s.calls.length, 1);
    assert.equal((await s.p.apply(s.c, s.calls[0].d)).status, 'committed-with-snapshot');
    assert.deepEqual(s.f.mutationCalls()[0].message.diagonals, [
      { section: 0, tableNode: 20, listNode: 21, ...expected },
    ]);
    s.view.destroy();
  }
});

for (const format of ['hwp5', 'hwpx'])
  test(
    format +
      ' explicit checkbox can apply verified full current diagonal with every dirty flag false',
    async () => {
      const s = setup(false, {
        styleBatch: true,
        diagonalCap: true,
        actualFormat: format,
        diagonalSource: {},
      });
      s.role('diagonal-enabled').checked = true;
      fire(s.role('diagonal-enabled'), 'change');
      assert.equal(s.role('apply').disabled, false);
      fire(s.role('apply'), 'click');
      assert.deepEqual(s.calls[0].d.diagonal.dirty, {
        directions: false,
        style: false,
        width: false,
        color: false,
      });
      assert.equal((await s.p.apply(s.c, s.calls[0].d)).status, 'committed-with-snapshot');
      assert.deepEqual(s.f.mutationCalls()[0].message.diagonals, [
        {
          section: 0,
          tableNode: format === 'hwp5' ? 20 : 59,
          listNode: format === 'hwp5' ? 21 : 66,
          directions: format === 'hwp5' ? 'falling' : 'rising',
          style: 'SOLID',
          width: 10,
          color: 0x112233,
        },
      ]);
      s.view.destroy();
    },
  );

test('unknown/complex direction with only enable checkbox still requires explicit choice', () => {
  const s = setup(false, {
    styleBatch: true,
    diagonalCap: true,
    actualFormat: 'hwp5',
    diagonalSource: { attributes: 0x248 },
  });
  s.role('diagonal-enabled').checked = true;
  fire(s.role('diagonal-enabled'), 'change');
  assert.equal(s.role('apply').disabled, true);
  assert.match(s.role('status').textContent, /직접 선택/);
  fire(s.role('apply'), 'click');
  assert.equal(s.calls.length, 0);
  s.view.destroy();
});

test('border, fill and diagonal share one actual atomic port request', async () => {
  const s = setup(false, { styleBatch: true, diagonalCap: true });
  s.border();
  s.choose('background-hex', '#abcdef');
  s.choose('diagonal-directions', 'cross');
  fire(s.role('apply'), 'click');
  assert.equal(s.calls.length, 1);
  assert.equal((await s.p.apply(s.c, s.calls[0].d)).status, 'committed-with-snapshot');
  assert.equal(s.f.mutationCalls().length, 1);
  const message = s.f.mutationCalls()[0].message;
  assert.equal(message.borders.length, 1);
  assert.equal(message.fills.length, 1);
  assert.deepEqual(message.diagonals, [
    { section: 0, tableNode: 81, listNode: 82, directions: 'cross' },
  ]);
  s.view.destroy();
});

test('old capability rejects explicit diagonal draft through actual port', async () => {
  const s = setup(true, { styleBatch: true });
  const draft = {
    border: null,
    background: null,
    diagonal: {
      directions: 'cross',
      style: '',
      width: '',
      color: '',
      dirty: { directions: true, style: false, width: false, color: false },
    },
  };
  const result = await s.p.apply(s.c, draft);
  assert.equal(result.status, 'rejected-unapplied');
  assert.equal(result.error, 'CellDiagonalAbiUnavailable');
  assert.equal(s.f.mutationCalls().length, 0);
  s.view.destroy();
});

test('new diagonal controls obey busy/IME/stale/capability-revocation and detached guards', () => {
  const s = setup(false, { styleBatch: true, diagonalCap: true });
  s.choose('diagonal-directions', 'cross');
  s.view.setBusy(true);
  for (const n of [
    'diagonal-enabled',
    'diagonal-directions',
    'diagonal-style',
    'diagonal-width',
    'diagonal-hex',
  ])
    assert.equal(s.role(n).disabled, true, n);
  s.view.setBusy(false);
  const dialog = s.dom.role('table-cell-appearance-dialog');
  fire(dialog, 'compositionstart');
  fire(s.role('apply'), 'click');
  assert.equal(s.calls.length, 0);
  fire(dialog, 'compositionend');
  s.view.setStale('새 선택');
  fire(s.role('confirm'), 'click');
  assert.equal(s.calls.length, 0);
  const input = s.role('diagonal-directions');
  s.view.destroy();
  fire(input, 'change');
  assert.equal(s.calls.length, 0);
  const revoked = setup(true, { styleBatch: true, diagonalCap: true });
  fire(revoked.role('diagonal-tab'), 'click');
  revoked.f.state.capabilities.cellDiagonalAvailable = false;
  revoked.view.reset(revoked.p.capture());
  assert.equal(revoked.role('diagonal-tab').hidden, true);
  assert.equal(revoked.role('diagonal-directions').disabled, true);
  assert.equal(revoked.role('border-tab').getAttribute('aria-selected'), 'true');
  assert.equal(revoked.role('apply').disabled, true);
  revoked.view.destroy();
});

test('queued diagonal draft snapshots dirty flags and fields before admission without copying lease authority', async () => {
  const s = setup(false, { styleBatch: true, diagonalCap: true });
  s.choose('diagonal-directions', 'rising');
  fire(s.role('apply'), 'click');
  const draft = s.calls[0].d;
  let release;
  s.f.editor.update = () =>
    new Promise((resolve) => {
      release = resolve;
    });
  const pending = s.p.apply(s.c, draft);
  for (let i = 0; i < 5; i++) await Promise.resolve();
  draft.diagonal.directions = 'cross';
  draft.diagonal.dirty.color = true;
  draft.diagonal.color = '#ffffff';
  release();
  assert.equal((await pending).status, 'committed-with-snapshot');
  assert.deepEqual(s.f.mutationCalls()[0].message.diagonals, [
    { section: 0, tableNode: 81, listNode: 82, directions: 'rising' },
  ]);
  s.view.destroy();
});

test('actual diagonal controller Apply recaptures fresh token/current source and retains third tab; Confirm closes', async () => {
  const s = setup(false, {
    styleBatch: true,
    diagonalCap: true,
    actualFormat: 'hwp5',
    diagonalSource: {},
  });
  s.view.destroy();
  let creates = 0,
    closes = 0;
  const captures = [];
  s.f.editor.requestExperimental = async (message, options) => {
    s.f.calls.push({ type: 'mutation', message, options });
    const content = structuredClone(s.f.state.content),
      cell = content.tables[0].cells.find((cell) => cell.listNode === 21);
    const resource = content.hwp5BorderFillSources[cell.layoutSource.border_fill_id - 1];
    // Adapter response fixture uses the independently observed raw geometry; no Native run is claimed.
    resource.attributes = message.diagonals[0].directions === 'none' ? 0 : 0x48;
    const operationRevision = s.f.state.operationRevision + 1;
    s.f.replace({
      content,
      selection: undefined,
      operationRevision,
      token: { ...s.f.state.token, operationRevision },
    });
    return { status: 'committed-with-snapshot', state: s.f.state };
  };
  const tool = createTableCellAppearanceController({
    root: s.dom.root,
    port: s.p,
    onStatus() {},
    onClose: () => closes++,
    createView(root, capture, callbacks) {
      creates++;
      captures.push(capture);
      return createTableCellAppearanceView(root, capture, callbacks);
    },
  });
  const tick = async () => {
    for (let i = 0; i < 40; i++) await Promise.resolve();
  };
  tool.open();
  fire(s.role('diagonal-tab'), 'click');
  s.choose('diagonal-directions', 'cross');
  fire(s.role('apply'), 'click');
  fire(s.role('apply'), 'click');
  await tick();
  assert.equal(s.f.mutationCalls().length, 1);
  assert.equal(creates, 1);
  assert.equal(closes, 0);
  assert.equal(s.role('diagonal-tab').getAttribute('aria-selected'), 'true');
  assert.equal(s.role('diagonal-directions').value, 'cross');
  assert.equal(s.role('diagonal-enabled').checked, false);
  assert.equal(s.role('apply').disabled, true);
  assert.equal(s.p.isCurrent(captures[0]), false);
  s.choose('diagonal-directions', 'none');
  fire(s.role('confirm'), 'click');
  await tick();
  assert.equal(closes, 1);
  assert.deepEqual(
    s.f.mutationCalls().map((call) => call.options.token.operationRevision),
    [0, 1],
  );
  assert.equal(s.f.mutationCalls()[1].message.diagonals[0].directions, 'none');
  tool.dispose();
  assert.equal(s.f.listeners.size, 0);
});

test('observed DOUBLE_SLIM never creates intent; checkbox full-preset fallback rejects but explicit sparse field remains valid', async () => {
  const s = setup(false, {
    styleBatch: true,
    diagonalCap: true,
    actualFormat: 'hwp5',
    diagonalSource: { border: { kind: 8, width: 7, color: 0x332211 } },
  });
  assert.equal(s.role('diagonal-style').value, 'DOUBLE_SLIM');
  assert.equal(
    s.role('diagonal-style').children.find((option) => option.value === 'DOUBLE_SLIM').disabled,
    true,
  );
  assert.equal(s.role('diagonal-enabled').checked, false);
  assert.equal(s.role('apply').disabled, true);
  fire(s.role('confirm'), 'click');
  assert.deepEqual(s.calls, ['dismiss']);
  assert.equal(s.f.mutationCalls().length, 0);
  s.role('diagonal-enabled').checked = true;
  fire(s.role('diagonal-enabled'), 'change');
  assert.equal(s.role('apply').disabled, true);
  assert.match(s.role('status').textContent, /직접 선택/);
  fire(s.role('apply'), 'click');
  assert.equal(s.calls.length, 1);
  const unchanged = {
    border: null,
    background: null,
    diagonal: {
      directions: 'falling',
      style: 'DOUBLE_SLIM',
      width: '50',
      color: '#112233',
      dirty: { directions: false, style: false, width: false, color: false },
    },
  };
  const rejection = await s.p.apply(s.c, unchanged);
  assert.equal(rejection.status, 'rejected-unapplied');
  assert.equal(rejection.error, 'CellDiagonalChoiceRequired');
  assert.equal(s.f.mutationCalls().length, 0);
  s.choose('diagonal-hex', '#abcdef');
  assert.equal(s.role('apply').disabled, false);
  fire(s.role('apply'), 'click');
  const explicit = s.calls.at(-1).d;
  assert.deepEqual(explicit.diagonal.dirty, {
    directions: false,
    style: false,
    width: false,
    color: true,
  });
  assert.equal((await s.p.apply(s.c, explicit)).status, 'committed-with-snapshot');
  assert.deepEqual(s.f.mutationCalls()[0].message.diagonals, [
    { section: 0, tableNode: 20, listNode: 21, color: 0xabcdef },
  ]);
  s.view.destroy();
});

for (const additions of ['diagonal', 'fill', 'diagonal-and-fill'])
  test(
    'one-cell inner border plus ' + additions + ' reaches real controller/port in one request',
    async () => {
      const s = setup(false, { styleBatch: true, diagonalCap: true });
      s.view.destroy();
      const tool = createTableCellAppearanceController({
        root: s.dom.root,
        port: s.p,
        onStatus() {},
        onClose() {},
        createView: createTableCellAppearanceView,
      });
      try {
        tool.open();
        s.border();
        s.choose('mode', 'table');
        s.choose('region', 'inner');
        assert.equal(s.role('apply').disabled, true);
        if (additions.includes('diagonal')) s.choose('diagonal-directions', 'cross');
        if (additions.includes('fill')) s.choose('background-hex', '#123456');
        assert.equal(s.role('confirm').disabled, false, s.role('status').textContent);
        fire(s.role('confirm'), 'click');
        fire(s.role('confirm'), 'click');
        for (let i = 0; i < 40; i++) await Promise.resolve();
        const calls = s.f.mutationCalls();
        assert.equal(calls.length, 1);
        assert.equal(s.dom.role('table-cell-appearance-dialog'), undefined);
        const message = calls[0].message;
        assert.equal(message.kind, 'cell-styles');
        assert.deepEqual(message.borders, []);
        assert.deepEqual(
          message.fills,
          additions.includes('fill')
            ? [
                {
                  section: 0,
                  tableNode: 81,
                  listNode: 82,
                  fill: { kind: 'solid', color: 0x123456 },
                },
              ]
            : [],
        );
        if (additions.includes('diagonal'))
          assert.deepEqual(message.diagonals, [
            { section: 0, tableNode: 81, listNode: 82, directions: 'cross' },
          ]);
        else assert.equal(message.diagonals, undefined);
        assert.deepEqual(calls[0].options, { mutation: true, token: s.c.state.token });
      } finally {
        tool.dispose();
      }
      assert.equal(s.f.listeners.size, 0);
    },
  );

test('one-cell inner border alone remains rejected by view and real port without mutation', async () => {
  const s = setup(false, { styleBatch: true, diagonalCap: true });
  try {
    s.border();
    s.choose('mode', 'table');
    s.choose('region', 'inner');
    assert.equal(s.role('apply').disabled, true);
    assert.equal(s.role('confirm').disabled, true);
    assert.match(s.role('status').textContent, /안쪽/);
    fire(s.role('confirm'), 'click');
    assert.equal(s.calls.length, 0);
    const result = await s.p.apply(s.c, {
      border: {
        mode: 'table',
        region: 'inner',
        edges: 15,
        style: 'SOLID',
        width: '12',
        color: '#000000',
        dirty: { style: true, width: true, color: true },
      },
      background: null,
      target: {
        mode: 'table',
        region: 'inner',
        startRow: '1',
        endRow: '1',
        startColumn: '1',
        endColumn: '1',
      },
    });
    assert.equal(result.status, 'rejected-unapplied');
    assert.equal(result.error, 'EmptyCellBorderRegion');
    assert.equal(s.f.mutationCalls().length, 0);
  } finally {
    s.view.destroy();
  }
});

test('diagonal guidance explains supported choices and direction versus stroke without testing terms', () => {
  const s = setup(false, { styleBatch: true, diagonalCap: true });
  try {
    const text = all(s.dom.root)
      .map((n) => n.textContent)
      .join(' ');
    assert.match(text, /복합 모양·중심선·이중선 대각선은 아직 지원하지 않습니다/);
    assert.match(text, /방향 없음은 대각선 방향만 끄고/);
    assert.match(text, /선 없음은 방향 설정을 유지한 채 선을 숨깁니다/);
    assert.doesNotMatch(text, /미검증|픽셀|Native|SDK/);
  } finally {
    s.view.destroy();
  }
});
