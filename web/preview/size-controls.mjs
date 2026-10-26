export function createSizeControls({
  form,
  fields,
  width,
  height,
  note,
  selected,
  request,
  identity,
  minimum = 0,
  label,
  success,
  capability,
  kind,
  active = () => true,
}) {
  let available = false,
    previous = null,
    closed = false;
  const keyOf = (target) => `${identity(target)}:${target.width}:${target.height}`;
  const update = () => {
    const enabled = !closed && available && active();
    form.hidden = !enabled;
    const cell = enabled ? selected() : null;
    fields.disabled = !cell;
    if (!cell) {
      previous = null;
      width.value = '';
      height.value = '';
      return;
    }
    const key = keyOf(cell);
    if (key !== previous) {
      width.value = String(cell.width);
      height.value = String(cell.height);
      previous = key;
    }
  };
  const submit = (event) => {
    event.preventDefault();
    if (closed || !available || !active()) return;
    const target = selected();
    if (!target) return;
    if (keyOf(target) !== previous) {
      update();
      return;
    }
    const submittedKey = previous;
    if (!form.reportValidity()) return;
    const values = [Number(width.value), Number(height.value)];
    if (values.some((value) => !Number.isInteger(value) || value < minimum || value > 0xffffffff))
      return;
    const current = selected();
    if (closed || !available || !active() || !current || keyOf(current) !== submittedKey) {
      update();
      return;
    }
    if (!request(...values))
      note.textContent = `Canvas ${label}을 선택하고 입력 반영이 끝난 뒤 적용하세요.`;
    else note.textContent = `${label} 크기 반영 중…`;
    update();
  };
  form.addEventListener('submit', submit);
  return {
    update,
    close() {
      if (closed) return;
      closed = true;
      available = false;
      form.removeEventListener('submit', submit);
      update();
    },
    reset() {
      available = false;
      previous = null;
      note.textContent = '';
      update();
    },
    message(message) {
      if (message.kind === 'enable' && !message.error) available = message[capability] === true;
      if (message.kind === kind)
        note.textContent = message.error ? `${label} 크기 변경 실패: ${message.error}` : success;
      update();
    },
  };
}
