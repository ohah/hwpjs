// Browser-test guard: coordinates alone do not prove that a click reached its target.
export function targetHitProbe(selector) {
  if (typeof selector !== "string" || !selector.trim())
    throw new Error("InvalidBrowserClickSelector");
  return `(() => {
    const target = document.querySelector(${JSON.stringify(selector)});
    if (!target) return { exists: false };
    const rect = target.getBoundingClientRect(), x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
    const hit = document.elementFromPoint(x, y);
    return { exists: true, enabled: !target.disabled, positiveRect: rect.width > 0 && rect.height > 0,
      inViewport: x >= 0 && y >= 0 && x < innerWidth && y < innerHeight,
      hitMatches: Boolean(hit && (hit === target || target.contains(hit))) };
  })()`;
}

export function assertTargetHit(result) {
  if (result?.exists !== true) throw new Error("BrowserClickTargetMissing");
  if (result.enabled !== true) throw new Error("BrowserClickTargetDisabled");
  if (result.positiveRect !== true || result.inViewport !== true)
    throw new Error("BrowserClickTargetNotVisible");
  if (result.hitMatches !== true) throw new Error("BrowserClickTargetCovered");
}

export function clickBrowserTarget({ command, evaluate, afterClick }, selector) {
  command("scrollintoview", selector);
  assertTargetHit(evaluate(targetHitProbe(selector)));
  evaluate(`(() => {
    window.__hwpClickCleanup?.();
    window.__hwpClickProof = null;
    const target = document.querySelector(${JSON.stringify(selector)});
    const listener = event => { window.__hwpClickProof = { trusted: event.isTrusted,
      matches: event.target === target || target.contains(event.target) }; };
    window.__hwpClickCleanup = () => document.removeEventListener("click", listener, true);
    document.addEventListener("click", listener, { capture: true, once: true });
  })()`);
  try {
    command("click", selector);
    afterClick?.(selector);
    const proof = evaluate("window.__hwpClickProof");
    if (proof?.trusted !== true || proof.matches !== true)
      throw new Error("BrowserClickDidNotReachTarget");
  } finally {
    evaluate("window.__hwpClickCleanup?.()");
  }
}
