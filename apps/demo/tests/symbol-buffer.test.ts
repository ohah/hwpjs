import { expect, test } from 'bun:test';
import { createSymbolDialog } from '../src/symbol-dialog-view.ts';
import { documentFixture, fire, all } from './formatting-dialog-test-dom.ts';
function setup(recent?: readonly string[]) {
  const dom = documentFixture(),
    inserts: string[] = [];
  let cancels = 0;
  const view = createSymbolDialog(dom.root as any, {
    recent,
    onInsert: (text) => {
      inserts.push(text);
    },
    onDismiss: () => {
      cancels++;
    },
  });
  const glyph = (text: string) =>
    all(dom.root).find((n) => n.tagName === 'BUTTON' && n.textContent === text)!;
  return {
    ...dom,
    view,
    inserts,
    glyph,
    get cancels() {
      return cancels;
    },
  };
}
test('공식 초기 빈 버퍼·넣기 비활성·입력란 focus', () => {
  const f = setup();
  expect(f.role('symbol-text').value).toBe('');
  expect(f.role('symbol-insert').disabled).toBe(true);
  expect(f.doc.activeElement).toBe(f.role('symbol-text'));
  f.view.destroy();
});
test('두 개의 독립 click은 누적만 하고 문서 삽입은 넣기 한 번이다', () => {
  const f = setup();
  fire(f.glyph('※'), 'click');
  expect(f.role('symbol-text').value).toBe('※');
  fire(f.glyph('※'), 'click');
  expect(f.role('symbol-text').value).toBe('※※');
  expect(f.inserts).toEqual([]);
  fire(f.role('symbol-insert'), 'click');
  expect(f.inserts).toEqual(['※※']);
  f.view.destroy();
});
test('선택 문자와 직접 입력 버퍼는 별도이며 click은 기존 버퍼를 유지한다', () => {
  const f = setup();
  const input = f.role('symbol-text');
  input.value = 'e\u0301😀';
  fire(input, 'input');
  f.role('symbol-category').value = 'miscellaneous-symbols';
  fire(f.role('symbol-category'), 'change');
  fire(f.glyph('★'), 'click');
  expect(input.value).toBe('e\u0301😀★');
  expect(f.role('symbol-selected').textContent).toBe('★');
  expect(f.role('symbol-codepoints').textContent).toContain('U+1F600');
  f.view.destroy();
});
test('범주 변경은 입력한 문자를 비우지 않는다', () => {
  const f = setup();
  fire(f.glyph('※'), 'click');
  f.role('symbol-category').value = 'arrows';
  fire(f.role('symbol-category'), 'change');
  expect(f.role('symbol-text').value).toBe('※');
  fire(f.glyph('←'), 'click');
  expect(f.role('symbol-text').value).toBe('※←');
  f.view.destroy();
});
test('64 UTF16 경계를 넘는 glyph는 버퍼를 자르거나 서로게이트를 나누지 않는다', () => {
  const f = setup();
  const input = f.role('symbol-text');
  input.value = 'a'.repeat(63);
  fire(input, 'input');
  f.role('symbol-category').value = 'miscellaneous-symbols';
  fire(f.role('symbol-category'), 'change');
  fire(f.glyph('😀'), 'click');
  expect(input.value).toBe('a'.repeat(63));
  expect(f.role('symbol-status').textContent).not.toBe('');
  f.role('symbol-category').value = 'general-punctuation';
  fire(f.role('symbol-category'), 'change');
  fire(f.glyph('※'), 'click');
  expect(input.value.length).toBe(64);
  fire(f.glyph('※'), 'click');
  expect(input.value.length).toBe(64);
  f.view.destroy();
});
test('IME 조합 중 glyph click은 버퍼와 선택 문자를 바꾸지 않는다', () => {
  const f = setup();
  fire(f.role('symbol-dialog'), 'compositionstart');
  fire(f.glyph('※'), 'click');
  expect(f.role('symbol-text').value).toBe('');
  expect(f.role('symbol-selected').textContent).toBe('');
  fire(f.role('symbol-dialog'), 'compositionend');
  fire(f.glyph('※'), 'click');
  expect(f.role('symbol-text').value).toBe('※');
  f.view.destroy();
});
test('대기·readonly·취소 경계는 문서 삽입을 만들지 않는다', () => {
  const f = setup();
  f.view.setBusy(true);
  fire(f.glyph('※'), 'click');
  expect(f.role('symbol-text').value).toBe('');
  f.view.setBusy(false);
  fire(f.glyph('※'), 'click');
  f.view.setAvailability('읽기 전용 문서입니다.');
  fire(f.role('symbol-insert'), 'click');
  fire(f.role('symbol-cancel'), 'click');
  expect(f.inserts).toEqual([]);
  expect(f.cancels).toBe(1);
  f.view.destroy();
});

