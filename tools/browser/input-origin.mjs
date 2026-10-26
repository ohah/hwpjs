// Browser keyboard navigation must establish a raw editing intent before typing.
export function moveBrowserInputToStart({ command, evaluate }, selector = "#canvas-input") {
  command("focus", selector);
  const probe = () =>
    evaluate(`(() => {
    const input = document.querySelector(${JSON.stringify(selector)});
    return { active: input === document.activeElement, writable: Boolean(input && !input.disabled && !input.readOnly),
      start: input?.selectionStart, end: input?.selectionEnd, mac: navigator.platform.includes("Mac") };
  })()`);
  const before = probe();
  if (before?.active !== true || before.writable !== true)
    throw Error("BrowserInputOriginUnavailable");
  command("press", before.mac ? "Meta+ArrowUp" : "Control+Home");
  const after = probe();
  if (after?.active !== true || after.writable !== true || after.start !== 0 || after.end !== 0)
    throw Error("BrowserInputOriginNotReached:" + JSON.stringify(after));
}

// Only real key events establish the selection; DOM state is a witness, not an actuator.
export function selectBrowserInputRange(driver, text, start, end) {
  if (
    typeof text !== "string" ||
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    start > end ||
    end > text.length ||
    end > 4096
  )
    throw Error("InvalidBrowserInputRange");
  for (const boundary of [start, end])
    if (
      boundary > 0 &&
      boundary < text.length &&
      /[\uD800-\uDBFF]/.test(text[boundary - 1]) &&
      /[\uDC00-\uDFFF]/.test(text[boundary])
    )
      throw Error("SplitBrowserInputSurrogate");
  moveBrowserInputToStart(driver);
  for (const _ of text.slice(0, start)) driver.command("press", "ArrowRight");
  for (const _ of text.slice(start, end)) driver.command("press", "Shift+ArrowRight");
  const actual = driver.evaluate(
    '({value:document.querySelector("#canvas-input").value,start:document.querySelector("#canvas-input").selectionStart,end:document.querySelector("#canvas-input").selectionEnd})',
  );
  if (actual?.value !== text || actual.start !== start || actual.end !== end)
    throw Error("BrowserInputRangeNotReached");
}
