import { createDutmalEditState } from './dutmal-edit-state.mjs';

export function createDutmalControls({
  form,
  fields,
  targets,
  textKind,
  input,
  note,
  ready,
  request,
}) {
  let rows = [],
    enabled = false,
    closed = false,
    serial = 0;
  const state = createDutmalEditState({
    request: (message) => ready() && request(message),
    changed: (value) => {
      fields.disabled = !enabled || !ready() || !value.canSubmit;
      input.value = value.draft;
      note.textContent = value.error
        ? `덧말 조회/변경 실패: ${value.error}`
        : value.pending
          ? '덧말 처리 중…'
          : '덧말 문자열 편집 · 원본 조판 재계산은 별도입니다.';
    },
  });
  const pick = () => {
    const row = rows[Number(targets.value)];
    if (!closed && enabled && row) state.select({ ...row, textKind: textKind.value });
    else if (!closed) state.reset();
  };
  const submit = (event) => {
    event.preventDefault();
    if (!closed && enabled && ready()) {
      state.edit(input.value);
      state.submit();
    }
  };
  const edit = () => state.edit(input.value);
  targets.addEventListener('change', pick);
  textKind.addEventListener('change', pick);
  input.addEventListener('input', edit);
  form.addEventListener('submit', submit);
  const reset = () => {
    serial++;
    enabled = false;
    rows = [];
    targets.replaceChildren();
    state.reset();
    form.hidden = true;
    fields.disabled = true;
  };
  reset();
  return {
    reset,
    select(identity) {
      if (closed || !enabled || !ready()) return false;
      const index = rows.findIndex(
        (row) => row.section === identity.section && row.node === identity.node,
      );
      if (index < 0) return false;
      targets.value = String(index);
      textKind.value = 'mainText';
      pick();
      return true;
    },
    message(message) {
      if (closed) return;
      if (message.kind === 'enable') {
        enabled = !message.error && message.dutmalTextAvailable === true;
        if (!enabled) {
          reset();
          return;
        }
        if (enabled) {
          const requestId = ++serial;
          queueMicrotask(() => {
            if (!closed && enabled && requestId === serial && ready())
              request({ kind: 'inline-string-sources', requestId });
          });
        }
      }
      if (message.kind === 'inline-string-sources' && message.requestId === serial) {
        if (message.error) {
          form.hidden = false;
          note.textContent = `덧말 목록 조회 실패: ${message.error}`;
          return;
        }
        rows = message.sources.controls
          .filter((row) => row.kind === 'dutmal')
          .map((row) => ({ section: row.section_ordinal, node: row.element_index }));
        targets.replaceChildren(
          ...rows.map((row, index) => {
            const option = form.ownerDocument.createElement('option');
            option.value = String(index);
            option.textContent = `구역 ${row.section + 1} · 덧말 ${index + 1}`;
            return option;
          }),
        );
        targets.value = '0';
        form.hidden = !rows.length;
        queueMicrotask(pick);
      }
      if (['undo', 'redo'].includes(message.kind))
        queueMicrotask(() => {
          if (!closed) state.message(message);
        });
      else state.message(message);
    },
    close() {
      if (closed) return;
      closed = true;
      serial++;
      enabled = false;
      state.close();
      form.hidden = true;
      fields.disabled = true;
      targets.removeEventListener('change', pick);
      textKind.removeEventListener('change', pick);
      input.removeEventListener('input', edit);
      form.removeEventListener('submit', submit);
    },
  };
}
