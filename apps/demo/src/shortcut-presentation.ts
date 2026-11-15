import {
  compileKeymap,
  type KeymapBinding,
  type KeymapConfig,
  type KeymapPlatform,
} from '@hwpjs/core';
import { createDialogLayer } from './dialog-layer.ts';

export const SHORTCUT_STORAGE_KEY = 'hwpjs.shortcuts.v1';
export function shortcutText(binding: KeymapBinding, platform: KeymapPlatform): string {
  return [
    ...binding.modifiers.map((m) =>
      m === 'Mod'
        ? platform === 'mac'
          ? '⌘'
          : 'Ctrl'
        : m === 'Control'
          ? 'Ctrl'
          : m === 'Meta'
            ? '⌘'
            : m,
    ),
    binding.code.replace(/^Key/, '').replace(/^Digit/, ''),
  ].join('+');
}
/** Customization must not consume ordinary typing, navigation, or IME keys. */
export function shortcutFromEvent(
  event: KeyboardEvent,
  binding: KeymapBinding,
): KeymapBinding | null {
  if (
    event.isComposing ||
    event.keyCode === 229 ||
    event.repeat ||
    event.getModifierState?.('AltGraph') ||
    /^(Control|Shift|Alt|Meta)(Left|Right)$/.test(event.code)
  )
    return null;
  if (
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    !/^F(?:[1-9]|1[0-9]|2[0-4])$/.test(event.code)
  )
    return null;
  return {
    ...binding,
    code: event.code,
    enabled: true,
    modifiers: [
      ...(event.ctrlKey ? ['Control' as const] : []),
      ...(event.metaKey ? ['Meta' as const] : []),
      ...(event.altKey ? ['Alt' as const] : []),
      ...(event.shiftKey ? ['Shift' as const] : []),
    ],
  };
}
/** One index per config refresh. Groups retain compiled order; disabled rows remain editable. */
export function indexShortcutBindings(config: KeymapConfig, platform: KeymapPlatform) {
  const byCommand = new Map<string, KeymapBinding[]>();
  const byId = new Map<string, KeymapBinding>();
  for (const binding of config.bindings) byId.set(binding.id, binding);
  for (const binding of compileKeymap(config, platform).bindings) {
    const group = byCommand.get(binding.command);
    if (group) group.push(binding);
    else byCommand.set(binding.command, [binding]);
  }
  return { byCommand, byId };
}
export function mountShortcutPresentation(options: {
  shell: HTMLElement;
  details: HTMLDetailsElement;
  platform: KeymapPlatform;
  getConfig: () => KeymapConfig;
  apply: (value: unknown) => void;
  report: (error: unknown) => void;
}) {
  const { shell, details, platform } = options,
    doc = shell.ownerDocument;
  const trigger = doc.createElement('button');
  trigger.type = 'button';
  trigger.textContent = '단축키 · 설정';
  trigger.dataset.role = 'shortcut-launcher';
  trigger.className = 'hwp-demo-button';
  trigger.setAttribute('aria-haspopup', 'dialog');
  const layer = createDialogLayer(shell, {
    role: 'shortcut-dialog',
    title: '단축키 안내 및 설정',
    mode: 'modal',
    onDismiss: () => {
      layer.element.close();
      trigger.focus();
    },
  });
  layer.body.append(details);
  details.open = true;
  const hint = doc.createElement('p');
  hint.textContent =
    '문서와 도구 버튼에서 사용합니다. 검색·설정 입력란과 대화상자는 해당 입력을 우선합니다. 브라우저가 먼저 처리하는 키는 변경해 사용하세요. 표 만들기: Ctrl/⌘+Alt+T (HWPJS 기본값). 변경할 키 입력란에서 조합을 누르세요. 설정은 이 브라우저에 저장됩니다.';
  layer.body.prepend(hint);
  (shell.querySelector('.hwp-demo-titlebar') ?? shell).append(trigger);
  trigger.onclick = () => layer.show();
  const decorations: HTMLElement[] = [];
  const render = () => {
    for (const node of decorations.splice(0)) node.remove();
    const config = options.getConfig();
    const { byCommand, byId } = indexShortcutBindings(config, platform);
    const hints = new Map<string, { text: string; aria: string }>();
    for (const [command, group] of byCommand) {
      hints.set(command, {
        text: group.map((binding) => shortcutText(binding, platform)).join(' / '),
        aria: group
          .map((binding) =>
            [
              ...binding.modifiers.map((modifier) =>
                modifier === 'Mod' ? (platform === 'mac' ? 'Meta' : 'Control') : modifier,
              ),
              binding.code.replace(/^Key/, '').replace(/^Digit/, ''),
            ].join('+'),
          )
          .join(' '),
      });
    }
    for (const node of shell.querySelectorAll<HTMLElement>(
      '[data-command],[data-role="open-document-direct"],[data-role="open-document"]',
    )) {
      const command = node.dataset.command ?? 'open-document';
      const hint = hints.get(command);
      const sequence =
        command === 'toggle-marks'
          ? 'Ctrl+G → C'
          : command === 'toggle-paragraph-marks'
            ? 'Ctrl+G → T'
            : '';
      const text = hint?.text || sequence;
      const previousHint = node.dataset.shortcutLabel;
      node.dataset.shortcutLabel = text;
      const label = node.getAttribute('aria-label') || node.textContent || '';
      const reason = node.title.includes(' — ') ? node.title.slice(node.title.indexOf(' — ')) : '';
      if (text || previousHint) node.title = `${label}${text ? ` (${text})` : ''}${reason}`;
      if (hint) node.setAttribute('aria-keyshortcuts', hint.aria);
      else node.removeAttribute('aria-keyshortcuts');
      // Compact toolbar buttons expose keys through title/ARIA; visible labels
      // belong to menu rows and the direct file-open button.
      if (text && (node.closest('.hwp-demo-popup') || !node.dataset.command)) {
        const kbd = doc.createElement('kbd');
        kbd.textContent = text;
        kbd.dataset.role = 'shortcut-hint';
        kbd.style.marginInlineStart = '8px';
        kbd.style.fontSize = '10px';
        node.append(kbd);
        decorations.push(kbd);
      }
    }
    for (const row of details.querySelectorAll<HTMLElement>('[data-binding-id]')) {
      const binding = byId.get(row.dataset.bindingId ?? '');
      if (!binding) continue;
      const input = doc.createElement('input');
      input.readOnly = true;
      input.setAttribute('aria-label', `${binding.id} 변경할 키`);
      input.placeholder = '새 키 조합';
      input.size = 12;
      input.onkeydown = (event) => {
        if (event.key === 'Tab' || event.key === 'Escape') return;
        const next = shortcutFromEvent(event, binding);
        if (!next) return;
        event.preventDefault();
        event.stopPropagation();
        try {
          options.apply({ version: 1, bindings: [next] });
        } catch (error) {
          options.report(error);
        }
      };
      const label = doc.createElement('label'),
        enabled = doc.createElement('input');
      enabled.type = 'checkbox';
      enabled.checked = binding.enabled !== false;
      enabled.setAttribute('aria-label', `${binding.id} 사용`);
      enabled.onchange = () => {
        try {
          options.apply({ version: 1, bindings: [{ ...binding, enabled: enabled.checked }] });
        } catch (error) {
          enabled.checked = binding.enabled !== false;
          options.report(error);
        }
      };
      label.append(enabled, ' 사용');
      row.append(' ', input, label);
    }
  };
  return {
    render,
    dispose() {
      trigger.onclick = null;
      trigger.remove();
      layer.destroy();
      for (const node of decorations) {
        node.parentElement?.removeAttribute('aria-keyshortcuts');
        if (node.parentElement) delete node.parentElement.dataset.shortcutLabel;
        node.remove();
      }
    },
  };
}
