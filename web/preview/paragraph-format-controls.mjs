import { paragraphAlignmentKey, paragraphAlignmentValue } from './paragraph-alignments.mjs';

export function createParagraphFormatControls({
  form,
  fields,
  id,
  choices,
  note,
  selected,
  request,
  alignmentButtons = [],
  requestAlignment,
}) {
  let count = 0,
    ids = null,
    enabled = false,
    previous = null;
  let alignmentEnabled = false;
  let labels = [];
  const update = () => {
    form.hidden = !enabled;
    const paragraph = enabled ? selected() : null;
    fields.disabled = !paragraph;
    const alignment = paragraphAlignmentKey(paragraph?.paragraphShape?.alignment);
    for (const button of alignmentButtons) {
      button.disabled = !paragraph || !alignmentEnabled;
      button.setAttribute(
        'aria-pressed',
        String(alignment !== null && button.dataset.alignment === alignment),
      );
    }
    const key = paragraph
      ? `${paragraph.section}:${paragraph.paragraph}:${paragraph.paraShapeId}`
      : null;
    if (key !== previous) {
      id.value = paragraph ? String(paragraph.paraShapeId) : '';
      previous = key;
    }
    if (choices) choices.value = id.value;
    id.max = String(
      ids ? ids.reduce((max, value) => Math.max(max, value), 0) : Math.max(0, count - 1),
    );
  };
  for (const button of alignmentButtons)
    button.addEventListener('click', () => {
      if (
        !enabled ||
        !alignmentEnabled ||
        !selected() ||
        paragraphAlignmentValue(button.dataset.alignment) === undefined
      )
        return;
      if (requestAlignment?.(button.dataset.alignment)) fields.disabled = true;
    });
  choices?.addEventListener('change', () => {
    id.value = choices.value;
  });
  id.addEventListener?.('input', () => {
    if (choices) choices.value = id.value;
  });
  const options = () => {
    if (!choices) return;
    choices.replaceChildren();
    if (!enabled) return;
    const byId = new Map(labels.map((row) => [row.value, row.label]));
    for (const value of ids ?? Array.from({ length: count }, (_, index) => index)) {
      const option = choices.ownerDocument.createElement('option');
      option.value = String(value);
      option.textContent = byId.get(String(value)) ?? `ID ${value}`;
      choices.append(option);
    }
  };
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!enabled || !selected() || !form.reportValidity()) return;
    const value = Number(id.value);
    if (!Number.isInteger(value) || value < 0 || (ids ? !ids.includes(value) : value >= count))
      return;
    if (request(value)) fields.disabled = true;
  });
  return {
    update,
    reset() {
      count = 0;
      ids = null;
      labels = [];
      enabled = false;
      alignmentEnabled = false;
      previous = null;
      id.value = '';
      note.textContent = '';
      options();
      update();
    },
    message(value) {
      if (value.kind === 'load') alignmentEnabled = false;
      if (value.content && !value.error)
        alignmentEnabled = value.content.paragraphAlignmentAvailable === true;
      if (value.kind === 'load') {
        enabled = false;
        labels = [];
        previous = null;
        options();
      }
      if (value.content && !value.error) {
        count = value.content.paragraphShapeCount ?? 0;
        ids = value.content.paragraphShapeIds ?? null;
        labels = value.content.paragraphShapeOptions ?? [];
        enabled = value.content.paragraphFormatAvailable === true && count > 0;
        options();
      }
      if (value.kind === 'paragraph-format')
        note.textContent = value.error
          ? `문단 서식 변경 실패: ${value.error}`
          : '문단 모양 참조 적용 · 원본 조판 재계산 필요';
      if (value.kind === 'paragraph-alignment')
        note.textContent = value.error ? `문단 정렬 변경 실패: ${value.error}` : '문단 정렬 적용';
      update();
    },
  };
}
