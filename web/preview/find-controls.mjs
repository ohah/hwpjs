export function createFindControls({
  form,
  input,
  note,
  search,
  select,
  replaceButton = null,
  replacement = null,
  replace = null,
  shortcuts = null,
  scope = null,
}) {
  let previousQuery = null,
    previousMatch = null;
  let closed = false;
  const focus = () => {
    if (closed) return false;
    const disclosure = form.closest?.('details');
    if (disclosure) disclosure.open = true;
    input.focus();
    input.select();
    return true;
  };
  const submit = (event) => {
    event.preventDefault();
    const query = input.value;
    if (!query) {
      note.textContent = '찾을 텍스트를 입력하세요.';
      return;
    }
    const { matches, limited } = search(query);
    if (!matches.length) {
      previousQuery = query;
      previousMatch = null;
      note.textContent = '현재 표시 문서에서 찾지 못했습니다.';
      return;
    }
    const previous =
      query === previousQuery && previousMatch
        ? matches.findIndex(
            (m) =>
              m.section === previousMatch.section &&
              m.paragraph === previousMatch.paragraph &&
              m.startUnit === previousMatch.startUnit &&
              m.endUnit === previousMatch.endUnit,
          )
        : -1;
    const index = (previous + 1) % matches.length,
      match = matches[index];
    if (!select(match)) {
      note.textContent = '입력 반영이나 조합이 끝난 뒤 다시 찾으세요.';
      return;
    }
    previousQuery = query;
    previousMatch = match;
    note.textContent = `${index + 1}/${matches.length}${limited ? ' · 검색 결과 한도 도달' : ''} · 현재 표시 문서 기준`;
  };
  form.addEventListener('submit', submit);
  const replaceCurrent = () => {
    const query = input.value;
    if (!query) {
      note.textContent = '찾을 텍스트를 입력하세요.';
      return;
    }
    const { matches } = search(query);
    const match =
      query === previousQuery && previousMatch
        ? matches.find(
            (m) =>
              m.section === previousMatch.section &&
              m.paragraph === previousMatch.paragraph &&
              m.startUnit === previousMatch.startUnit &&
              m.endUnit === previousMatch.endUnit,
          )
        : matches[0];
    if (!match) {
      note.textContent = '현재 결과를 다시 찾은 뒤 바꾸세요.';
      return;
    }
    if (!select(match) || !replace(replacement.value)) {
      note.textContent = '현재 결과는 바꿀 수 없거나 입력 반영 중입니다.';
      return;
    }
    previousQuery = query;
    previousMatch = match;
    note.textContent = '결과 교체 요청 · 반영 후 다음 찾기를 사용하세요.';
  };
  if (replaceButton && replacement && typeof replace === 'function')
    replaceButton.addEventListener('click', replaceCurrent);
  const shortcut = (event) => {
    if (
      event.defaultPrevented ||
      event.isComposing ||
      event.keyCode === 229 ||
      event.repeat ||
      event.altKey ||
      event.shiftKey ||
      !(event.ctrlKey || event.metaKey) ||
      event.key?.toLowerCase() !== 'f' ||
      !scope?.contains(event.target)
    )
      return;
    event.preventDefault();
    focus();
  };
  if (shortcuts && scope) shortcuts.addEventListener('keydown', shortcut);
  return {
    focus,
    reset() {
      previousQuery = null;
      previousMatch = null;
      note.textContent = '';
    },
    close() {
      if (closed) return;
      closed = true;
      form.removeEventListener('submit', submit);
      replaceButton?.removeEventListener('click', replaceCurrent);
      shortcuts?.removeEventListener('keydown', shortcut);
    },
  };
}
