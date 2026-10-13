// UI only: names, permissions and execution remain with the menu controller.
export function createCommandSearch({ registry, document, keyboard = document.defaultView, host }) {
  if (!registry || typeof registry.commands !== "function" || typeof registry.execute !== "function" || !host)
    throw new Error("InvalidCommandSearch");
  const events = new AbortController();
  const button = document.createElement("button"); button.type = "button"; button.id = "command-search-open"; button.textContent = "명령 검색";
  button.title = "Ctrl/⌘+Shift+P";
  const dialog = document.createElement("dialog"); dialog.id = "command-search"; dialog.setAttribute("aria-label", "문서 명령 검색");
  const label = document.createElement("label"); label.textContent = "명령 검색";
  const input = document.createElement("input"); input.type = "search"; input.id = "command-search-query"; input.maxLength = 256;
  label.htmlFor = input.id;
  const list = document.createElement("div"); list.id = "command-search-results";
  const note = document.createElement("p"); note.id = "command-search-status"; note.setAttribute("role", "status");
  const cancel = document.createElement("button"); cancel.type = "button"; cancel.textContent = "닫기";
  dialog.append(label, input, list, note, cancel);
  const style = document.createElement("link"); style.rel = "stylesheet"; style.href = new URL("./command-search.css", import.meta.url).href;
  document.head.append(style); document.body.append(dialog); host.append(button);
  let closed = false, previous = null;
  const finish = () => { if (!dialog.open) return; dialog.close(); previous?.focus?.(); previous = null; };
  const render = () => {
    if (closed) return;
    const terms = input.value.trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean);
    const commands = registry.commands().filter(c => terms.every(term => `${c.label} ${c.id}`.toLocaleLowerCase().includes(term)));
    list.replaceChildren();
    for (const command of commands) {
      const item = document.createElement("button"); item.type = "button"; item.dataset.commandId = command.id;
      item.textContent = `${command.label}${command.enabled ? "" : " · 현재 사용 불가"}`; item.disabled = !command.enabled;
      list.append(item);
    }
    note.textContent = commands.length ? `${commands.length}개 명령` : "일치하는 명령이 없습니다.";
  };
  const open = () => {
    if (closed || dialog.open) return;
    previous = document.activeElement; input.value = ""; render(); dialog.showModal(); input.focus();
  };
  const run = id => {
    if (closed || !dialog.open) return;
    if (!registry.commands().some(c => c.id === id && c.enabled)) { render(); note.textContent = "현재 사용할 수 없는 명령입니다."; return; }
    finish();
    if (!registry.execute(id)) { open(); note.textContent = "상태가 변경되어 명령을 실행하지 않았습니다."; }
  };
  button.addEventListener("click", open, { signal: events.signal });
  cancel.addEventListener("click", finish, { signal: events.signal });
  dialog.addEventListener("cancel", e => { e.preventDefault(); finish(); }, { signal: events.signal });
  dialog.addEventListener("keydown", e => {
    if (!e.defaultPrevented && !e.isComposing && e.keyCode !== 229 && e.key === "Escape") { e.preventDefault(); finish(); }
  }, { signal: events.signal });
  list.addEventListener("click", e => {
    const item = e.target.closest?.("button[data-command-id]");
    if (item && list.contains(item) && !item.disabled) run(item.dataset.commandId);
  }, { signal: events.signal });
  list.addEventListener("keydown", e => {
    if (e.defaultPrevented || e.isComposing || e.keyCode === 229 || !["ArrowDown", "ArrowUp"].includes(e.key)) return;
    e.preventDefault();
    const enabled = [...list.children].filter(c => !c.disabled), index = enabled.indexOf(document.activeElement);
    if (e.key === "ArrowUp" && index <= 0) input.focus();
    else enabled[Math.min(enabled.length - 1, Math.max(0, index + (e.key === "ArrowDown" ? 1 : -1)))]?.focus();
  }, { signal: events.signal });
  input.addEventListener("input", render, { signal: events.signal });
  input.addEventListener("keydown", e => {
    if (e.defaultPrevented || e.isComposing || e.keyCode === 229) return;
    if (e.key === "Enter") { e.preventDefault(); render(); const first = [...list.children].find(c => !c.disabled); if (first) run(first.dataset.commandId); }
    else if (e.key === "ArrowDown") { e.preventDefault(); [...list.children].find(c => !c.disabled)?.focus(); }
  }, { signal: events.signal });
  keyboard.addEventListener("keydown", e => {
    if (e.defaultPrevented || e.isComposing || e.keyCode === 229 || e.repeat || e.altKey || !(e.ctrlKey || e.metaKey) || !e.shiftKey || e.key.toLowerCase() !== "p") return;
    e.preventDefault(); open();
  }, { signal: events.signal });
  return { open, close() {
    if (closed) return; closed = true; events.abort();
    if (dialog.open) dialog.close(); previous = null;
    button.remove(); dialog.remove(); style.remove();
  } };
}
