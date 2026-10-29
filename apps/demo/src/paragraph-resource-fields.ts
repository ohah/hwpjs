import type { ParagraphShapePresentation } from './paragraph-shape-controller.ts';
import type { ParagraphShapeValue } from './paragraph-shape-port.ts';
import {
  resourceEdges,
  resourceCatalogAvailable,
  resourceStyles,
  resourceWidths,
  resourceHatches,
  paragraphBorderDraft,
  paragraphBackgroundDraft,
  invalidResourceDraft,
  type BorderRaw,
} from './paragraph-resource-input.ts';
export function createParagraphResourceFields(
  doc: Document,
  change: (field: string, value: ParagraphShapeValue | undefined) => void,
  isComposing: () => boolean,
) {
  const element = doc.createElement('section');
  element.className = 'hwp-paragraph-resource-fields';
  const border = doc.createElement('fieldset'),
    background = doc.createElement('fieldset');
  const legend = (parent: HTMLElement, text: string) => {
    const node = doc.createElement('legend');
    node.textContent = text;
    parent.append(node);
  };
  legend(border, '문단 테두리');
  legend(background, '문단 배경');
  const controls = new Map<string, HTMLInputElement | HTMLSelectElement>();
  const notes = new Map<string, HTMLElement>();
  const removals: (() => void)[] = [];
  let captured: ParagraphShapePresentation['captured'];
  let disabled = true;
  let disposed = false;
  const select = (values: readonly (readonly [string, string])[]) => {
    const node = doc.createElement('select');
    for (const [value, label] of [['', '변경하지 않음'], ...values]) {
      const option = doc.createElement('option');
      option.value = value;
      option.textContent = label;
      node.append(option);
    }
    return node;
  };
  const input = () => {
    const node = doc.createElement('input');
    node.type = 'text';
    node.maxLength = 7;
    node.placeholder = '#RRGGBB';
    return node;
  };
  const add = (
    parent: HTMLElement,
    key: string,
    title: string,
    node: HTMLInputElement | HTMLSelectElement,
    field: string,
  ) => {
    const label = doc.createElement('label');
    label.textContent = title;
    node.dataset.role = key;
    node.setAttribute('aria-label', title);
    label.append(node);
    parent.append(label);
    controls.set(key, node);
    const listener = (event: Event) => {
      if (
        disposed ||
        disabled ||
        node.disabled ||
        isComposing() ||
        (event as InputEvent).isComposing
      )
        return;
      emit(field);
    };
    const event = node.tagName === 'SELECT' ? 'change' : 'input';
    node.addEventListener(event, listener);
    removals.push(() => node.removeEventListener(event, listener));
  };
  const titles = { left: '왼쪽', right: '오른쪽', top: '위쪽', bottom: '아래쪽' };
  for (const edge of resourceEdges) {
    const row = doc.createElement('div');
    row.className = 'hwp-paragraph-resource-edge';
    add(
      row,
      'border-' + edge + '-style',
      titles[edge] + ' 선 종류',
      select(resourceStyles.map((v) => [v, v] as const)),
      'paragraph.border',
    );
    add(
      row,
      'border-' + edge + '-width',
      titles[edge] + ' 선 굵기',
      select(resourceWidths.map((v) => [String(v), (v / 100).toFixed(2) + ' mm'] as const)),
      'paragraph.border',
    );
    add(row, 'border-' + edge + '-color', titles[edge] + ' 선 색', input(), 'paragraph.border');
    border.append(row);
  }
  add(
    background,
    'background-kind',
    '배경 종류',
    select([
      ['none', '없음'],
      ['solid', '면 색'],
      ['hatch', '무늬'],
      ['linear', '선형 그라데이션'],
    ]),
    'paragraph.background',
  );
  add(background, 'background-color', '배경색', input(), 'paragraph.background');
  add(
    background,
    'background-hatch-style',
    '무늬 종류',
    select(resourceHatches.map((v) => [v, v] as const)),
    'paragraph.background',
  );
  add(background, 'background-hatch-color', '무늬 선 색', input(), 'paragraph.background');
  const linear = doc.createElement('div');
  linear.className = 'hwp-paragraph-resource-linear';
  add(linear, 'background-linear-end', '끝 색', input(), 'paragraph.background');
  for (const [key, title, maximum] of [
    ['angle', '각도(도)', 359],
    ['centerX', '가로 중심(%)', 100],
    ['centerY', '세로 중심(%)', 100],
    ['step', '단계', 100],
    ['stepCenter', '단계 중심(%)', 100],
  ] as const) {
    const node = doc.createElement('input');
    node.type = 'number';
    node.min = '0';
    node.max = String(maximum);
    node.step = '1';
    add(linear, 'background-linear-' + key, title, node, 'paragraph.background');
  }
  background.append(linear);
  for (const [name, parent] of [
    ['paragraph.border', border],
    ['paragraph.background', background],
  ] as const) {
    const note = doc.createElement('p');
    note.setAttribute('role', 'status');
    notes.set(name, note);
    parent.append(note);
  }
  element.append(border, background);
  function emit(field: string) {
    if (field === 'paragraph.border') {
      const raw: BorderRaw = {};
      for (const edge of resourceEdges)
        raw[edge] = {
          style: controls.get('border-' + edge + '-style')!.value,
          width: controls.get('border-' + edge + '-width')!.value,
          color: controls.get('border-' + edge + '-color')!.value,
        };
      change(field, paragraphBorderDraft(raw));
    } else
      change(
        field,
        paragraphBackgroundDraft(
          controls.get('background-kind')!.value,
          controls.get('background-color')!.value,
          {
            style: controls.get('background-hatch-style')!.value,
            color: controls.get('background-hatch-color')!.value,
          },
          {
            endColor: controls.get('background-linear-end')!.value,
            angle: controls.get('background-linear-angle')!.value,
            centerX: controls.get('background-linear-centerX')!.value,
            centerY: controls.get('background-linear-centerY')!.value,
            step: controls.get('background-linear-step')!.value,
            stepCenter: controls.get('background-linear-stepCenter')!.value,
          },
        ),
      );
  }
  return {
    element,
    update(model: ParagraphShapePresentation) {
      if (disposed) return;
      if (captured !== model.captured) {
        for (const node of controls.values()) node.value = '';
        captured = model.captured;
      }
      disabled =
        model.pending || model.loading || model.stale || model.refreshRequired || !captured;
      for (const field of ['paragraph.border', 'paragraph.background']) {
        const observation = captured?.result.observations.aggregate[field];
        const declared = captured?.capabilities.atomic
          ? captured.capabilities.fields[field]
          : undefined;
        const unknownBackground =
          field === 'paragraph.background' &&
          observation?.state !== 'known' &&
          observation?.state !== 'mixed';
        const catalogMissing =
          !resourceCatalogAvailable[field === 'paragraph.border' ? 'border' : 'background'];
        const blocked =
          catalogMissing ||
          disabled ||
          unknownBackground ||
          observation?.writable !== true ||
          declared?.writable !== true;
        for (const [key, node] of controls)
          if (key.startsWith(field.endsWith('border') ? 'border-' : 'background-'))
            node.disabled = blocked;
        const reason = blocked
          ? catalogMissing
            ? '현재 버전에서는 상세 테두리·배경을 편집할 수 없습니다.'
            : (observation?.writeUnavailableReason ??
              declared?.writeUnavailableReason ??
              declared?.reason ??
              '현재 문서 또는 선택에서 사용할 수 없습니다.')
          : '';
        const draft = model.draft.get(field);
        notes.get(field)!.textContent =
          (invalidResourceDraft(draft) ? draft.reason : '') +
          (observation?.state === 'known'
            ? '현재 값 보존 · 빈 입력은 변경하지 않습니다.'
            : observation?.state === 'mixed'
              ? '여러 값'
              : '알 수 없음') +
          (reason ? ' · ' + reason : '') +
          (field === 'paragraph.background'
            ? ' · 빈 입력에 기본값을 채우지 않습니다. 표시 지원과 저장 지원은 별도입니다.'
            : '');
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const remove of removals) remove();
      element.remove();
    },
  };
}
