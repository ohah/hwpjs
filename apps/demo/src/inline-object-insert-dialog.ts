import {
  checkedHwp5ChartCreateOptions,
  type Hwp5ChartCreateOptions,
} from '../../../js/hwp5-chart-create.mjs';
import {
  HWP5_CHART_CREATE_PROFILE,
  HWP5_LINE_CHART_CREATE_PROFILE,
  HWP5_HORIZONTAL_BAR_CHART_CREATE_PROFILE,
  HWP5_PIE_CHART_CREATE_PROFILE,
  supportsHwp5ChartCreateProfile,
} from '../../../js/hwp5-chart-create-profiles.mjs';
import { hwp5ChartRasterSize } from './hwp5-chart-raster-size.mjs';
import type { ChartRasterPayload } from './hwp5-chart-create-input-lane.ts';
import { checkedHwp5EquationInsertOptions } from '../../../js/hwp5-equation-insert.mjs';
import { createChartTypeOptions } from './inline-object-insert-chart-type-options.ts';
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
    onInsert(options: EquationInsertOptions | ChartCreateOptions | Hwp5ChartCreateOptions): void;
    onPreview?(options: Hwp5ChartCreateOptions): void;
    onDraftChange?(): void;
    onDismiss(): void;
    chartCreateProfileVersion?: unknown;
    format?: string;
  },
) {
  const doc = root.ownerDocument,
    dialog = doc.createElement('dialog');
  const chart = kind === 'chart';
  const hwp5 = callbacks.format === 'hwp5',
    hwp5Chart = hwp5 && chart;
  const hwp5Profiles = [
    [HWP5_CHART_CREATE_PROFILE, '기본 막대 차트'],
    [HWP5_LINE_CHART_CREATE_PROFILE, '기본 선 차트'],
    [HWP5_HORIZONTAL_BAR_CHART_CREATE_PROFILE, '가로 묶은 막대 차트'],
    [HWP5_PIE_CHART_CREATE_PROFILE, '기본 원형 차트'],
  ] as const;
  const availableHwp5Profiles = hwp5Profiles.filter(([profile]) =>
    supportsHwp5ChartCreateProfile(callbacks.chartCreateProfileVersion, profile),
  );
  let busy = false,
    unavailable = false,
    previewBusy = false;
  dialog.className = 'inline-object-insert-dialog';
  const heading = doc.createElement('h2');
  heading.id = 'inline-object-insert-heading';
  heading.textContent = chart ? '새 차트 만들기' : '새 수식 삽입';
  dialog.setAttribute('aria-labelledby', heading.id);
  const scope = doc.createElement('p');
  scope.id = 'inline-object-insert-scope';
  scope.className = 'inline-object-insert-scope';
  scope.textContent = hwp5Chart
    ? 'HWP5 일반 본문 커서에 선택한 종류의 차트를 만듭니다. 외부 프로그램의 표시 호환성은 아직 확인되지 않았습니다.'
    : hwp5
      ? 'HWP5 일반 본문 커서에 수식을 삽입합니다. 검정색과 일반 모드를 기본값으로 사용합니다. 저장 호환성은 후속 검증 대상입니다.'
      : 'HWPX 첫 구역의 일반 본문 커서 위치에 삽입합니다. 셀 안과 선택 영역에서는 사용할 수 없습니다.';
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
  let profileChoice: HTMLSelectElement | undefined;
  if (hwp5Chart) {
    const label = doc.createElement('label');
    label.textContent = '차트 종류';
    profileChoice = doc.createElement('select');
    profileChoice.setAttribute('aria-label', 'HWP5 차트 생성 방식');
    for (const [value, text] of [['', '생성 방식을 선택하세요'], ...availableHwp5Profiles]) {
      const option = doc.createElement('option');
      option.value = value;
      option.textContent = text;
      profileChoice.append(option);
    }
    label.append(profileChoice);
    data.append(label);
  }
  let grid: ReturnType<typeof createInlineObjectInsertDataGrid> | undefined;
  let chartTypes: ReturnType<typeof createChartTypeOptions> | undefined;
  if (chart) {
    if (!hwp5Chart) {
      chartTypes = createChartTypeOptions(data, (profile) => {
        grid?.setProfile(profile);
        if (!busy && !unavailable) status.textContent = '';
      });
      chartTypes.setProfileVersion(callbacks.chartCreateProfileVersion);
    }
    grid = createInlineObjectInsertDataGrid(
      data,
      () => {
        if (!busy && !unavailable) status.textContent = '';
      },
      { strictPieInput: hwp5Chart },
    );
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
  const selectedHwp5Profile = () =>
    availableHwp5Profiles.find(([profile]) => profile === profileChoice?.value)?.[0];
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
    if (hwp5) {
      const color = field(advanced, 'colorRgb', '수식 색상', '#000000');
      if (color.tagName === 'INPUT') (color as HTMLInputElement).type = 'color';
      const line = field(advanced, 'lineMode', '줄 모드', '');
      if (line.tagName === 'INPUT') {
        (line as HTMLInputElement).type = 'checkbox';
        line.required = false;
      }
    }
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
    if (
      !(hwp5 ? /^-?\d+$/ : /^\d+$/).test(raw) ||
      !Number.isSafeInteger(n) ||
      n < (hwp5 ? -32768 : 0) ||
      n > (hwp5 ? 32767 : 4294967295)
    )
      invalid(
        'baseLine',
        hwp5
          ? '기준선은 -32,768~32,767의 정수로 입력하세요.'
          : '기준선은 0~4,294,967,295의 정수로 입력하세요.',
      );
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
  function collect() {
    const size = { width: dimension('width'), height: dimension('height') };
    let options: EquationInsertOptions | ChartCreateOptions | Hwp5ChartCreateOptions;
    if (chart) {
      const profile =
        hwp5Chart && selectedHwp5Profile() === HWP5_PIE_CHART_CREATE_PROFILE
          ? { kind: 'pieChart' as const }
          : chartTypes?.read();
      const data = grid!.collect();
      try {
        options = checkedChartCreateOptions({
          ...size,
          ...data,
          ...(profile ? { chart: profile } : {}),
        });
      } catch (error) {
        grid!.focus();
        const message = (error as Error).message;
        throw Error(
          message === 'InvalidChartStockValues'
            ? '주가 값은 저가 ≤ 시가·종가 ≤ 고가 순서를 지켜야 합니다.'
            : message === 'InvalidChartNumber'
              ? '숫자를 확인하세요. 원형 값과 버블 크기는 0 이상이어야 합니다.'
              : '범주·계열 이름과 데이터 크기를 확인하세요. 이름은 UTF-8 4,096바이트 이하이며 차트별 배열 크기와 역할이 일치해야 합니다.',
        );
      }
      if (hwp5Chart) {
        const profile = selectedHwp5Profile();
        if (!profile) throw Error('HWP5 차트 생성 방식을 선택하세요.');
        options = checkedHwp5ChartCreateOptions({
          ...size,
          ...data,
          profile,
          preview: hwp5ChartRasterSize(size),
        });
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
        options = hwp5
          ? checkedHwp5EquationInsertOptions({
              ...input,
              colorRgb: Number.parseInt(value('colorRgb').slice(1), 16),
              lineMode: (fields.get('lineMode') as HTMLInputElement).checked,
            })
          : checkedEquationInsertOptions(input);
      } catch {
        invalid(
          'script',
          '수식과 세부 설정의 문자를 확인하세요. 수식은 UTF-8 1MB, 버전과 글꼴은 각각 128바이트까지 입력할 수 있습니다.',
        );
      }
    }
    return options!;
  }
  const showError = (error: unknown) => {
    status.textContent = (error as Error).message;
  };
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (busy || previewBusy || unavailable) return;
    try {
      const options = collect();
      callbacks.onInsert(options);
    } catch (error) {
      const message = (error as Error).message;
      status.textContent =
        message === 'ChartCreateProfileUnavailable'
          ? '현재 엔진은 선택한 차트 종류 생성을 지원하지 않습니다. 기본 막대 차트를 선택하거나 엔진 연결을 확인하세요.'
          : message;
    }
  });
  const previewButton = hwp5Chart && callbacks.onPreview ? doc.createElement('button') : undefined;
  const previewSlot = hwp5Chart ? doc.createElement('figure') : undefined;
  let previewURL: string | undefined;
  const clearPreview = () => {
    if (previewURL) doc.defaultView?.URL.revokeObjectURL(previewURL);
    previewURL = undefined;
    previewSlot?.replaceChildren();
  };
  const updateEnabled = () => {
    const blocked = busy || previewBusy || unavailable;
    const chosen = !hwp5Chart || selectedHwp5Profile() !== undefined;
    submit.disabled = blocked || !chosen;
    if (previewButton) previewButton.disabled = blocked || !chosen;
    if (profileChoice) profileChoice.disabled = blocked;
    cancel.disabled = busy;
    for (const input of fields.values()) input.disabled = blocked;
    grid?.setDisabled(blocked);
    chartTypes?.setDisabled(blocked);
  };
  if (previewButton) {
    previewButton.type = 'button';
    previewButton.textContent = '미리보기';
    previewButton.addEventListener('click', () => {
      if (busy || previewBusy || unavailable) return;
      try {
        callbacks.onPreview!(collect() as Hwp5ChartCreateOptions);
      } catch (error) {
        showError(error);
      }
    });
    actions.append(previewButton);
  }
  profileChoice?.addEventListener('change', () => {
    grid?.setProfile(
      selectedHwp5Profile() === HWP5_PIE_CHART_CREATE_PROFILE ? { kind: 'pieChart' } : undefined,
    );
    clearPreview();
    callbacks.onDraftChange?.();
    updateEnabled();
  });
  form.addEventListener('input', () => {
    clearPreview();
    callbacks.onDraftChange?.();
  });
  if (previewSlot) form.append(previewSlot);
  updateEnabled();
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
      chartTypes?.setDisabled(busy || unavailable);
      status.textContent = busy ? '처리 중입니다. 결과를 확인할 때까지 기다려주세요.' : '';
      updateEnabled();
      if (busy) dialog.focus();
    },
    setPreviewBusy(next: boolean) {
      previewBusy = next;
      updateEnabled();
      if (!unavailable) status.textContent = next ? '차트 미리보기를 준비하고 있습니다.' : '';
    },
    showPreview(payload: ChartRasterPayload) {
      clearPreview();
      if (!previewSlot || unavailable) return;
      const image = doc.createElement('img'),
        caption = doc.createElement('figcaption');
      image.alt = '새 HWP5 차트 미리보기';
      previewURL = doc.defaultView!.URL.createObjectURL(
        new Blob([payload.bytes.slice().buffer], { type: 'image/png' }),
      );
      image.src = previewURL;
      image.width = payload.pixel_width;
      image.height = payload.pixel_height;
      caption.textContent = '미리보기이며 실제 차트의 글꼴과 모양은 다를 수 있습니다.';
      previewSlot.append(image, caption);
    },
    setUnavailable(reason: string) {
      unavailable = true;
      submit.disabled = true;
      status.textContent = reason;
      for (const input of fields.values()) input.disabled = true;
      grid?.setDisabled(true);
      chartTypes?.setDisabled(true);
      clearPreview();
      updateEnabled();
    },
    setChartProfileVersion(version: unknown) {
      chartTypes?.setProfileVersion(version);
    },
    destroy() {
      clearPreview();
      dialog.close();
      dialog.remove();
    },
    focus() {
      if (grid && !busy && !unavailable) grid.focus();
      else (Array.from(fields.values()).find((input) => !input.disabled) ?? cancel).focus();
    },
  };
}
