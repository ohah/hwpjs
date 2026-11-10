import { textMeasurement } from './text-measurement.mjs';
import { validateHwp5PageControlSources } from '../../js/hwp5-page-control-sources.mjs';
import { hwp5NumberFormat, formatNumber } from './number-format.mjs';

// Measured preview positioning; not original Hancom font/baseline parity.
export function layoutPageNumberGlyphs(pages, paragraphs, measure) {
  const fail = (error) => ({ state: 'unavailable', error });
  if (!Array.isArray(pages) || !Array.isArray(paragraphs) || typeof measure !== 'function')
    return fail('InvalidHwp5PageNumberInputs');
  const glyphs = [];
  let owners;
  for (const page of pages) {
    const control = page.pageNumberPosition;
    if (!control || page.hidePageNumber) continue;
    try {
      validateHwp5PageControlSources([control]);
    } catch (error) {
      return fail(error.message);
    }
    if (
      control.kind !== 'position' ||
      (control.attributes & ~0xfff) !== 0 ||
      hwp5NumberFormat(control.attributes & 255) === null ||
      [control.symbol, control.prefix, control.suffix, control.dash].some(
        (unit) => unit >= 0xd800 && unit <= 0xdfff,
      )
    )
      return fail('UnsupportedHwp5PageNumberPosition');
    const position = (control.attributes >>> 8) & 15;
    if (position > 10) return fail('UnsupportedHwp5PageNumberPosition');
    if (position === 0) continue;
    if (!owners) {
      owners = new Map();
      for (const paragraph of paragraphs) {
        const key = `${paragraph.section}:${paragraph.paragraph}`;
        if (!owners.has(key)) owners.set(key, paragraph);
      }
    }
    const owner = owners.get(`${control.section}:${control.paragraph}`);
    if (!owner || !Number.isInteger(page.number) || page.number < 1 || page.number > 0xffffffff)
      return fail('MissingHwp5PageNumberOwner');
    const char = (value) => (value === 0 ? '' : String.fromCharCode(value));
    const formatted = formatNumber(
      page.number,
      hwp5NumberFormat(control.attributes & 255),
      char(control.symbol),
    );
    if (formatted === null) return fail('UnsupportedHwp5PageNumberFormatRange');
    const plain = char(control.prefix) + formatted + char(control.suffix),
      dash = char(control.dash);
    const text = dash ? `${dash} ${plain} ${dash}` : plain;
    const placed = placePageNumberGlyph(page, position, text, owner, control.unit, measure);
    if (placed.state !== 'placed')
      return fail(placed.error === 'PageNumberOverflow' ? 'Hwp5PageNumberOverflow' : placed.error);
    glyphs.push(placed.glyph);
  }
  return { state: 'placed', glyphs };
}

/** Position already formatted number text inside the physical page's margin band. */
export function placePageNumberGlyph(page, position, text, owner, unit, measure) {
  let metrics;
  try {
    metrics = textMeasurement(measure(text, owner, unit, 'text'));
  } catch (error) {
    return { state: 'unavailable', error: error.message };
  }
  const top = [1, 2, 3, 7, 9].includes(position);
  const box = page[top ? 'header' : 'footer'];
  if (
    !box ||
    ![box.x, box.y, box.width, box.height].every(Number.isFinite) ||
    box.width <= 0 ||
    box.height <= 0 ||
    metrics.width > box.width ||
    metrics.height > box.height
  )
    return { state: 'unavailable', error: 'PageNumberOverflow' };
  let alignment = [1, 4].includes(position) ? 0 : [2, 5].includes(position) ? 1 : 2;
  if (position >= 7) alignment = (page.number % 2 === 1) === [7, 8].includes(position) ? 2 : 0;
  return {
    state: 'placed',
    glyph: {
      text,
      x: box.x + ((box.width - metrics.width) * alignment) / 2,
      y: box.y + (box.height - metrics.height) / 2,
      width: metrics.width,
      height: metrics.height,
      section: owner.section,
      paragraph: owner.paragraph,
      unit,
      pageOrdinal: page.ordinal,
    },
  };
}

export function paintPageNumberGlyphs(ctx, glyphs, scrollTop, fontAt) {
  for (const glyph of glyphs ?? []) {
    ctx.save();
    try {
      ctx.font = fontAt(glyph);
      ctx.fillStyle = '#172b3b';
      ctx.textBaseline = 'top';
      ctx.fillText(glyph.text, glyph.x, glyph.y - scrollTop);
    } finally {
      ctx.restore();
    }
  }
}
