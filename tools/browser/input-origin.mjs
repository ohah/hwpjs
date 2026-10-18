// Browser keyboard navigation must establish a raw editing intent before typing.
export function moveBrowserInputToStart({ command, evaluate }, selector = "#canvas-input") {
  command("focus", selector);
  const probe = () => evaluate(`(() => {
    const input = document.querySelector(${JSON.stringify(selector)});
    return { active: input === document.activeElement, writable: Boolean(input && !input.disabled && !input.readOnly),
      start: input?.selectionStart, end: input?.selectionEnd, mac: navigator.platform.includes("Mac") };
  })()`);
  const before = probe();
  if (before?.active !== true || before.writable !== true) throw Error("BrowserInputOriginUnavailable");
  command("press", before.mac ? "Meta+ArrowUp" : "Control+Home");
  const after = probe();
  if (after?.active !== true || after.writable !== true || after.start !== 0 || after.end !== 0) throw Error("BrowserInputOriginNotReached:" + JSON.stringify(after));
}
