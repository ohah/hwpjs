import {
  mountShortcutPresentation,
  shortcutText,
  SHORTCUT_STORAGE_KEY,
} from './shortcut-presentation.ts';
import { demoCommandAction } from './demo-command-action.ts';
import {
  OBJECT_PROPERTIES_COMMAND,
  OBJECT_PROPERTIES_KEYMAP,
  objectPropertiesShortcutConfig,
  mountContextualObjectPropertiesShortcut,
} from './contextual-object-properties-shortcut.ts';
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
  hasSelectedObject?: () => boolean;
}) {
  const doc = options.root.ownerDocument,
    nav = doc.defaultView?.navigator;
  const platform: KeymapPlatform = /Mac|iPhone|iPad/.test(nav?.platform ?? '')
    ? 'mac'
    : /Win/.test(nav?.platform ?? '')
      ? 'windows'
      : 'linux';
  const shell = options.surface.closest?.('.hwp-demo') as HTMLElement | null;
  let composing = false;
  const compositionStart = () => {
    composing = true;
  };
  const compositionEnd = () => {
    composing = false;
  };
  const focusOut = (event: FocusEvent) => {
    if (!options.surface.contains(event.relatedTarget as Node | null)) composing = false;
  };
  const openButton = () =>
    shell?.querySelector<HTMLButtonElement>('[data-role="open-document-direct"]');
  const available = (command: string) =>
    !composing &&
    (command === 'open-document'
      ? openButton()?.disabled === false
      : options.available(command as DemoCommand));
  const known = (config: KeymapConfig) => {
    for (const b of config.bindings)
      if (
        (!Object.hasOwn(DEMO_COMMAND_REGISTRY, b.command) && b.command !== 'open-document') ||
        ['set-font-size', 'set-zoom'].includes(b.command)
      )
        throw Error('UnknownShortcutCommand:' + b.command);
    return config;
  };
  const defaults = mergeKeymap(
    mergeKeymap(DEFAULT_KEYMAP, TABLE_ROW_KEYMAP),
    OBJECT_PROPERTIES_KEYMAP,
  );
  const mergeConfig = (input: KeymapConfig) => {
    // Preserve valid older user settings that already assigned bare P elsewhere.
    const ownsDefault = input.bindings.some((b) => b.id === OBJECT_PROPERTIES_COMMAND);
    const claimsP = input.bindings.some(
      (b) =>
        b.enabled !== false &&
        b.code === 'KeyP' &&
        b.modifiers.length === 0 &&
        b.command !== OBJECT_PROPERTIES_COMMAND,
    );
    const base =
      !ownsDefault && claimsP
        ? mergeKeymap(defaults, {
            version: 1,
            bindings: OBJECT_PROPERTIES_KEYMAP.bindings.map((b) => ({ ...b, enabled: false })),
          })
        : defaults;
    return mergeKeymap(base, input);
  };
  const partitionConfig = (value: KeymapConfig) => {
    const table = tableRowShortcutConfig(value);
    const objects = objectPropertiesShortcutConfig(table.global);
    return { global: objects.global, contextual: table.contextual, objects: objects.contextual };
  };
  let saved: unknown;
  try {
    const value = doc.defaultView?.localStorage?.getItem(SHORTCUT_STORAGE_KEY);
    if (value) saved = known(mergeConfig(parseKeymapConfig(JSON.parse(value))));
  } catch {
    options.onStatus('저장된 단축키 설정을 읽지 못해 기본값을 사용합니다.');
  }
  let presentation: ReturnType<typeof mountShortcutPresentation> | undefined;
  let config = known(
      options.config === undefined
        ? ((saved as KeymapConfig | undefined) ?? defaults)
        : mergeConfig(parseKeymapConfig(options.config)),
    ),
    closed = false,
    generation = 0;
  let compiled = compileKeymap(config, platform);
  const initialShortcuts = partitionConfig(config);
  let globalCompiled = compileKeymap(initialShortcuts.global, platform);
  options.surface.addEventListener('compositionstart', compositionStart, true);
  options.surface.addEventListener('compositionend', compositionEnd, true);
  options.surface.addEventListener('focusout', focusOut);
  const marksKeyboard = mountFormattingMarksShortcut({
    root: options.surface,
    available,
    onUnavailable: (command) =>
      options.onStatus(`${DEMO_COMMAND_REGISTRY[command].label}: 현재 실행할 수 없습니다.`),
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
    available: () => available(TABLE_ROW_COMMAND),
    execute: () => options.execute({ command: TABLE_ROW_COMMAND }),
    onUnavailable: () => options.onStatus('현재 선택에서는 아래에 행을 삽입할 수 없습니다.'),
    onError: (error) => options.onStatus(error instanceof Error ? error.message : String(error)),
  });
  const objectKeyboard = mountContextualObjectPropertiesShortcut({
    root: options.surface,
    platform,
    bindings: initialShortcuts.objects,
    hasSelectedObject: options.hasSelectedObject ?? (() => false),
    blocked: () => composing || Boolean(shell?.querySelector('dialog[open][aria-modal=true]')),
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
    available: () => available(OBJECT_PROPERTIES_COMMAND),
    execute: () => options.execute({ command: OBJECT_PROPERTIES_COMMAND }),
    onUnavailable: () => options.onStatus('현재 선택에서는 개체 속성을 열 수 없습니다.'),
    onError: (error) => options.onStatus(error instanceof Error ? error.message : String(error)),
  });
  const keyboard = createKeyboardShortcuts({
    root: shell ?? options.surface,
    shouldHandle: (event) => {
      if (composing || objectKeyboard.claims(event)) return false;
      const target = event.target as Element | null;
      if (target?.closest?.('dialog,[role=dialog],iframe')) return false;
      if (shell?.querySelector('dialog[open][aria-modal=true]')) return false;
      // Selection-sensitive commands still require the actual document input path.
      return true;
    },
    config: initialShortcuts.global,
    platform,
    fallback: DEFAULT_KEYMAP,
    nativePaste: options.nativePaste,
    isAvailable: (command) => {
      if (command === 'open-document') return available(command);
      const action = demoCommandAction(command);
      return action !== null && available(action.command);
    },
    execute: (command) => {
      if (command === 'open-document') {
        openButton()?.click();
        return;
      }
      const action = demoCommandAction(command);
      if (action) return options.execute(action);
    },
    onUnavailable: (command) =>
      options.onStatus(
        `${DEMO_COMMAND_REGISTRY[command as DemoCommand]?.label ?? '열기'}: 현재 실행할 수 없습니다.`,
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
    for (const b of config.bindings.filter(
      (b) => !b.platform || b.platform === 'all' || b.platform === platform,
    )) {
      const li = doc.createElement('li');
      li.dataset.bindingId = b.id;
      li.textContent = `${resolveShortcutLabel(config, b, locale.value)} — ${shortcutText(b, platform)}${b.enabled === false ? ' (사용 안 함)' : ''}`;
      list.append(li);
    }
  };
  const report = (e: unknown) => {
    if (!closed) options.onStatus(e instanceof Error ? e.message : String(e));
  };
  const commit = (input: unknown) => {
    if (closed) throw Error('ShortcutSettingsDisposed');
    const next = known(mergeConfig(parseKeymapConfig(input)));
    const nextCompiled = compileKeymap(next, platform);
    const partition = partitionConfig(next);
    const nextGlobalCompiled = compileKeymap(partition.global, platform);
    keyboard.setConfig(partition.global);
    tableKeyboard.setBinding(partition.contextual);
    objectKeyboard.setBindings(partition.objects);
    config = next;
    compiled = nextCompiled;
    globalCompiled = nextGlobalCompiled;
    render();
    presentation?.render();
    try {
      const storage = doc.defaultView?.localStorage;
      if (!storage) throw Error('ShortcutStorageUnavailable');
      storage.setItem(SHORTCUT_STORAGE_KEY, JSON.stringify(config));
      return true;
    } catch {
      options.onStatus('설정은 적용했지만 브라우저에 저장하지 못했습니다. JSON으로 내보내세요.');
      return false;
    }
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
      if (commit(JSON.parse(text))) options.onStatus('단축키 설정을 적용했습니다.');
    } catch (error) {
      if (!closed && generation === current) report(error);
    } finally {
      if (!closed && generation === current) file.value = '';
    }
  };
  file.addEventListener('change', changed);
  const changeLocale = () => {
    render();
    presentation?.render();
  };
  locale.addEventListener('change', changeLocale);
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
  if (shell) {
    presentation = mountShortcutPresentation({
      shell,
      details,
      platform,
      getConfig: () => config,
      apply: (input) => apply(mergeKeymap(config, parseKeymapConfig(input))),
      report,
    });
    presentation.render();
  }
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
      options.surface.removeEventListener('compositionstart', compositionStart, true);
      options.surface.removeEventListener('compositionend', compositionEnd, true);
      options.surface.removeEventListener('focusout', focusOut);
      marksKeyboard.dispose();
      keyboard.dispose();
      tableKeyboard.dispose();
      objectKeyboard.dispose();
      reset.onclick = null;
      download.onclick = null;
      file.removeEventListener('change', changed);
      locale.removeEventListener('change', changeLocale);
      presentation?.dispose();
      details.remove();
    },
  };
}
