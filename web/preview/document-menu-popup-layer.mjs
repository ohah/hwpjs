// details.open owns menu state; the native popover is only its layout projection.
export function createMenuPopupLayer(details, view = globalThis.window) {
  let closed = false;
  const rows = details
    .map((detail) => ({
      detail,
      summary: detail.querySelector?.('summary'),
      panel: detail.querySelector?.('.document-menu-popup'),
    }))
    .filter(
      (row) =>
        row.summary &&
        typeof row.panel?.showPopover === 'function' &&
        typeof row.panel?.hidePopover === 'function',
    );
  const place = ({ summary, panel }) => {
    const anchor = summary.getBoundingClientRect(),
      bounds = panel.getBoundingClientRect();
    const desired = Math.min(
      panel.scrollHeight || bounds.height || 240,
      Math.max(1, view.innerHeight - 16),
    );
    const above = Math.max(0, anchor.top - 10),
      below = Math.max(0, view.innerHeight - anchor.bottom - 10);
    const upward = desired > below && above > below;
    const top = upward
      ? Math.max(8, anchor.top - 2 - Math.min(desired, above))
      : Math.max(8, Math.min(anchor.bottom + 2, view.innerHeight - 16));
    panel.style.left = `${Math.max(8, Math.min(anchor.left, view.innerWidth - bounds.width - 8))}px`;
    panel.style.top = `${top}px`;
    panel.style.maxHeight = `${Math.max(1, upward ? above : view.innerHeight - top - 8)}px`;
  };
  for (const row of rows) {
    row.sync = () => {
      if (closed) return;
      if (!row.detail.open) {
        if (row.panel.matches(':popover-open')) row.panel.hidePopover();
        return;
      }
      if (!row.panel.matches(':popover-open')) row.panel.showPopover();
      place(row);
    };
    row.panelToggle = (event) => {
      if (!closed && event.newState === 'closed' && !row.panel.matches(':popover-open'))
        row.detail.open = false;
    };
    row.detail.addEventListener('toggle', row.sync);
    row.panel.addEventListener('toggle', row.panelToggle);
    row.sync();
  }
  const resize = () => {
    if (!closed) for (const row of rows) if (row.detail.open) place(row);
  };
  const scroll = (event) => {
    if (
      closed ||
      rows.some((row) => event.target === row.panel || row.panel.contains?.(event.target))
    )
      return;
    for (const row of rows) row.detail.open = false;
  };
  view?.addEventListener('resize', resize);
  view?.addEventListener('scroll', scroll, true);
  return {
    refresh() {
      if (!closed) for (const row of rows) row.sync();
    },
    close() {
      if (closed) return;
      closed = true;
      view?.removeEventListener('resize', resize);
      view?.removeEventListener('scroll', scroll, true);
      for (const row of rows) {
        row.detail.removeEventListener('toggle', row.sync);
        row.panel.removeEventListener('toggle', row.panelToggle);
        if (row.panel.matches(':popover-open')) row.panel.hidePopover();
        row.detail.open = false;
      }
    },
  };
}
