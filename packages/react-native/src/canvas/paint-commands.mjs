import { paintPagePaper } from '../../../../web/preview/page-paper-paint.mjs';
import { paintTableBorder } from '../../../../web/preview/table-border-paint.mjs';

const color = (value) => {
  if (!/^#[0-9a-f]{6}$/i.test(value)) throw Error('UnsupportedNativePaintColor');
  return [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16) / 255).concat(1);
};
// Records supported canonical paint calls; throws on unavailable features.
// Table plans and boxes MUST come from canonical tableBorderPlanForBox/layout.
export function recordPageAndTablePaint({ pages, width, height, tablePlans = [] }) {
  const commands = [],
    stack = [];
  const ctx = {
    fillStyle: '#ffffff',
    strokeStyle: '#000000',
    lineWidth: 1,
    lineCap: 'butt',
    path: [],
    save() {
      stack.push({
        fillStyle: this.fillStyle,
        strokeStyle: this.strokeStyle,
        lineWidth: this.lineWidth,
        lineCap: this.lineCap,
      });
    },
    restore() {
      if (!stack.length) throw Error('PaintStackUnderflow');
      Object.assign(this, stack.pop());
    },
    fillRect(x, y, w, h) {
      commands.push({
        op: 'fillRect',
        rect: [x, y, w, h],
        lineWidth: 0,
        color: color(this.fillStyle),
      });
    },
    strokeRect(x, y, w, h) {
      commands.push({
        op: 'strokeRect',
        rect: [x, y, w, h],
        lineWidth: this.lineWidth,
        color: color(this.strokeStyle),
      });
    },
    setLineDash(dash) {
      if (dash.length) throw Error('UnsupportedNativeDash');
    },
    beginPath() {
      this.path = [];
    },
    moveTo(x, y) {
      this.path.push([x, y]);
    },
    lineTo(x, y) {
      this.path.push([x, y]);
    },
    stroke() {
      if (this.path.length !== 2) throw Error('UnsupportedNativePath');
      commands.push({
        op: 'line',
        points: this.path.flat(),
        lineWidth: this.lineWidth,
        color: color(this.strokeStyle),
      });
    },
  };
  paintPagePaper(ctx, pages, 0, width, height);
  for (const { box, plan } of tablePlans)
    if (!paintTableBorder(ctx, box, plan, 0)) throw Error('UnsupportedNativeTablePaint');
  if (stack.length) throw Error('UnbalancedPaintStack');
  return commands;
}
