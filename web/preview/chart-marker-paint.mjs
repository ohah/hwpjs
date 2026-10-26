import { validChartMarker } from './chart-marker-policy.mjs';
/** Basic source-selected marker geometry; fill/line styling remains preview policy. */
export function paintChartMarker(ctx, marker, x, y) {
  if (!validChartMarker(marker)) throw Error('InvalidChartMarker');
  if (![x, y].every(Number.isFinite)) throw Error('InvalidChartMarkerCoordinate');
  const r = marker.radius;
  if (marker.symbol === 'none') return;
  ctx.beginPath();
  if (['circle', 'dot'].includes(marker.symbol)) {
    ctx.arc(x, y, marker.symbol === 'dot' ? r / 2 : r, 0, 2 * Math.PI);
    ctx.fill();
    return;
  }
  if (marker.symbol === 'square') {
    ctx.rect(x - r, y - r, 2 * r, 2 * r);
    ctx.fill();
    return;
  }
  if (['plus', 'x', 'dash'].includes(marker.symbol)) {
    if (marker.symbol === 'x') {
      ctx.moveTo(x - r, y - r);
      ctx.lineTo(x + r, y + r);
      ctx.moveTo(x - r, y + r);
      ctx.lineTo(x + r, y - r);
    } else {
      ctx.moveTo(x - r, y);
      ctx.lineTo(x + r, y);
      if (marker.symbol === 'plus') {
        ctx.moveTo(x, y - r);
        ctx.lineTo(x, y + r);
      }
    }
    ctx.stroke();
    return;
  }
  ctx.moveTo(x, y - r);
  if (marker.symbol === 'diamond') {
    ctx.lineTo(x + r, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r, y);
  } else {
    ctx.lineTo(x + r, y + r);
    ctx.lineTo(x - r, y + r);
  }
  ctx.closePath();
  ctx.fill();
}
