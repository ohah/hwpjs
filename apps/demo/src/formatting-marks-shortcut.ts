type MarkCommand = 'toggle-marks' | 'toggle-paragraph-marks';
/** Ctrl+G 다음 C/T 순서만 처리하며 문서 입력 이외의 폼은 건드리지 않습니다. */
export function mountFormattingMarksShortcut(options: {
  root: HTMLElement;
  available: (command: MarkCommand) => boolean;
  execute: (command: MarkCommand) => void | Promise<void>;
  claimed: (event: KeyboardEvent) => boolean;
  onError: (error: unknown) => void;
  now?: () => number;
}) {
  let armedUntil = 0,
    closed = false;
  const now = options.now ?? Date.now;
  const reset = () => {
    armedUntil = 0;
  };
  const keydown = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    const form = target?.closest?.('input, textarea, select, [contenteditable]');
    if (
      closed ||
      event.defaultPrevented ||
      event.isComposing ||
      event.keyCode === 229 ||
      event.repeat ||
      event.altKey ||
      event.metaKey ||
      event.shiftKey ||
      event.getModifierState?.('AltGraph') ||
      (form && !form.matches('[data-hwpjs-document-input]'))
    ) {
      reset();
      return;
    }
    const time = now();
    const armed = armedUntil > time;
    reset();
    const command =
      event.code === 'KeyC'
        ? 'toggle-marks'
        : event.code === 'KeyT'
          ? 'toggle-paragraph-marks'
          : undefined;
    if (armed && command && options.available(command)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      try {
        Promise.resolve(options.execute(command)).catch(options.onError);
      } catch (error) {
        options.onError(error);
      }
    } else if (
      event.code === 'KeyG' &&
      event.ctrlKey &&
      !options.claimed(event) &&
      (options.available('toggle-marks') || options.available('toggle-paragraph-marks'))
    ) {
      armedUntil = time + 1500;
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };
  options.root.addEventListener('keydown', keydown, true);
  options.root.addEventListener('focusout', reset);
  options.root.addEventListener('compositionstart', reset);
  return {
    dispose() {
      if (closed) return;
      closed = true;
      reset();
      options.root.removeEventListener('keydown', keydown, true);
      options.root.removeEventListener('focusout', reset);
      options.root.removeEventListener('compositionstart', reset);
    },
  };
}
