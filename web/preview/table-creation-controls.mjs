export function createTableCreationControls({
  form,
  fields,
  focusButton,
  submit,
  dimensions,
  resources,
  note,
  selected,
  inventory,
  request,
  createOption = () => document.createElement('option'),
}) {
  let closed = false,
    signature = null;
  const updateVisibility = () => {
    form.hidden = Boolean(focusButton.disabled && fields.hidden && !note.textContent);
  };
  const showFields = (open) => {
    fields.hidden = !open;
    focusButton.setAttribute?.('aria-expanded', String(open));
    updateVisibility();
  };
  showFields(false);
  const update = () => {
    if (closed) return;
    const ids = inventory();
    const ready = Boolean(
      selected() &&
      ids &&
      Object.keys(resources).every((key) => Array.isArray(ids[key]) && ids[key].length),
    );
    fields.disabled = !ready;
    focusButton.disabled = !ready;
    submit.disabled = !ready;
    const next = JSON.stringify(ids);
    if (next !== signature) {
      for (const [key, select] of Object.entries(resources)) {
        const previous = select.value;
        select.replaceChildren(
          ...(ids?.[key] ?? []).map((id) => {
            const option = createOption();
            option.value = String(id);
            option.textContent = `ID ${id}`;
            return option;
          }),
        );
        select.value = ids?.[key]?.some((id) => String(id) === previous)
          ? previous
          : String(ids?.[key]?.[0] ?? '');
      }
      signature = next;
    }
    updateVisibility();
  };
  const focus = () => {
    update();
    if (!closed && !focusButton.disabled) {
      showFields(true);
      form.scrollIntoView?.({ block: 'nearest' });
      dimensions.rows.focus();
    }
  };
  const keydown = (event) => {
    if (closed || event.key !== 'Escape' || fields.hidden) return;
    event.preventDefault();
    event.stopPropagation();
    showFields(false);
    focusButton.focus();
  };
  const insert = (event) => {
    event.preventDefault();
    update();
    const selectedHost = selected();
    if (closed || fields.disabled || !selectedHost) return;
    const host = {
      section: selectedHost.section,
      paragraph: selectedHost.paragraph,
      unit: selectedHost.unit,
    };
    if (!form.reportValidity()) return;
    update();
    const current = selected();
    if (
      closed ||
      fields.disabled ||
      !current ||
      current.section !== host.section ||
      current.paragraph !== host.paragraph ||
      current.unit !== host.unit
    )
      return;
    const options = Object.fromEntries(
      Object.entries(dimensions).map(([key, node]) => [key, Number(node.value)]),
    );
    options.resources = Object.fromEntries(
      Object.entries(resources).map(([key, node]) => [key, Number(node.value)]),
    );
    note.textContent = request(options)
      ? '표 생성 중…'
      : '현재 선택에서는 표를 생성할 수 없습니다.';
    update();
  };
  focusButton.addEventListener('click', focus);
  form.addEventListener('submit', insert);
  form.addEventListener('keydown', keydown);
  update();
  return {
    update,
    message(reply) {
      if (closed) return;
      if (reply.kind === 'load' || reply.kind === 'unlock') {
        note.textContent = '';
        showFields(false);
      } else if (reply.kind === 'insert-table')
        note.textContent = reply.error
          ? `${reply.applied ? '표 생성 후 표시 실패' : '표 생성 실패'}: ${reply.error}`
          : '표 생성 완료 · 첫 셀 입력 가능 여부는 Canvas 상태를 확인하세요.';
      if (reply.kind === 'insert-table' && !reply.error) showFields(false);
      update();
    },
    close() {
      if (closed) return;
      closed = true;
      focusButton.removeEventListener('click', focus);
      form.removeEventListener('submit', insert);
      form.removeEventListener('keydown', keydown);
      showFields(false);
      fields.disabled = true;
      focusButton.disabled = true;
      submit.disabled = true;
      updateVisibility();
    },
  };
}
