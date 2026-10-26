/** Basic preview axes/labels. No source font, crossing, tick-unit or legend-layout fidelity claim. */
export function paintChartPreviewGrid(ctx, layout, item, scrollTop) {
  const plot = layout.plot,
    x = item.x + plot.x,
    y = item.y + plot.y - scrollTop;
  ctx.strokeStyle = '#dbe4eb';
  ctx.lineWidth = 1;
  for (const tick of layout.ticks) {
    ctx.beginPath();
    if (layout.direction === 'bar') {
      const px = x + tick.fraction * plot.width;
      ctx.moveTo(px, y);
      ctx.lineTo(px, y + plot.height);
    } else {
      const py = y + (1 - tick.fraction) * plot.height;
      ctx.moveTo(x, py);
      ctx.lineTo(x + plot.width, py);
    }
    ctx.stroke();
  }
}
export function paintChartPreviewAnnotations(ctx, layout, item, scrollTop, color) {
  const plot = layout.plot,
    x = item.x + plot.x,
    y = item.y + plot.y - scrollTop;
  const horizontal = layout.direction === 'bar';
  ctx.font = '12px sans-serif';
  ctx.lineWidth = 1;
  ctx.fillStyle = '#334155';
  if (layout.title) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const [index, text] of layout.title.lines.entries())
      ctx.fillText(
        text,
        item.x + layout.title.x,
        item.y - scrollTop + layout.title.y + index * layout.title.lineHeight,
        layout.title.maxWidth,
      );
  }
  for (const tick of layout.ticks) {
    const px = x + tick.fraction * plot.width,
      py = y + (1 - tick.fraction) * plot.height;
    ctx.textAlign = horizontal ? 'center' : 'right';
    ctx.textBaseline = horizontal ? 'top' : 'middle';
    ctx.fillText(
      tick.text,
      horizontal ? px : x - 6,
      horizontal ? y + plot.height + 5 : py,
      horizontal ? plot.width : Math.max(1, plot.x - 8),
    );
  }
  for (const row of layout.categories)
    if (row.text !== null) {
      ctx.textAlign = horizontal ? 'right' : 'center';
      ctx.textBaseline = horizontal ? 'middle' : 'top';
      ctx.fillText(
        row.text,
        horizontal ? x - 6 : x + row.fraction * plot.width,
        horizontal ? y + (1 - row.fraction) * plot.height : y + plot.height + 5,
        horizontal
          ? Math.max(1, plot.x - 8)
          : plot.width / Math.max(1, layout.category_count ?? item.primitives.categories.length),
      );
    }
  const hidden = layout.axes_hidden ?? { value: false, category: false };
  ctx.strokeStyle = '#64748b';
  if (!(horizontal ? hidden.category : hidden.value)) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + plot.height);
    ctx.stroke();
  }
  if (!(horizontal ? hidden.value : hidden.category)) {
    ctx.beginPath();
    ctx.moveTo(x, y + plot.height);
    ctx.lineTo(x + plot.width, y + plot.height);
    ctx.stroke();
  }
  for (const entry of layout.legend) {
    ctx.fillStyle = color(entry.color_key ?? entry.series_node);
    ctx.beginPath();
    ctx.rect(item.x + entry.x, item.y - scrollTop + entry.y + 2, 8, 8);
    ctx.fill();
    ctx.fillStyle = '#334155';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(entry.text, item.x + entry.x + 12, item.y - scrollTop + entry.y, entry.maxWidth);
  }
}