// 행 좌표는 합성한다. 실제 CSS 배치·브라우저 키 활성화 증거가 아니다.
function navigation() {
  const f = setup();
  let columns = 5;
  const cells = () => f.role('symbol-grid').children;
  const layout = () => {
    cells().forEach((cell, index) => {
      (cell as any).getBoundingClientRect = () => ({ top: Math.floor(index / columns) * 40 });
    });
  };
  layout();
  return {
    ...f,
    cells,
    layout,
    resize(value: number) {
      columns = value;
    },
    key(key: string, values: Record<string, unknown> = {}) {
      return fire(f.doc.activeElement, 'keydown', { key, ...values });
    },
  };
}
test('격자는 Tab 진입점 하나이며 방향키는 누적·삽입 없이 포커스만 이동한다', () => {
  const f = navigation(),
    cells = f.cells();
  expect(cells.filter((cell) => cell.tabIndex === 0)).toEqual([cells[0]]);
  cells[0].focus();
  expect(f.key('ArrowRight').defaultPrevented).toBe(true);
  expect(f.doc.activeElement).toBe(cells[1]);
  f.key('ArrowDown');
  expect(f.doc.activeElement).toBe(cells[6]);
  f.key('ArrowLeft');
  f.key('ArrowUp');
  expect(f.doc.activeElement).toBe(cells[0]);
  f.key('ArrowLeft');
  f.key('ArrowUp');
  expect(f.doc.activeElement).toBe(cells[0]);
  expect(cells.filter((cell) => cell.tabIndex === 0)).toEqual([cells[0]]);
  expect(f.role('symbol-text').value).toBe('');
  expect(f.role('symbol-selected').textContent).toBe('');
  expect(f.inserts).toEqual([]);
  f.view.destroy();
});
test('Home/End는 현재 행, Ctrl은 전체 범위이며 부분 마지막 행을 벗어나지 않는다', () => {
  const f = navigation(),
    cells = f.cells();
  cells[7].focus();
  f.key('Home');
  expect(f.doc.activeElement).toBe(cells[5]);
  f.key('End');
  expect(f.doc.activeElement).toBe(cells[9]);
  f.key('End', { ctrlKey: true });
  expect(f.doc.activeElement).toBe(cells.at(-1));
  f.key('ArrowDown');
  f.key('ArrowRight');
  expect(f.doc.activeElement).toBe(cells.at(-1));
  f.key('Home', { ctrlKey: true });
  expect(f.doc.activeElement).toBe(cells[0]);
  // 마지막 행보다 앞 행의 마지막 열에서 짧은 마지막 행으로 이동한다.
  const lastRow = Math.floor((cells.length - 1) / 5) * 5;
  cells[lastRow - 1].focus();
  f.key('ArrowDown');
  expect(f.doc.activeElement).toBe(cells.at(-1));
  f.view.destroy();
});
test('열 수는 폭 변경마다 재관측하고 단일 열·단일 행도 탐색한다', () => {
  const f = navigation(),
    cells = f.cells();
  cells[1].focus();
  f.resize(3);
  f.key('ArrowDown');
  expect(f.doc.activeElement).toBe(cells[4]);
  f.resize(1);
  f.key('ArrowDown');
  expect(f.doc.activeElement).toBe(cells[5]);
  f.resize(cells.length);
  f.key('ArrowDown');
  expect(f.doc.activeElement).toBe(cells[5]);
  f.key('End');
  expect(f.doc.activeElement).toBe(cells.at(-1));
  f.view.destroy();
});
test('busy·조합·229·dispose는 탐색을 막고 Tab·Enter·Space는 기본 동작을 보존한다', () => {
  const f = navigation(),
    cells = f.cells();
  cells[0].focus();
  f.view.setBusy(true);
  f.key('ArrowRight');
  expect(f.doc.activeElement).toBe(cells[0]);
  f.view.setBusy(false);
  fire(f.role('symbol-dialog'), 'compositionstart');
  f.key('ArrowRight');
  expect(f.doc.activeElement).toBe(cells[0]);
  fire(f.role('symbol-dialog'), 'compositionend');
  for (const values of [{ isComposing: true }, { keyCode: 229 }]) {
    f.key('ArrowRight', values);
    expect(f.doc.activeElement).toBe(cells[0]);
  }
  for (const key of ['Tab', 'Enter', ' ']) expect(f.key(key).defaultPrevented).toBe(false);
  expect(f.key('ArrowRight', { altKey: true }).defaultPrevented).toBe(false);
  expect(f.key('ArrowRight', { ctrlKey: true }).defaultPrevented).toBe(false);
  f.key('ArrowRight');
  expect(f.doc.activeElement).toBe(cells[1]);
  f.view.destroy();
  f.key('ArrowRight');
  expect(f.doc.activeElement).toBe(cells[1]);
  expect(f.role('symbol-dialog')).toBeUndefined();
  expect(f.inserts).toEqual([]);
});
test('click 진입점과 범주별 초기화를 유지하고 이전 범주 버튼은 무효화한다', () => {
  const f = navigation(),
    old = f.cells()[2];
  fire(old, 'click');
  expect(f.cells().filter((cell) => cell.tabIndex === 0)).toEqual([old]);
  const buffer = f.role('symbol-text').value;
  f.role('symbol-category').value = 'arrows';
  fire(f.role('symbol-category'), 'change');
  f.layout();
  const cells = f.cells();
  expect(cells.filter((cell) => cell.tabIndex === 0)).toEqual([cells[0]]);
  cells[0].focus();
  fire(old, 'keydown', { key: 'ArrowRight' });
  fire(old, 'click');
  expect(f.doc.activeElement).toBe(cells[0]);
  expect(f.role('symbol-text').value).toBe(buffer);
  f.key('ArrowRight');
  fire(f.doc.activeElement, 'click');
  expect(f.role('symbol-text').value).toBe(buffer + cells[1].textContent);
  expect(f.inserts).toEqual([]);
  f.view.destroy();
});

