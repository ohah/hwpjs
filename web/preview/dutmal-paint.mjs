// System-font preview policy, not the source application's ruby shaping.
export function dutmalAt(paragraph, unit) {
  if (paragraph?.text?.[unit] !== '\ufffc') return null;
  const rows = paragraph.dutmal?.filter((row) => row.unit === unit) ?? [];
  return rows.length === 1 ? rows[0] : null;
}

export function dutmalPaintPlan(row, font, height, measure) {
  const attributes = row?.sourceAttributes;
  if (
    !row ||
    typeof row.mainText !== 'string' ||
    typeof row.subText !== 'string' ||
    !['TOP', 'BOTTOM'].includes(attributes?.pos_type) ||
    !['LEFT', 'CENTER', 'RIGHT'].includes(attributes?.alignment)
  )
    return null;
  const raw = attributes.sz_ratio;
  if (typeof raw !== 'string' || !/^\d{1,3}$/.test(raw)) return null;
  const ratio = Number(raw) === 0 ? 0.5 : Number(raw) / 100;
  if (ratio <= 0 || ratio > 2 || !Number.isFinite(height) || height <= 0) return null;
  const match = /(?:^|\s)(\d+(?:\.\d+)?)(px|pt)(?=\s)/.exec(font);
  if (!match) return null;
  const subFont = font.replace(match[1] + match[2], String(Number(match[1]) * ratio) + match[2]);
  const mainWidth = measure(row.mainText, font),
    subWidth = measure(row.subText, subFont);
  if (![mainWidth, subWidth].every((width) => Number.isFinite(width) && width >= 0)) return null;
  const width = Math.max(mainWidth, subWidth),
    subHeight = row.subText ? height * ratio : 0;
  const gap = subHeight ? 2 : 0;
  const offset = (advance) =>
    attributes.alignment === 'LEFT'
      ? 0
      : attributes.alignment === 'RIGHT'
        ? width - advance
        : (width - advance) / 2;
  return {
    width,
    height: height + subHeight + gap,
    previewDefaultRatio: Number(raw) === 0,
    main: {
      text: row.mainText,
      font,
      x: offset(mainWidth),
      y: attributes.pos_type === 'TOP' ? subHeight + gap : 0,
    },
    sub: {
      text: row.subText,
      font: subFont,
      x: offset(subWidth),
      y: attributes.pos_type === 'TOP' ? 0 : height + gap,
    },
  };
}

export function paintDutmal(ctx, plan, x, y) {
  if (!plan) return false;
  ctx.save();
  try {
    for (const run of [plan.main, plan.sub]) {
      ctx.font = run.font;
      ctx.fillText(run.text, x + run.x, y + run.y);
    }
  } finally {
    ctx.restore();
  }
  return true;
}
