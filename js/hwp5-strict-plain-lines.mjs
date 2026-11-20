// Pure geometry/coverage preparation. No measurement authority or save token.
export function prepareStrictPlainLines(snapshot, measure) {
  if (snapshot?.schema !== 1 || snapshot.version < 0x05000107 || snapshot.version >= 0x05010000)
    throw Error('UnsupportedLayoutWriteVersion');
  if (
    ![snapshot.width, snapshot.height].every(
      (n) => Number.isSafeInteger(n) && n > 0 && n <= 0x7fffffff,
    )
  )
    throw Error('UnsupportedStrictPage');
  if (
    !Array.isArray(snapshot.paragraphs) ||
    !snapshot.paragraphs.length ||
    snapshot.paragraphs.length > 65535
  )
    throw Error('UnsupportedStrictBody');
  const lines = [];
  let y = 0,
    units = 0;
  for (const [paragraph, p] of snapshot.paragraphs.entries()) {
    if (
      !Array.isArray(p.raw) ||
      !p.raw.length ||
      p.raw.at(-1) !== 13 ||
      !p.raw.every((u) => Number.isInteger(u) && u >= 0 && u <= 65535)
    )
      throw Error('InvalidStrictText');
    units += p.raw.length;
    if (units > 4 * 1024 * 1024) throw Error('LayoutLimitExceeded');
    if (
      !Number.isInteger(p.size) ||
      p.size <= 0 ||
      p.size > 72000 ||
      !Number.isInteger(p.spacing_percent) ||
      p.spacing_percent < 100 ||
      p.spacing_percent > 1000 ||
      typeof p.font !== 'string' ||
      !p.font ||
      typeof p.bold !== 'boolean' ||
      typeof p.italic !== 'boolean'
    )
      throw Error('UnsupportedStrictCharacterStyle');
    let visible = 0;
    if (p.raw[0] === 2) {
      if (
        paragraph !== 0 ||
        p.raw.length < 17 ||
        p.raw[7] !== 2 ||
        p.raw[8] !== 2 ||
        p.raw[15] !== 2 ||
        p.raw[1] !== 0x6364 ||
        p.raw[2] !== 0x7365 ||
        p.raw[9] !== 0x6c64 ||
        p.raw[10] !== 0x636f
      )
        throw Error('UnsupportedStrictBody');
      visible = 16;
    }
    for (let i = visible; i < p.raw.length - 1; i++) {
      const u = p.raw[i];
      if (!(u === 10 || (u >= 32 && u <= 126) || (u >= 0xac00 && u <= 0xd7a3)))
        throw Error('UnsupportedStrictScript');
    }
    let start = 0;
    for (;;) {
      let end = visible;
      while (end < p.raw.length - 1 && p.raw[end] !== 10) end++;
      // Each unit occurs in exactly one measurement; no growing-prefix scans.
      let text = '';
      for (let i = visible; i < end; i += 4096)
        text += String.fromCharCode(...p.raw.slice(i, Math.min(end, i + 4096)));
      const m = measure(text, p);
      if (
        !m ||
        ![m.width, m.ascent, m.descent].every(Number.isFinite) ||
        m.width < 0 ||
        m.ascent <= 0 ||
        m.descent < 0
      )
        throw Error('MissingActualFontMetrics');
      const height = Math.max(p.size, Math.ceil((m.ascent + m.descent) * 75));
      const baseline = Math.round(m.ascent * 75);
      const advance = Math.floor((p.size * p.spacing_percent + 50) / 100);
      if (Math.ceil(m.width * 75) > snapshot.width || height > advance || baseline > height)
        throw Error('StrictLayoutNeedsWrapOrLargerLineBox');
      if (y + advance > snapshot.height) throw Error('StrictLayoutPageOverflow');
      if (lines.length >= 262144) throw Error('LayoutLimitExceeded');
      lines.push({
        paragraph,
        segment: {
          start,
          y,
          height,
          text_height: p.size,
          baseline,
          spacing: advance - height,
          x: 0,
          width: snapshot.width,
          flags:
            (1 << 17) | (1 << 18) | (lines.length === 0 ? 3 : 0) | (end === visible ? 1 << 16 : 0),
        },
      });
      y += advance;
      if (end === p.raw.length - 1) break;
      visible = end + 1;
      start = visible;
    }
  }
  return lines;
}