test('최근 버튼도 누적·UTF16 상한·IME·busy·readonly·dispose 검사를 공유한다', () => {
  const f = setup(['👩‍💻', '※']);
  const recent = f.role('symbol-recent').children;
  fire(recent[0], 'click');
  expect(f.role('symbol-text').value).toBe('👩‍💻');
  f.view.setBusy(true);
  fire(recent[1], 'click');
  expect(f.role('symbol-text').value).toBe('👩‍💻');
  f.view.setBusy(false);
  fire(f.role('symbol-dialog'), 'compositionstart');
  fire(recent[1], 'click');
  expect(f.role('symbol-text').value).toBe('👩‍💻');
  fire(f.role('symbol-dialog'), 'compositionend');
  const input = f.role('symbol-text');
  input.value = 'a'.repeat(63);
  fire(input, 'input');
  fire(recent[0], 'click');
  expect(input.value.length).toBe(63);
  expect(f.role('symbol-status').textContent).not.toBe('');
  fire(recent[1], 'click');
  expect(input.value).toBe('a'.repeat(63) + '※');
  f.view.setAvailability('선택이 바뀌었습니다.');
  fire(f.role('symbol-insert'), 'click');
  expect(f.inserts).toEqual([]);
  f.view.destroy();
  fire(recent[1], 'click');
  expect(input.value.length).toBe(64);
});

test('최근 영역은 문자 선택과 같은 열 안에 있고 빈 행과 15개 가시 범주를 구성한다', () => {
  const f = setup();
  const recent = f.role('symbol-recent');
  const section = f.role('symbol-recent-section');
  expect(section.className).toBe('hwp-symbol-recent');
  expect(recent.parentElement === section).toBe(true);
  expect(section.parentElement === f.role('symbol-grid').parentElement).toBe(true);
  expect(recent.children.length).toBe(0);
  expect((f.role('symbol-category') as any).size).toBe(15);
  f.view.destroy();
});
