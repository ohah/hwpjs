// UI adapter only. Labels, permissions and execution belong to the existing registry.
export function createDocumentContextMenu({
  registry,
  document,
  targets,
  commandIds = [
    'menu-undo',
    'menu-redo',
    'menu-copy',
    'menu-cut',
    'menu-paste',
    'menu-delete',
    'menu-bold',
    'menu-italic',
    'menu-underline',
    'menu-strike',
    'menu-properties',
  ],
}) {
  if (
    !registry ||
    typeof registry.commands !== 'function' ||
    typeof registry.execute !== 'function' ||
    !document?.body ||
    !document.head ||
    typeof document.createElement !== 'function' ||
    !document.defaultView ||
    !Array.isArray(targets) ||
    !targets.length ||
    targets.some(
      (target) =>
        typeof target?.addEventListener !== 'function' ||
        typeof target.getBoundingClientRect !== 'function',
    ) ||
    new Set(targets).size !== targets.length ||
    !Array.isArray(commandIds) ||
    !commandIds.length ||
    commandIds.some((id) => typeof id !== 'string' || !id) ||
    new Set(commandIds).size !== commandIds.length
  )
    throw new Error('InvalidDocumentContextMenu');
  const menu = document.createElement('div'),
    style = document.createElement('style');
  menu.className = 'hwpjs-document-context-menu';
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', '문서 편집');
  menu.tabIndex = -1;
  menu.hidden = true;
  style.textContent =
    ".hwpjs-document-context-menu:not([hidden]){position:fixed;z-index:20000;display:flex;flex-direction:column;max-width:calc(100vw - 8px);max-height:calc(100vh - 8px);overflow:auto;padding:4px;background:Canvas;color:CanvasText;border:1px solid GrayText;border-radius:4px;box-shadow:0 3px 12px #0003}.hwpjs-document-context-menu button{text-align:start;padding:6px 16px;background:none;color:inherit;border:0}.hwpjs-document-context-menu button:disabled{opacity:.45}.hwpjs-document-context-menu button:focus-visible{outline:2px solid Highlight}.hwpjs-document-context-menu button::before{content:'';display:inline-block;inline-size:1em;margin-inline-end:.4em}.hwpjs-document-context-menu button[aria-checked=true]::before{content:'✓' / ''}.hwpjs-document-context-menu button[aria-checked=mixed]::before{content:'−' / ''}";
  document.head.append(style);
  document.body.append(menu);
  const events = new AbortController();
  let closed = false,
    previous = null,
    rendering = false;
  const composingTargets = new Set();
  const hasComposition = () => {
    // Detached inputs may never emit compositionend/blur. Unknown connectivity stays guarded.
    for (const owner of composingTargets)
      if (owner?.isConnected === false) composingTargets.delete(owner);
    return composingTargets.size > 0;
  };
  const rows = () => registry.commands().filter((command) => commandIds.includes(command.id));
  const enabled = () => [...menu.children].filter((node) => !node.disabled);
  const finish = (restore = false) => {
    if (menu.hidden) return;
    menu.hidden = true;
    const focus = previous;
    previous = null;
    if (restore && focus?.isConnected !== false) focus?.focus?.({ preventScroll: true });
  };
  const render = () => {
    if (closed || rendering) return;
    rendering = true;
    try {
      const focusInside = menu.contains(document.activeElement),
        id = focusInside ? document.activeElement?.dataset?.commandId : null;
      const commands = rows(),
        buttons = [];
      for (const commandId of commandIds) {
        const command = commands.find((row) => row.id === commandId);
        if (!command) continue;
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.commandId = command.id;
        button.textContent = command.label;
        button.disabled = !command.enabled;
        if (!command.enabled && typeof command.reason === 'string' && command.reason) {
          button.title = command.reason;
          button.setAttribute('aria-description', command.reason);
        }
        const checked = ['true', 'false', 'mixed'].includes(command.pressed);
        button.setAttribute('role', checked ? 'menuitemcheckbox' : 'menuitem');
        if (checked) button.setAttribute('aria-checked', command.pressed);
        button.tabIndex = -1;
        buttons.push(button);
      }
      menu.replaceChildren(...buttons);
      if (!menu.hidden && focusInside)
        (
          buttons.find((button) => button.dataset.commandId === id && !button.disabled) ??
          enabled()[0] ??
          menu
        ).focus();
    } finally {
      rendering = false;
    }
  };
  const open = (x, y) => {
    if (closed || !Number.isFinite(x) || !Number.isFinite(y)) return false;
    render();
    if (!menu.children.length) return false;
    if (menu.hidden) previous = document.activeElement;
    menu.hidden = false;
    const box = menu.getBoundingClientRect(),
      view = document.defaultView;
    menu.style.left = `${Math.max(4, Math.min(x, view.innerWidth - box.width - 4))}px`;
    menu.style.top = `${Math.max(4, Math.min(y, view.innerHeight - box.height - 4))}px`;
    (enabled()[0] ?? menu).focus();
    return true;
  };
  const run = (id) => {
    if (closed || menu.hidden || !commandIds.includes(id)) return;
    // Read current permissions; never execute from the rendered button state.
    if (!rows().some((command) => command.id === id && command.enabled)) {
      render();
      return;
    }
    finish(true);
    // Restoring editor focus can synchronously change selection or permissions.
    if (closed || !rows().some((command) => command.id === id && command.enabled)) return;
    registry.execute(id);
  };
  for (const target of targets) {
    target.addEventListener(
      'compositionstart',
      (event) => {
        composingTargets.add(event.target);
        finish(false);
      },
      { signal: events.signal },
    );
    target.addEventListener(
      'compositionend',
      (event) => {
        composingTargets.delete(event.target);
      },
      { signal: events.signal },
    );
    // blur does not bubble: delegated textarea ownership must be cleared in capture.
    target.addEventListener(
      'blur',
      (event) => {
        composingTargets.delete(event.target);
      },
      { capture: true, signal: events.signal },
    );
    // Native right-button focus runs before contextmenu. Keep the existing
    // editor selection/focus rather than remembering a newly focused Canvas.
    target.addEventListener(
      'pointerdown',
      (event) => {
        if (
          !closed &&
          !event.defaultPrevented &&
          !hasComposition() &&
          event.button === 2 &&
          event.pointerType !== 'touch' &&
          target.disabled !== true &&
          rows().length
        )
          event.preventDefault();
      },
      { signal: events.signal },
    );
    target.addEventListener(
      'contextmenu',
      (event) => {
        if (
          hasComposition() ||
          event.defaultPrevented ||
          event.isComposing ||
          target.disabled === true
        )
          return;
        const box = target.getBoundingClientRect();
        const keyboard = event.button === 0 && event.clientX === 0 && event.clientY === 0;
        if (open(keyboard ? box.left + 8 : event.clientX, keyboard ? box.top + 8 : event.clientY))
          event.preventDefault();
      },
      { signal: events.signal },
    );
    target.addEventListener(
      'keydown',
      (event) => {
        if (
          event.defaultPrevented ||
          hasComposition() ||
          event.isComposing ||
          event.keyCode === 229 ||
          event.repeat ||
          event.altKey ||
          event.ctrlKey ||
          event.metaKey ||
          target.disabled === true
        )
          return;
        if (
          !(event.key === 'ContextMenu' && !event.shiftKey) &&
          !(event.key === 'F10' && event.shiftKey)
        )
          return;
        const box = target.getBoundingClientRect();
        if (open(box.left + 8, box.top + 8)) event.preventDefault();
      },
      { signal: events.signal },
    );
  }
  menu.addEventListener(
    'click',
    (event) => {
      const button = event.target.closest?.('button[data-command-id]');
      if (button && menu.contains(button) && !button.disabled) run(button.dataset.commandId);
    },
    { signal: events.signal },
  );
  menu.addEventListener(
    'keydown',
    (event) => {
      if (
        menu.hidden ||
        hasComposition() ||
        event.defaultPrevented ||
        event.isComposing ||
        event.keyCode === 229 ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      )
        return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        finish(true);
        return;
      }
      if (event.key === 'Tab') {
        finish(true);
        return;
      }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const buttons = enabled(),
        index = buttons.indexOf(document.activeElement);
      const next =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? buttons.length - 1
            : event.key === 'ArrowDown'
              ? (index + 1) % buttons.length
              : index <= 0
                ? buttons.length - 1
                : index - 1;
      buttons[next]?.focus();
    },
    { signal: events.signal },
  );
  const inside = (node) => typeof node?.nodeType === 'number' && menu.contains(node);
  for (const type of ['pointerdown', 'focusin'])
    document.addEventListener(
      type,
      (event) => {
        if (!menu.hidden && !inside(event.target) && !event.composedPath?.().some(inside))
          finish(false);
      },
      { signal: events.signal },
    );
  document.defaultView.addEventListener('resize', () => finish(false), { signal: events.signal });
  document.addEventListener(
    'scroll',
    (event) => {
      if (!inside(event.target)) finish(false);
    },
    { signal: events.signal, capture: true },
  );
  const unsubscribe =
    typeof registry.subscribe === 'function'
      ? registry.subscribe(() => {
          if (!menu.hidden) render();
        })
      : () => {};
  return {
    close() {
      if (closed) return;
      finish(true);
      closed = true;
      events.abort();
      composingTargets.clear();
      unsubscribe();
      menu.remove();
      style.remove();
    },
  };
}
