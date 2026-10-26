// Canvas state adapter only. The renderer owns layout/paint policy; Native owns
// font measurement and image bytes. No DOM, OffscreenCanvas or WebView created.
const clone = (value) => JSON.parse(JSON.stringify(value));
export function createNativeCommandContext(measureText) {
  if (typeof measureText !== 'function') throw Error('NativeTextMeasurementUnavailable');
  let commands = [],
    matrix = [1, 0, 0, 1, 0, 0],
    stack = [];
  const initial = {
    font: '16px system-ui',
    fillStyle: '#000000',
    strokeStyle: '#000000',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    miterLimit: 10,
    lineDashOffset: 0,
    textAlign: 'start',
    textBaseline: 'alphabetic',
    shadowColor: '#00000000',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    filter: 'none',
  };
  let state = { ...initial };
  const append = (method, args = []) => {
    if (commands.length >= 100000) throw Error('PaintCommandBudget');
    commands.push({ op: 'ctx', method, args: clone(args) });
  };
  const multiply = (b) => {
    const a = matrix;
    matrix = [
      a[0] * b[0] + a[2] * b[1],
      a[1] * b[0] + a[3] * b[1],
      a[0] * b[2] + a[2] * b[3],
      a[1] * b[2] + a[3] * b[3],
      a[0] * b[4] + a[2] * b[5] + a[4],
      a[1] * b[4] + a[3] * b[5] + a[5],
    ];
  };
  const finite = (args) => {
    if (!args.every(Number.isFinite)) throw Error('InvalidPaintNumber');
  };
  const ctx = {
    measureText(text) {
      const m = measureText(String(text), state.font);
      if (
        !m ||
        !Number.isFinite(m.width) ||
        m.width < 0 ||
        !Number.isFinite(m.actualBoundingBoxAscent) ||
        !Number.isFinite(m.actualBoundingBoxDescent)
      )
        throw Error('InvalidNativeTextMetrics');
      return m;
    },
    save() {
      stack.push({ state: clone(state), matrix: [...matrix] });
      append('save');
    },
    restore() {
      if (!stack.length) throw Error('PaintStackUnderflow');
      ({ state, matrix } = stack.pop());
      append('restore');
    },
    setTransform(...args) {
      finite(args);
      if (args.length !== 6) throw Error('InvalidTransform');
      matrix = [...args];
      append('setTransform', args);
    },
    transform(...args) {
      finite(args);
      if (args.length !== 6) throw Error('InvalidTransform');
      multiply(args);
      append('transform', args);
    },
    translate(x, y) {
      this.transform(1, 0, 0, 1, x, y);
    },
    scale(x, y) {
      this.transform(x, 0, 0, y, 0, 0);
    },
    getTransform() {
      const [a, b, c, d, e, f] = matrix;
      return { a, b, c, d, e, f };
    },
    setLineDash(args) {
      finite(args);
      if (args.some((v) => v < 0)) throw Error('InvalidDash');
      append('setLineDash', [args]);
    },
    fillText(text, x, y) {
      finite([x, y]);
      append('fillText', [String(text), x, y]);
    },
    strokeText(text, x, y) {
      finite([x, y]);
      append('strokeText', [String(text), x, y]);
    },
    drawImage(bitmap, ...args) {
      if (!bitmap || typeof bitmap.key !== 'string' || ![2, 4, 8].includes(args.length))
        throw Error('InvalidNativeImage');
      finite(args);
      append('drawImage', [bitmap.key, ...args]);
    },
    createLinearGradient(...points) {
      finite(points);
      if (points.length !== 4) throw Error('InvalidGradient');
      const g = {
        kind: 'linear',
        points,
        stops: [],
        addColorStop(at, color) {
          if (!Number.isFinite(at) || at < 0 || at > 1 || typeof color !== 'string')
            throw Error('InvalidGradientStop');
          this.stops.push([at, color]);
        },
      };
      return g;
    },
  };
  for (const method of [
    'beginPath',
    'closePath',
    'stroke',
    'fill',
    'clip',
    'moveTo',
    'lineTo',
    'bezierCurveTo',
    'rect',
    'fillRect',
    'strokeRect',
    'arc',
    'ellipse',
  ])
    ctx[method] = (...args) => {
      for (const a of args)
        if (typeof a === 'number' && !Number.isFinite(a)) throw Error('InvalidPaintNumber');
      append(method, args);
    };
  for (const key of Object.keys(initial))
    Object.defineProperty(ctx, key, {
      get: () => state[key],
      set: (value) => {
        // Gradient carries a method; only serialize its DTO, never executable objects.
        const dto =
          value?.kind === 'linear'
            ? { kind: value.kind, points: value.points, stops: value.stops }
            : value;
        state[key] = dto;
        append('set', [key, dto]);
      },
    });
  return {
    ctx,
    begin() {
      commands = [];
      stack = [];
      matrix = [1, 0, 0, 1, 0, 0];
      state = { ...initial };
    },
    finish() {
      if (stack.length) throw Error('UnbalancedPaintStack');
      return clone(commands);
    },
  };
}
