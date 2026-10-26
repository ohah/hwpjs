// Explicit flow intent, not a general primary-key or native-input classifier.
export function paragraphBreakShortcut(event) {
  if (event.key !== "Enter" || event.altKey || Boolean(event.ctrlKey) === Boolean(event.metaKey))
    return null;
  return event.shiftKey ? "column" : "page";
}
