// Host-only font measurement. Equation semantics and layout remain in Zig.
export function equationFont(request, family) {
  // oxlint-disable-next-line no-control-regex -- 수식 글꼴 이름의 C0·DEL 제어문자를 거부하는 입력 검증이다.
  if (typeof family !== 'string' || !family.trim() || /[\x00-\x1f\x7f]/u.test(family))
    throw new Error('InvalidEquationFontFamily');
  if (
    !Number.isFinite(request?.size) ||
    request.size <= 0 ||
    request.size > 1_000_000 ||
    typeof request?.style?.italic !== 'boolean' ||
    typeof request?.style?.bold !== 'boolean'
  )
    throw new Error('InvalidEquationFontRequest');
  const quoted = family.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
  return `${request.style.italic ? 'italic' : 'normal'} ${request.style.bold ? 'bold' : 'normal'} ${request.size}px "${quoted}"`;
}

export function configureEquationText(ctx) {
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.direction = 'ltr';
  ctx.letterSpacing = '0px';
  ctx.wordSpacing = '0px';
  ctx.fontKerning = 'normal';
  ctx.fontStretch = 'normal';
  ctx.fontVariantCaps = 'normal';
}

export function measureEquationRequests(
  ctx,
  requests,
  family,
  { maxRequests = 65536, maxBytes = 4 * 1024 * 1024, maxExtent = 1_000_000 } = {},
) {
  if (
    !Number.isSafeInteger(maxRequests) ||
    maxRequests < 0 ||
    !Number.isSafeInteger(maxBytes) ||
    maxBytes < 0 ||
    !Number.isFinite(maxExtent) ||
    maxExtent <= 0
  )
    throw new Error('InvalidEquationMeasurementLimit');
  if (!Array.isArray(requests) || requests.length > maxRequests)
    throw new Error('EquationMeasurementLimitExceeded');
  let bytes = 0;
  const encoder = new TextEncoder();
  const fonts = requests.map((request) => {
    if (typeof request?.text !== 'string' || !request.text.isWellFormed())
      throw new Error('InvalidEquationMeasurementText');
    if (request.text.length > maxBytes - bytes) throw new Error('EquationMeasurementLimitExceeded');
    bytes += encoder.encode(request.text).length;
    if (bytes > maxBytes) throw new Error('EquationMeasurementLimitExceeded');
    return equationFont(request, family);
  });
  ctx.save();
  try {
    configureEquationText(ctx);
    return requests.map((request, index) => {
      ctx.font = fonts[index];
      const value = ctx.measureText(request.text);
      const raw = [value.width, value.actualBoundingBoxAscent, value.actualBoundingBoxDescent];
      if (raw.some((n) => !Number.isFinite(n)) || raw[0] < 0)
        throw new Error('InvalidEquationLayoutMetric');
      const box = { width: raw[0], ascent: Math.max(0, raw[1]), descent: Math.max(0, raw[2]) };
      if (Math.max(box.width, box.ascent + box.descent) > maxExtent)
        throw new Error('EquationLayoutLimitExceeded');
      return { request: index, box };
    });
  } finally {
    ctx.restore();
  }
}
