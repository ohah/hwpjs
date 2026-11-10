import { demoCommandAction } from './demo-command-action.ts';
import { mountFormattingMarksShortcut } from './formatting-marks-shortcut.ts';
import {
  TABLE_ROW_COMMAND,
  TABLE_ROW_KEYMAP,
  tableRowShortcutConfig,
  mountContextualTableRowShortcut,
  type TableRowShortcutContext,
} from './contextual-table-row-shortcut.ts';
import {
  DEFAULT_KEYMAP,
  mergeKeymap,
  parseKeymapConfig,
  resolveShortcutLabel,
  compileKeymap,
  resolveKeyboardShortcut,
  type KeymapConfig,
  type KeymapPlatform,
} from '@hwpjs/core';
import { createKeyboardShortcuts } from '@hwpjs/vanilla';
import { DEMO_COMMAND_REGISTRY } from './command-support.ts';
import type { DemoAction, DemoCommand } from './shell-contract.ts';
export function mountShortcutSettings(options: {
  root: HTMLElement;
  surface: HTMLElement;
  available: (command: DemoCommand) => boolean;
  execute: (action: DemoAction) => void | Promise<void>;
  nativePaste?: () => boolean;
  onStatus: (message: string) => void;
  config?: unknown;
  locale?: string;
  tableRowContext?: () => TableRowShortcutContext;
}) {
  const doc = options.root.ownerDocument,
    nav = doc.defaultView?.navigator;
  const platform: KeymapPlatform = /Mac|iPhone|iPad/.test(nav?.platform ?? '')
    ? 'mac'
    : /Win/.test(nav?.platform ?? '')
      ? 'windows'
      : 'linux';
  const known = (config: KeymapConfig) => {
    for (const b of config.bindings)
      if (
        !Object.hasOwn(DEMO_COMMAND_REGISTRY, b.command) ||
        ['set-font-size', 'set-zoom'].includes(b.command)
      )
        throw Error('UnknownShortcutCommand:' + b.command);
    return config;
  };
  const defaults = mergeKeymap(DEFAULT_KEYMAP, TABLE_ROW_KEYMAP);
  let config = known(
      options.config === undefined
        ? defaults
        : mergeKeymap(defaults, parseKeymapConfig(options.config)),
    ),
    closed = false,
    generation = 0;
  let compiled = compileKeymap(config, platform);
  const initialShortcuts = tableRowShortcutConfig(config);
  let globalCompiled = compileKeymap(initialShortcuts.global, platform);
  const marksKeyboard = mountFormattingMarksShortcut({
    root: options.surface,
    available: options.available,
    execute: (command) => options.execute({ command }),
    claimed: (event) =>
      Boolean(
        resolveKeyboardShortcut(compiled, {
          code: event.code,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          altKey: event.altKey,
          shiftKey: event.shiftKey,
          isComposing: event.isComposing,
          keyCode: event.keyCode,
          repeat: event.repeat,
          altGraph: event.getModifierState?.('AltGraph') === true,
        }),
      ),
    onError: (error) => options.onStatus(error instanceof Error ? error.message : String(error)),
  });
  // Active global claims win. A contextual reassignment runs before the host's
  // disabled-default fallback, which otherwise also suppresses its former chord.
  const tableKeyboard = mountContextualTableRowShortcut({
    root: options.surface,
    platform,
    binding: initialShortcuts.contextual,
    claimed: (event) =>
      Boolean(
        resolveKeyboardShortcut(globalCompiled, {
          code: event.code,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          altKey: event.altKey,
          shiftKey: event.shiftKey,
          repeat: false,
        }),
      ),
    context: options.tableRowContext ?? (() => 'body'),
    available: () => options.available(TABLE_ROW_COMMAND),
    execute: () => options.execute({ command: TABLE_ROW_COMMAND }),
    onUnavailable: () => options.onStatus('현재 선택에서는 아래에 행을 삽입할 수 없습니다.'),
    onError: (error) => options.onStatus(error instanceof Error ? error.message : String(error)),
  });
  const keyboard = createKeyboardShortcuts({
    root: options.surface,
    config: initialShortcuts.global,
    platform,
    fallback: DEFAULT_KEYMAP,
    nativePaste: options.nativePaste,
    isAvailable: (command) => {
      const action = demoCommandAction(command);
      return action !== null && options.available(action.command);
    },
    execute: (command) => {
      const action = demoCommandAction(command);
      if (action) options.execute(action);
    },
    onUnavailable: (command) =>
      options.onStatus(
        `${DEMO_COMMAND_REGISTRY[command as DemoCommand].label}: 현재 실행할 수 없습니다.`,
      ),
    onError: (error) => options.onStatus(error instanceof Error ? error.message : String(error)),
  });
  const details = doc.createElement('details');
  details.dataset.role = 'shortcut-settings';
  const summary = doc.createElement('summary');
  summary.textContent = '단축키 설정';
  const marksHint = doc.createElement('p');
  marksHint.textContent = '조판 부호: Ctrl+G 다음 C · 문단 부호: Ctrl+G 다음 T (문서 입력 영역)';
  const locale = doc.createElement('select');
  locale.dataset.role = 'shortcut-locale';
  locale.setAttribute('aria-label', '단축키 표시 언어');
  for (const [value, text] of [
    ['ko', '한국어'],
    ['en', 'English'],
  ]) {
    const o = doc.createElement('option');
    o.value = value;
    o.textContent = text;
    locale.append(o);
  }
  locale.value = options.locale?.startsWith('en') ? 'en' : 'ko';
  const label = doc.createElement('label'),
    file = doc.createElement('input');
  file.type = 'file';
  file.accept = '.json,application/json';
  file.dataset.role = 'shortcut-config';
  label.append('JSON 설정 가져오기 ', file);
  const list = doc.createElement('ul');
  list.dataset.role = 'shortcut-bindings';
  const render = () => {
    if (closed) return;
    list.replaceChildren();
    for (const b of compileKeymap(config, platform).bindings) {
      const li = doc.createElement('li');
      li.dataset.bindingId = b.id;
      const modifiers = b.modifiers.map((m) =>
        m === 'Mod' ? (platform === 'mac' ? '⌘' : 'Ctrl') : m,
      );
      li.textContent = `${resolveShortcutLabel(config, b, locale.value)} — ${[...modifiers, b.code.replace(/^Key/, '')].join('+')}`;
      list.append(li);
    }
  };
  const report = (e: unknown) => {
    if (!closed) options.onStatus(e instanceof Error ? e.message : String(e));
  };
  const commit = (input: unknown) => {
    if (closed) throw Error('ShortcutSettingsDisposed');
    const next = known(mergeKeymap(defaults, parseKeymapConfig(input)));
    const nextCompiled = compileKeymap(next, platform);
    const partition = tableRowShortcutConfig(next);
    const nextGlobalCompiled = compileKeymap(partition.global, platform);
    keyboard.setConfig(partition.global);
    tableKeyboard.setBinding(partition.contextual);
    config = next;
    compiled = nextCompiled;
    globalCompiled = nextGlobalCompiled;
    render();
  };
  // Every explicit replacement fences previous asynchronous imports, even on validation failure.
  const apply = (input: unknown) => {
    if (closed) throw Error('ShortcutSettingsDisposed');
    generation++;
    commit(input);
  };
  const changed = async () => {
    if (closed) return;
    const current = ++generation,
      selected = file.files?.[0];
    if (!selected) return;
    try {
      if (selected.size > 262144) throw Error('ShortcutConfigTooLarge');
      const text = await selected.text();
      if (closed || generation !== current) return;
      commit(JSON.parse(text));
      options.onStatus('단축키 설정을 적용했습니다.');
    } catch (error) {
      if (!closed && generation === current) report(error);
    } finally {
      if (!closed && generation === current) file.value = '';
    }
  };
  file.addEventListener('change', changed);
  locale.addEventListener('change', render);
  const reset = doc.createElement('button');
  reset.type = 'button';
  reset.dataset.role = 'shortcut-reset';
  reset.textContent = '기본값 복원';
  reset.onclick = () => {
    if (closed) return;
    apply(defaults);
  };
  const download = doc.createElement('button');
  download.type = 'button';
  download.textContent = 'JSON 내보내기';
  download.dataset.role = 'shortcut-export';
  download.onclick = () => {
    if (closed) return;
    const url = URL.createObjectURL(
        new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' }),
      ),
      link = doc.createElement('a');
    link.href = url;
    link.download = 'hwpjs-keymap.json';
    details.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  details.append(summary, marksHint, locale, label, reset, download, list);
  options.root.append(details);
  render();
  const resolveCommand = (event: KeyboardEvent) =>
    resolveKeyboardShortcut(compiled, {
      code: event.code,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      altKey: event.altKey,
      shiftKey: event.shiftKey,
      isComposing: event.isComposing,
      keyCode: event.keyCode,
      repeat: false,
      altGraph: event.getModifierState?.('AltGraph') === true,
    })?.command;
  return {
    resolveCommand,
    getConfig: () => config,
    setConfig: apply,
    dispose() {
      if (closed) return;
      closed = true;
      generation++;
      marksKeyboard.dispose();
      keyboard.dispose();
      tableKeyboard.dispose();
      reset.onclick = null;
      download.onclick = null;
      file.removeEventListener('change', changed);
      locale.removeEventListener('change', render);
      details.remove();
    },
  };
}
