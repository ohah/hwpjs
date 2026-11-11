import { hwpUnitPixels } from './hwp-units.mjs';
import { paragraphAlignmentKey } from './paragraph-alignments.mjs';
import { paragraphLineGeometry } from './paragraph-geometry.mjs';
import { createNativeGraphemeSegmenter } from './text-boundary-platform.mjs';
import { isHardLineBreak } from './hard-line-break.mjs';
import { measureDisplayRun } from './text-measurement.mjs';

const markerKind = 'paragraph-marker';
const alignments = ['LEFT', 'CENTER', 'RIGHT'];
const maxReserve = 256;

export function observedMarkerPlacement(format, raw) {
  if (!raw || raw.char_shape_id !== 0xffffffff) return null;
  if (format === 'hwp5') {
    const flags = raw.attributes;
    if (!Number.isInteger(flags) || flags < 0 || flags > 0x1f) return null;
    raw = {
      alignment: alignments[flags & 3],
      use_instance_width: (flags & 4) !== 0,
      auto_indent: (flags & 8) !== 0,
      width_adjust: raw.width_adjustment,
      offset_type: flags & 16 ? 'HWPUNIT' : 'PERCENT',
      text_offset: raw.text_distance,
    };
  }
  const { alignment, use_instance_width, auto_indent, width_adjust, offset_type, text_offset } =
    raw;
  if (
    !alignments.includes(alignment) ||
    typeof use_instance_width !== 'boolean' ||
    typeof auto_indent !== 'boolean' ||
    !Number.isInteger(width_adjust) ||
    !Number.isInteger(text_offset) ||
    text_offset < 0 ||
    !['PERCENT', 'HWPUNIT'].includes(offset_type) ||
    (offset_type === 'PERCENT' && text_offset > 100) ||
    (!auto_indent && text_offset !== 0)
  )
    return null;
  return {
    alignment,
    useInstanceWidth: use_instance_width,
    autoIndent: auto_indent,
    widthAdjust: hwpUnitPixels(width_adjust),
    offsetType: offset_type,
    textOffset: text_offset,
  };
}

function sourceMarker(paragraph) {
  const shape = paragraph.paragraphShape;
  const format = shape?.spacingFormat;
  if (paragraph.numberingLabel) {
    const { kind, text, markerPlacement, widthText } = paragraph.numberingLabel;
    if (kind === 'number' || kind === 'outline')
      return { text, widthText, placement: markerPlacement };
    return null;
  }
  const bullet =
    format === 'hwp5'
      ? shape.headingKind === 3 && {
          marker: shape.headingMarker,
          placement: shape.headingPlacement,
        }
      : format === 'hwpx' && shape.heading?.kind === 'bullet' && shape.heading;
  const scalar = bullet?.marker;
  if (
    !Number.isInteger(scalar) ||
    scalar <= 0x20 ||
    scalar > 0x10ffff ||
    (scalar >= 0x7f && scalar <= 0x9f) ||
    (scalar >= 0xd800 && scalar <= 0xf8ff) ||
    scalar >= 0xf0000
  )
    return null;
  const text = String.fromCodePoint(scalar);
  return { text, widthText: text, placement: observedMarkerPlacement(format, bullet.placement) };
}

function lastFontUnit(text) {
  if (!text.length) return 0;
  let unit = text.length - 1;
  // Skip a bounded terminal control suffix. The marker has no source offset.
  for (let i = 0; unit >= 0 && i < 8; i++, unit--) {
    if (isHardLineBreak(text[unit]) || text[unit] === '\ufffc') continue;
    const code = text.charCodeAt(unit);
    return code >= 0xdc00 && code <= 0xdfff ? unit - 1 : unit;
  }
  return null;
}

export function paragraphMarkerPlan(paragraph, width, measure) {
  if (
    paragraph.clipped ||
    paragraph.textStartUnit > 0 ||
    paragraph.text.length > 32768 ||
    paragraph.selectionOwner !== `section:${paragraph.section}:body` ||
    paragraph.automaticNumberPrefixes?.length ||
    paragraph.automaticNumbers?.length ||
    !['LEFT', 'JUSTIFY'].includes(paragraphAlignmentKey(paragraph.paragraphShape?.alignment))
  )
    return null;
  const marker = sourceMarker(paragraph);
  if (
    !marker?.placement ||
    typeof marker.text !== 'string' ||
    marker.text.length === 0 ||
    marker.text.length > 128 ||
    paragraph.text.includes('\t')
  )
    return null;
  const { placement, text } = marker;
  const unit = lastFontUnit(paragraph.text);
  if (unit === null || unit < 0) return null;
  const { width: ink, height, em } = measure(text, paragraph, unit, markerKind);
  if (![ink, height, em].every((value) => Number.isFinite(value) && value > 0)) return null;
  const widthText = placement.useInstanceWidth ? text : marker.widthText;
  if (typeof widthText !== 'string' || !widthText.length || widthText.length > 128) return null;
  const reference =
    widthText === text ? ink : measure(widthText, paragraph, unit, markerKind).width;
  const slot = reference + placement.widthAdjust;
  const gap =
    placement.offsetType === 'PERCENT'
      ? (em * placement.textOffset) / 100
      : hwpUnitPixels(placement.textOffset);
  const first = paragraphLineGeometry(paragraph.paragraphShape, width, 0, true);
  const following = paragraphLineGeometry(paragraph.paragraphShape, width, 0, false);
  // An authored first-line offset combined with automatic hanging needs
  // a verified composition rule. Keep that combination in the fallback.
  if (placement.autoIndent && Math.abs(first.x - following.x) > 1e-6) return null;
  const reserve = placement.autoIndent ? slot + gap : slot;
  const hang = placement.autoIndent ? reserve : 0;
  if (
    !Number.isFinite(slot) ||
    slot <= 0 ||
    !Number.isFinite(reserve) ||
    reserve > Math.min(maxReserve, first.width / 3) ||
    first.width - reserve < em ||
    following.width - hang < em
  )
    return null;
  const firstPart = createNativeGraphemeSegmenter().segment(paragraph.text).containing(0);
  if (
    firstPart &&
    !isHardLineBreak(firstPart.segment) &&
    measureDisplayRun(firstPart.segment, paragraph, 0, 'text', measure).width >
      first.width - reserve
  )
    return null;
  // Stored width correction may make the slot narrower than the glyph.
  // Preserve LEFT/CENTER/RIGHT anchor positions with a signed ink offset.
  const slack = slot - ink;
  const offset =
    placement.alignment === 'RIGHT' ? slack : placement.alignment === 'CENTER' ? slack / 2 : 0;
  return {
    prefix: { kind: markerKind, text, unit, width: reserve, height, offset, glyphWidth: ink },
    first,
    following: { x: following.x + hang, width: following.width - hang },
  };
}
