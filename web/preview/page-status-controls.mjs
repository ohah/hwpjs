import { visiblePageStatus } from "./visible-page-status.mjs";

// Status only: reads the renderer's current layout on every event.
export function createPageStatusControls({ node, viewport, layout, resizeTarget, viewScale = () => 1 }) {
  let closed = false;
  const refresh = () => {
    if (closed) return;
    const current = layout();
    const scale = viewScale();
    const page = Number.isFinite(scale) && scale > 0 ? visiblePageStatus(current, viewport.scrollTop / scale, viewport.clientHeight / scale) : null;
    node.textContent = page
      ? `화면 쪽 ${page.ordinal + 1}/${page.displayedPages}${page.limited ? " (일부 표시)" : ""} · ${page.section === null ? "구역 미확인" : `구역 ${page.section + 1}`}`
      : current?.state === "paginated" ? "화면 쪽 미확인" : "물리 쪽 배치 없음";
  };
  viewport.addEventListener("scroll", refresh, { passive: true });
  resizeTarget.addEventListener("resize", refresh);
  refresh();
  return {
    refresh,
    close() {
      if (closed) return;
      closed = true;
      viewport.removeEventListener("scroll", refresh);
      resizeTarget.removeEventListener("resize", refresh);
      node.textContent = "";
    },
  };
}
