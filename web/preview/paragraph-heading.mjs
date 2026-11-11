const hwp5Kinds = ['none', 'outline', 'number', 'bullet'];

export function unavailableHeading(reason) {
  return Object.freeze({ state: 'unavailable', reason });
}

// The snapshot carries only authoritative resource metadata. List templates,
// inline automatic numbers, and document characters cannot supply a marker.
export function observedParagraphHeading(format, shape, label) {
  const heading =
    format === 'hwp5'
      ? { kind: hwp5Kinds[shape?.headingKind], marker: shape?.headingMarker }
      : format === 'hwpx'
        ? shape?.heading
        : null;
  if (heading?.kind === 'none')
    return Object.freeze({ state: 'available', kind: 'none', text: '' });
  if (heading?.kind === 'number' || heading?.kind === 'outline') {
    if (label?.kind !== heading.kind || typeof label.text !== 'string' || label.text.length === 0)
      return unavailableHeading('numbering-not-computed');
    return Object.freeze({
      state: 'available',
      kind: heading.kind,
      text: label.text,
      provenance: format === 'hwp5' ? 'hwp5-numbering' : 'hwpx-numbering',
    });
  }
  if (heading?.kind !== 'bullet') return unavailableHeading('heading-not-observed');
  const marker = heading.marker;
  if (
    !Number.isInteger(marker) ||
    marker <= 0x20 ||
    marker > 0x10ffff ||
    (marker >= 0x7f && marker <= 0x9f) ||
    (marker >= 0xd800 && marker <= 0xdfff)
  )
    return unavailableHeading('unsupported-bullet');
  return Object.freeze({
    state: 'available',
    kind: 'bullet',
    text: String.fromCodePoint(marker),
    provenance: format === 'hwp5' ? 'hwp5-docinfo' : 'hwpx-header',
  });
}
