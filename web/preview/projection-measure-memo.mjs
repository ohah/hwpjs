export const PROJECTION_CANVAS_CONTEXT_FIELDS = Object.freeze([
  'direction',
  'fontKerning',
  'fontStretch',
  'fontVariantCaps',
  'letterSpacing',
  'wordSpacing',
  'textRendering',
  'textAlign',
  'textBaseline',
  'lang',
]);

// 한 동기 layout projection에서만 쓰며 다음 projection과 공유하지 않습니다.
const LIMIT = 4096;
const BYTE_LIMIT = 1024 * 1024;
export function createProjectionFontCache(limit = LIMIT) {
  const sizes = new Map();
  let entries = 0,
    bytes = 0;
  return {
    get(size, family, bold, italic, build) {
      let families = sizes.get(size),
        flags = families?.get(family);
      const emphasis = Number(bold) * 2 + Number(italic);
      if (flags?.has(emphasis)) return flags.get(emphasis);
      const font = build(),
        entryBytes = 64 + (font.length + (family?.length ?? 0)) * 2;
      if (entries < limit && bytes + entryBytes <= BYTE_LIMIT) {
        if (!families) sizes.set(size, (families = new Map()));
        if (!flags) families.set(family, (flags = new Map()));
        flags.set(emphasis, font);
        entries++;
        bytes += entryBytes;
      }
      return font;
    },
  };
}
export function createProjectionCanvasMetrics(
  ctx,
  limit = LIMIT,
  { stableContext = false, rawCanvasMetrics } = {},
) {
  const contexts = new Map();
  let requested = null,
    applied = null,
    currentFont = ctx.font,
    size = 0,
    bytes = 0;
  const contextKey = () => JSON.stringify(PROJECTION_CANVAS_CONTEXT_FIELDS.map((key) => ctx[key]));
  // renderer의 동기 projection 안에서는 이 속성들을 변경하지 않습니다.
  const projectionKey = stableContext ? contextKey() : null;
  return {
    setFont(font) {
      // 동기 layout 전용 경로만 실제 context 변경을 아래 invalidateFont로 알립니다.
      if (stableContext && requested === font && currentFont !== undefined) return;
      const current = ctx.font;
      if (current === font || (requested === font && current === applied)) {
        currentFont = current;
        return;
      }
      ctx.font = font;
      requested = font;
      currentFont = applied = ctx.font;
    },
    invalidateFont() {
      requested = null;
      currentFont = undefined;
    },
    measureText(text) {
      const key = stableContext ? projectionKey : contextKey();
      const font = stableContext ? (currentFont ??= ctx.font) : ctx.font;
      let fonts = contexts.get(key),
        metrics = fonts?.get(font);
      if (metrics?.has(text)) return metrics.get(text);
      const value =
        stableContext && rawCanvasMetrics?.context === ctx
          ? rawCanvasMetrics.measureText(text)
          : ctx.measureText(text);
      const entryBytes = 128 + (key.length + font.length + text.length) * 2;
      if (
        Number.isFinite(value.width) &&
        value.width >= 0 &&
        size < limit &&
        bytes + entryBytes <= BYTE_LIMIT
      ) {
        if (!fonts) contexts.set(key, (fonts = new Map()));
        if (!metrics) fonts.set(font, (metrics = new Map()));
        metrics.set(text, value);
        size++;
        bytes += entryBytes;
      }
      return value;
    },
    get size() {
      return size;
    },
    get estimatedBytes() {
      return bytes;
    },
  };
}
// 글꼴 준비/실패 이후에는 이전 projection의 측정을 다시 쓰지 않습니다.
export function watchProjectionFonts(canvas, invalidate) {
  const fonts = canvas.ownerDocument?.fonts;
  if (!fonts?.addEventListener) return () => {};
  fonts.addEventListener('loadingdone', invalidate);
  fonts.addEventListener('loadingerror', invalidate);
  return () => {
    fonts.removeEventListener('loadingdone', invalidate);
    fonts.removeEventListener('loadingerror', invalidate);
  };
}
function rangeIndex(ranges, unit) {
  let low = 0,
    high = ranges.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (ranges[middle].start <= unit) low = middle + 1;
    else high = middle;
  }
  return low - 1;
}
function selectedRange(ranges, index, unit, length) {
  const range = ranges[index];
  const terminal = length !== null && unit === length && range?.end === unit;
  return range && (unit < range.end || terminal) ? range : null;
}
export function paragraphCharacterRange(paragraph, unit) {
  const ranges = paragraph?.characterRanges ?? [];
  const length = typeof paragraph?.text === 'string' ? paragraph.text.length : null;
  return selectedRange(ranges, rangeIndex(ranges, unit), unit, length);
}
export function createProjectionRangeIndex(limit = LIMIT) {
  const sources = new WeakMap();
  let entries = 0;
  return (paragraph, unit) => {
    const ranges = paragraph?.characterRanges;
    if (!Array.isArray(ranges) || !Number.isFinite(unit))
      return paragraphCharacterRange(paragraph, unit);
    let entry = sources.get(ranges);
    // 부적격 판정은 fallback만 고정합니다. 이후 row가 바뀌어도 양성으로 승격하지 않습니다.
    if (entry === false) return paragraphCharacterRange(paragraph, unit);
    if (!entry) {
      // 상한 이후 새 배열은 검증 자체를 하지 않고 기존 이진검색을 유지합니다.
      if (entries >= limit) return paragraphCharacterRange(paragraph, unit);
      const immutable =
        Object.isFrozen(ranges) &&
        ranges.every(
          (row, index) =>
            row &&
            typeof row === 'object' &&
            Object.isFrozen(row) &&
            ['start', 'end', 'charShapeId'].every((key) =>
              Object.hasOwn(Object.getOwnPropertyDescriptor(row, key) ?? {}, 'value'),
            ) &&
            Number.isSafeInteger(row.start) &&
            Number.isSafeInteger(row.end) &&
            row.start >= 0 &&
            row.end >= row.start &&
            (index === 0 || ranges[index - 1].start <= row.start),
        );
      if (!immutable) {
        sources.set(ranges, false);
        entries++;
        return paragraphCharacterRange(paragraph, unit);
      }
      entry = { index: -1, lastUnit: -Infinity };
      sources.set(ranges, entry);
      entries++;
    }
    if (unit < entry.lastUnit) entry.index = rangeIndex(ranges, unit);
    else {
      let advanced = 0;
      while (
        entry.index + 1 < ranges.length &&
        ranges[entry.index + 1].start <= unit &&
        advanced < 4
      ) {
        entry.index++;
        advanced++;
      }
      // 큰 전진 점프도 원래 이진검색보다 나쁜 선형 검색으로 바꾸지 않습니다.
      if (entry.index + 1 < ranges.length && ranges[entry.index + 1].start <= unit)
        entry.index = rangeIndex(ranges, unit);
    }
    entry.lastUnit = unit;
    // 문단은 mutable 사본일 수 있으므로 text 길이를 identity에 저장하지 않습니다.
    const length = typeof paragraph?.text === 'string' ? paragraph.text.length : null;
    return selectedRange(ranges, entry.index, unit, length);
  };
}
