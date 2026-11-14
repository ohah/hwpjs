import { createInlineObjectInsertDataGrid } from './inline-object-insert-data-grid.ts';
import { createCellSizeUnitDraft, parseCellSize } from './table-cell-size-units.ts';
import type {
  InlineObjectKind,
  EquationInsertOptions,
  ChartCreateOptions,
} from '../../../packages/core/src/commands/inline-object-insert.ts';
import {
  checkedEquationInsertOptions,
  checkedChartCreateOptions,
} from '../../../js/hwpx-inline-object-insert.mjs';

/** 문서 모델이 아닌, 삽입 요청 한 건의 임시 입력 폼입니다. */
export function createInlineObjectInsertDialog(
  root: HTMLElement,
  kind: InlineObjectKind,
  callbacks: {
    onInsert(options: EquationInsertOptions | ChartCreateOptions): void;
    onDismiss(): void;
  },
) {
  const doc = root.ownerDocument,
    dialog = doc.createElement('dialog');
  const chart = kind === 'chart';
  let busy = false,
    unavailable = false;
  dialog.className = 'inline-object-insert-dialog';
  const heading = doc.createElement('h2');
  heading.id = 'inline-object-insert-heading';
  heading.textContent = chart ? '새 차트 만들기' : '새 수식 삽입';
  dialog.setAttribute('aria-labelledby', heading.id);
  const scope = doc.createElement('p');
  scope.id = 'inline-object-insert-scope';
  scope.className = 'inline-object-insert-scope';
  scope.textContent =
    'HWPX 첫 구역의 일반 본문 커서 위치에 삽입합니다. 셀 안과 선택 영역에서는 사용할 수 없습니다.';
  dialog.setAttribute('aria-describedby', scope.id);
  const form = doc.createElement('form');
  form.noValidate = true;
  const status = doc.createElement('p');
  const fields = new Map<string, HTMLInputElement | HTMLTextAreaElement>();
  function section(title: string) {
    const group = doc.createElement('fieldset'),
      legend = doc.createElement('legend');
    legend.textContent = title;
    group.append(legend);
    form.append(group);
    return group;
  }
  function field(
    group: HTMLElement,
    name: string,
    labelText: string,
    value: string,
    multiline = false,
    hint = '',
  ) {
    const label = doc.createElement('label'),
      caption = doc.createElement('span');
    const input = multiline ? doc.createElement('textarea') : doc.createElement('input');
    caption.textContent = labelText;
    input.name = name;
    input.value = value;
    input.id = 'inline-object-insert-' + name;
    label.htmlFor = input.id;
    input.required = name !== 'script';
    if (['width', 'height', 'baseUnit'].includes(name)) input.inputMode = 'decimal';
    if (name === 'baseLine') input.inputMode = 'numeric';
    input.addEventListener('input', () => {
      input.removeAttribute('aria-invalid');
      if (!busy && !unavailable) status.textContent = '';
    });
    label.append(caption, input);
    if (hint) {
      const help = doc.createElement('small');
      help.id = input.id + '-help';
      help.textContent = hint;
      input.setAttribute('aria-describedby', help.id);
      label.append(help);
    }
    fields.set(name, input);
    group.append(label);
    return input;
  }
  const data = section(chart ? '차트 데이터' : '수식 내용');
  let grid: ReturnType<typeof createInlineObjectInsertDataGrid> | undefined;
  if (chart) {
    const type = doc.createElement('p');
    type.className = 'inline-object-insert-type';
    type.textContent = '표준 2D 세로 막대형 (현재 지원하는 유일한 종류)';
    data.append(type);
    grid = createInlineObjectInsertDataGrid(data, () => {
      if (!busy && !unavailable) status.textContent = '';
    });
  } else {
    field(
      data,
      'script',
      '수식 스크립트',
      'a + b',
      true,
      '예: x over y. 빈 수식도 삽입할 수 있습니다. 수식의 크기를 자동 계산하지 않습니다.',
    );
  }
  const size = section('크기');
  size.className = 'inline-object-insert-size';
  const sizeDraft = createCellSizeUnitDraft({
    width: chart ? 20000 : 6000,
    height: chart ? 12000 : 2000,
  });
  const baseDraft = createCellSizeUnitDraft({ width: 1000, height: 1000 });
  baseDraft.changeUnit('pt');
  field(size, 'width', '너비 (mm)', sizeDraft.read().width);
  field(size, 'height', '높이 (mm)', sizeDraft.read().height);
  const sizeHelp = doc.createElement('small');
  sizeHelp.textContent = 'mm 단위로 소수 둘째 자리까지 입력하세요.';
  size.append(sizeHelp);
  if (!chart) {
    const advanced = doc.createElement('details'),
      summary = doc.createElement('summary');
    summary.textContent = '고급 설정';
    advanced.append(summary);
    form.append(advanced);
    field(advanced, 'baseLine', '기준선', '85');
    field(advanced, 'baseUnit', '기본 글자 크기 (pt)', baseDraft.read().width);
    field(advanced, 'version', '수식 버전', 'Equation Version 60');
    field(advanced, 'font', '글꼴', 'HYhwpEQ');
  }
  status.className = 'inline-object-insert-status';
  status.id = 'inline-object-insert-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const actions = doc.createElement('div');
  actions.className = 'inline-object-insert-actions';
  const submit = doc.createElement('button');
  submit.type = 'submit';
  const actionText = chart ? '차트 만들기' : '수식 삽입';
  submit.textContent = actionText;
  submit.className = 'inline-object-insert-primary';
  const cancel = doc.createElement('button');
  cancel.type = 'button';
  cancel.textContent = '취소';
  const dismiss = () => {
    if (!busy) callbacks.onDismiss();
  };
  cancel.addEventListener('click', dismiss);
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    dismiss();
  });
  const value = (name: string) => fields.get(name)!.value;
  function invalid(name: string, message: string): never {
    const input = fields.get(name)!;
    input.setAttribute('aria-invalid', 'true');
    const details = input.closest('details');
    if (details) details.open = true;
    input.focus();
    throw Error(message);
  }
  function baseline() {
    const raw = value('baseLine').trim(),
      n = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(n) || n < 0 || n > 4294967295)
      invalid('baseLine', '기준선은 0~4,294,967,295의 정수로 입력하세요.');
    return n;
  }
  function dimension(name: 'width' | 'height' | 'baseUnit') {
    const raw = value(name).trim(),
      unit = name === 'baseUnit' ? 'pt' : 'mm',
      parsed = parseCellSize(raw, unit);
    if (parsed === null || parsed < 1 || parsed > 2147483647)
      invalid(
        name,
        `크기는 0보다 큰 ${unit} 값으로 소수 둘째 자리까지 입력하세요. 허용 범위보다 큰 값은 사용할 수 없습니다.`,
      );
    const draft = name === 'baseUnit' ? baseDraft : sizeDraft;
    const axis = name === 'height' ? 'height' : 'width';
    draft.edit(axis, raw);
    const points = draft.points();
    return parseCellSize(axis === 'width' ? points.widthPoints : points.heightPoints, 'pt')!;
  }
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (busy || unavailable) return;
    try {
      const size = { width: dimension('width'), height: dimension('height') };
      let options: EquationInsertOptions | ChartCreateOptions;
      if (chart) {
        const data = grid!.collect();
        try {
          options = checkedChartCreateOptions({ ...size, ...data });
        } catch {
          grid!.focus();
          throw Error(
            '범주와 계열 이름의 문자를 확인하세요. 이름은 각각 UTF-8 4,096바이트 이하로 입력하세요.',
          );
        }
      } else {
        const input = {
          ...size,
          script: value('script'),
          baseLine: baseline(),
          baseUnit: dimension('baseUnit'),
          version: value('version'),
          font: value('font'),
        };
        try {
          options = checkedEquationInsertOptions(input);
        } catch {
          invalid(
            'script',
            '수식과 세부 설정의 문자를 확인하세요. 수식은 UTF-8 1MB, 버전과 글꼴은 각각 128바이트까지 입력할 수 있습니다.',
          );
        }
      }
      callbacks.onInsert(options!);
    } catch (error) {
      status.textContent = (error as Error).message;
    }
  });
  actions.append(cancel, submit);
  form.append(status, actions);
  dialog.append(heading, scope, form);
  root.append(dialog);
  dialog.showModal();
  if (grid) grid.focus();
  else fields.get('script')!.focus();
  return {
    setBusy(next: boolean) {
      busy = next;
      dialog.setAttribute('aria-busy', String(busy));
      submit.disabled = busy || unavailable;
      cancel.disabled = busy;
      submit.textContent = busy ? (chart ? '차트 만드는 중…' : '수식 삽입 중…') : actionText;
      for (const input of fields.values()) input.disabled = busy || unavailable;
      grid?.setDisabled(busy || unavailable);
      status.textContent = busy ? '처리 중입니다. 결과를 확인할 때까지 기다려주세요.' : '';
      if (busy) dialog.focus();
    },
    setUnavailable(reason: string) {
      unavailable = true;
      submit.disabled = true;
      status.textContent = reason;
      for (const input of fields.values()) input.disabled = true;
      grid?.setDisabled(true);
    },
    destroy() {
      dialog.close();
      dialog.remove();
    },
    focus() {
      if (grid && !busy && !unavailable) grid.focus();
      else (Array.from(fields.values()).find((input) => !input.disabled) ?? cancel).focus();
    },
  };
}
