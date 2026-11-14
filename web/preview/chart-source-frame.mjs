const geometryKeys = [
  'width',
  'height',
  'width_relative',
  'height_relative',
  'treat_as_character',
  'horizontal_offset',
  'vertical_offset',
];

/** Values only: a frame comparison never proves that chart data is current. */
export function sameChartSourceFrame(left, right) {
  return Boolean(
    left &&
    right &&
    geometryKeys.every((key) => left.geometry?.[key] === right.geometry?.[key]) &&
    ['flags', 'relations'].every(
      (key) =>
        Array.isArray(left.position?.[key]) &&
        Array.isArray(right.position?.[key]) &&
        left.position[key].length === right.position[key].length &&
        left.position[key].every((value, i) => value === right.position[key][i]),
    ),
  );
}

export function chartDisplayMatchesOle(display, ole) {
  return Boolean(
    display &&
    ole &&
    display.pair?.section_ordinal === ole.section &&
    display.pair?.wrapper_node === ole.chartWrapper &&
    display.host?.wrapper_node === ole.chartWrapper &&
    sameChartSourceFrame(display.host, ole.source),
  );
}
