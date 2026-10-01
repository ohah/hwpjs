import { FONT, LINE_HEIGHT, layoutContent, displayRunText } from "./layout.mjs";
import { TEXT_LEFT, caretGeometry, selectionRects } from "./text-geometry.mjs";
export function createRenderer(canvas, viewport, spacer, onLayout = () => {}) {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas2DUnavailable");
  let content = { paragraphs: [], limited: false }, layout = { rows: [], limited: false };
  let draft = null, interaction = {}, onGeometry = () => {}, blink = 0, caretVisible = true;
  const stopBlink = () => { clearInterval(blink); blink = 0; };
  const paint = () => {
    const width = viewport.clientWidth, height = viewport.clientHeight;
    const ratio = Math.min(window.devicePixelRatio || 1, 3);
    canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
    canvas.width = Math.ceil(width * ratio); canvas.height = Math.ceil(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, width, height);
    ctx.font = FONT; ctx.textBaseline = "top";
    ctx.fillStyle = "#bad9f4";
    for (const r of selectionRects(layout, interaction.anchor, interaction.focus)) ctx.fillRect(r.x, r.y - viewport.scrollTop, r.width, r.height);
    const first = Math.floor(viewport.scrollTop / LINE_HEIGHT);
    for (let i = first; i < Math.min(layout.rows.length, first + Math.ceil(height / LINE_HEIGHT) + 1); i++) {
      const row = layout.rows[i];
      ctx.fillStyle = row.kind === "label" ? "#526d80" : "#172b3b";
      if (row.kind === "text") {
        // Draw with the same grapheme advances used for hit-testing.
        for (let b = 0; b < row.boundaries.length - 1; b++) {
          const start = row.boundaries[b], end = row.boundaries[b + 1];
          ctx.fillText(displayRunText(row.text.slice(start.unit - row.startUnit, end.unit - row.startUnit)), TEXT_LEFT + start.x, i * LINE_HEIGHT - viewport.scrollTop + 8);
        }
      } else ctx.fillText(row.text, TEXT_LEFT, i * LINE_HEIGHT - viewport.scrollTop + 8);
    }
    if (interaction.active && (caretVisible || interaction.composition)) {
      const caret = caretGeometry(layout, interaction.focus);
      if (caret) { ctx.fillStyle = "#145b96"; ctx.fillRect(caret.x, caret.y - viewport.scrollTop, 2, 20); }
    }
    if (interaction.composition) {
      ctx.fillStyle = "#145b96";
      for (const r of selectionRects(layout, interaction.composition.anchor, interaction.composition.focus)) ctx.fillRect(r.x, r.y + 21 - viewport.scrollTop, r.width, 1);
    }
    onGeometry();
  };
  let frame = 0;
  const schedule = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; paint(); }); };
  const reflow = () => {
    ctx.font = FONT;
    const display = draft ? { ...content, paragraphs: content.paragraphs.map(p => p.section === draft.section && p.paragraph === draft.paragraph ? { ...p, text: draft.text } : p) } : content;
    layout = layoutContent(display, Math.max(1, viewport.clientWidth - 40), s => ctx.measureText(s).width);
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
    show(value, { preserveScroll = false } = {}) { content = value; draft = null; if (!preserveScroll) viewport.scrollTop = 0; reflow(); return layout; },
    clear() { content = { paragraphs: [], limited: false }; draft = null; interaction = {}; stopBlink(); viewport.scrollTop = 0; reflow(); },
    layout: () => layout,
    paragraph: point => content.paragraphs.find(p => p.section === point.section && p.paragraph === point.paragraph),
    preview(value) { draft = value; reflow(); },
    select(value) {
      interaction = value; caretVisible = true;
      if (interaction.active && !blink) blink = setInterval(() => { caretVisible = !caretVisible; schedule(); }, 500);
      if (!interaction.active) stopBlink();
      schedule();
    },
    onGeometry(callback) { onGeometry = callback; },
    close() { stopBlink(); resize.disconnect(); viewport.removeEventListener("scroll", schedule); cancelAnimationFrame(frame); },
  };
}
