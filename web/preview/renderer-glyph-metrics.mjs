import { PROJECTION_CANVAS_CONTEXT_FIELDS } from './projection-measure-memo.mjs';

const MAX_ENTRIES = 4096;
const MAX_BYTES = 1024 * 1024;
const METRIC_FIELDS = [
  'width',
  'actualBoundingBoxLeft',
  'actualBoundingBoxRight',
  'actualBoundingBoxAscent',
  'actualBoundingBoxDescent',
  'fontBoundingBoxAscent',
  'fontBoundingBoxDescent',
  'emHeightAscent',
  'emHeightDescent',
  'hangingBaseline',
  'alphabeticBaseline',
  'ideographicBaseline',
];

// 렌더러 전용 원시 측정 저장소. 문단·스타일·레이아웃 또는 문서 원문을 저장하지 않습니다.
export function createRendererGlyphMetrics(
  ctx,
  { limit = MAX_ENTRIES, byteLimit = MAX_BYTES } = {},
) {
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > MAX_ENTRIES ||
    !Number.isSafeInteger(byteLimit) ||
    byteLimit < 1 ||
    byteLimit > MAX_BYTES
  )
    throw new RangeError('InvalidRendererGlyphMetricsBudget');
  const entries = new Map();
  let bytes = 0,
    generation = 0,
    scope = null,
    closed = false;
  const clear = () => {
    entries.clear();
    bytes = 0;
    scope = null;
    generation++;
  };
  const keyFor = (text) => {
    if (typeof text !== 'string' || text.length > byteLimit / 2 || typeof ctx.font !== 'string')
      return null;
    const fields = [ctx.font];
    for (const name of PROJECTION_CANVAS_CONTEXT_FIELDS) {
      const value = ctx[name];
      if (value !== undefined && typeof value !== 'string') return null;
      // 부재와 문자열 값은 다른 키입니다. null·임의 객체는 저장하지 않습니다.
      fields.push([typeof value, value]);
    }
    return JSON.stringify([fields, text]);
  };
  const snapshot = (value) => {
    if (!value || !Number.isFinite(value.width) || value.width < 0) return null;
    const result = {};
    for (const name of METRIC_FIELDS) {
      const number = value[name];
      if (number !== undefined && !Number.isFinite(number)) return null;
      result[name] = number;
    }
    return Object.freeze(result);
  };
  return {
    begin(epoch, environment = []) {
      if (closed) return undefined;
      const next = [epoch, ...environment, ctx.measureText];
      if (!scope || scope.length !== next.length || scope.some((v, i) => v !== next[i])) {
        clear();
        scope = next;
      }
      const lease = generation,
        method = ctx.measureText;
      return {
        context: ctx,
        measureText(text) {
          if (closed || lease !== generation) return ctx.measureText(text);
          if (ctx.measureText !== method) {
            clear();
            return ctx.measureText(text);
          }
          const key = keyFor(text);
          if (key === null || closed || lease !== generation) return ctx.measureText(text);
          const cached = entries.get(key);
          if (cached) {
            entries.delete(key);
            entries.set(key, cached);
            return cached.value;
          }
          const value = ctx.measureText(text);
          // 측정 중 수명 또는 컨텍스트가 바뀌면 결과를 현재 캐시에 넣지 않습니다.
          if (closed || lease !== generation || ctx.measureText !== method || keyFor(text) !== key)
            return value;
          const owned = snapshot(value);
          if (closed || lease !== generation || ctx.measureText !== method || keyFor(text) !== key)
            return value;
          const entryBytes = 128 + key.length * 2 + METRIC_FIELDS.length * 8;
          if (!owned || entryBytes > byteLimit) return value;
          while (entries.size >= limit || bytes + entryBytes > byteLimit) {
            const oldest = entries.keys().next().value;
            bytes -= entries.get(oldest).bytes;
            entries.delete(oldest);
          }
          entries.set(key, { value: owned, bytes: entryBytes });
          bytes += entryBytes;
          return owned;
        },
      };
    },
    clear,
    close() {
      clear();
      closed = true;
    },
    get size() {
      return entries.size;
    },
    get estimatedBytes() {
      return bytes;
    },
  };
}
