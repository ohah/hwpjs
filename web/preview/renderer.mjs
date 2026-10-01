import { FONT, LINE_HEIGHT, layoutContent } from "./layout.mjs";
export function createRenderer(canvas, viewport, spacer, onLayout = () => {}) {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas2DUnavailable");
  let content = { paragraphs: [], limited: false }, layout = { rows: [], limited: false };
  const paint = () => {
    const width = viewport.clientWidth, height = viewport.clientHeight;
    const ratio = Math.min(window.devicePixelRatio || 1, 3);
    canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
    canvas.width = Math.ceil(width * ratio); canvas.height = Math.ceil(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, width, height);
    ctx.font = FONT; ctx.textBaseline = "top";
    const first = Math.floor(viewport.scrollTop / LINE_HEIGHT);
    for (let i = first; i < Math.min(layout.rows.length, first + Math.ceil(height / LINE_HEIGHT) + 1); i++) {
      const row = layout.rows[i];
      ctx.fillStyle = row.kind === "label" ? "#526d80" : "#172b3b";
      ctx.fillText(row.text, 20, i * LINE_HEIGHT - viewport.scrollTop + 8);
    }
  };
  let frame = 0;
  const schedule = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; paint(); }); };
  const reflow = () => {
    ctx.font = FONT;
    layout = layoutContent(content, Math.max(1, viewport.clientWidth - 40), s => ctx.measureText(s).width);
    // Canvas occupies the viewport itself; the spacer adds only extra scroll.
    spacer.style.height = `${Math.max(0, layout.rows.length * LINE_HEIGHT - viewport.clientHeight)}px`;
    canvas.dataset.rows = String(layout.rows.length);
    canvas.dataset.limited = String(layout.limited);
    onLayout(layout);
    schedule();
  };
  viewport.addEventListener("scroll", schedule);
  const resize = new ResizeObserver(reflow); resize.observe(viewport);
  return {
    show(value) { content = value; viewport.scrollTop = 0; reflow(); return layout; },
    clear() { content = { paragraphs: [], limited: false }; viewport.scrollTop = 0; reflow(); },
    close() { resize.disconnect(); viewport.removeEventListener("scroll", schedule); cancelAnimationFrame(frame); },
  };
}
