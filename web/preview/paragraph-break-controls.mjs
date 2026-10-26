// Ribbon mirrors existing menu permissions; it owns no native command or selection.
export function createParagraphBreakControls({ registry, page, column }) {
  if (
    !registry ||
    typeof registry.commands !== "function" ||
    typeof registry.execute !== "function" ||
    typeof registry.subscribe !== "function" ||
    !page?.addEventListener ||
    !column?.addEventListener ||
    page === column
  )
    throw new Error("InvalidParagraphBreakControls");
  const events = new AbortController();
  const entries = [
    [page, "menu-insert-page-break"],
    [column, "menu-insert-column-break"],
  ];
  const refresh = () => {
    const commands = registry.commands();
    for (const [button, id] of entries)
      button.disabled =
        events.signal.aborted ||
        !commands.some((command) => command.id === id && command.enabled === true);
  };
  for (const [button, id] of entries)
    button.addEventListener(
      "click",
      () => {
        if (events.signal.aborted) return;
        refresh();
        if (!button.disabled) registry.execute(id);
        refresh();
      },
      { signal: events.signal },
    );
  const unsubscribe = registry.subscribe(refresh);
  refresh();
  return {
    close() {
      if (events.signal.aborted) return;
      events.abort();
      unsubscribe();
      for (const [button] of entries) button.disabled = true;
    },
  };
}
