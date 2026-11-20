// Data validation only. This module cannot authorize Session.save or clear dirty.
const FIRST_PAGE = 1;
const FIRST_COLUMN = 2;
const EMPTY = 1 << 16;
const FIRST_SEGMENT = 1 << 17;
const LAST_SEGMENT = 1 << 18;
const KNOWN_FLAGS = 3 | (0x3f << 16);
export const LINE_LAYOUT_LIMITS = Object.freeze({
  units: 4_194_304,
  lines: 262_144,
  pages: 16_384,
});
function require(ok, name) {
  if (!ok) throw new Error(name);
}
function integer(value, min, max) {
  return Number.isSafeInteger(value) && value >= min && value <= max;
}
export function cssPixelsToHwpUnits(value) {
  require(Number.isFinite(value), 'InvalidLayoutNumber');
  const units = value < 0 ? -Math.round(-value * 75) : Math.round(value * 75);
  require(integer(units, -2147483648, 2147483647), 'LayoutUnitOverflow');
  return units === 0 ? 0 : units;
}
function sourceBoundaries(raw, work, segmenter) {
  require(raw.length > 0 && raw.at(-1) === 13, 'MissingParagraphTerminator');
  const boundary = new Uint8Array(raw.length + 1);
  const breaks = new Uint32Array(raw.length + 1);
  const textUnits = new Uint32Array(raw.length + 1);
  let at = 0;
  while (at < raw.length) {
    const start = at,
      unit = raw[at];
    boundary[at] = 1;
    if (unit === 2) {
      require((at === 0 || at === 8) && at + 8 <= raw.length, 'UnsupportedLayoutControl');
      const id = (raw[at + 1] | (raw[at + 2] << 16)) >>> 0;
      require(id === (at === 0 ? 0x73656364 : 0x636f6c64) &&
        raw[at + 7] === 2, 'UnsupportedLayoutControl');
      at += 8;
    } else if (unit >= 0xd800 && unit <= 0xdbff) {
      require(at + 1 < raw.length &&
        raw[at + 1] >= 0xdc00 &&
        raw[at + 1] <= 0xdfff, 'InvalidLayoutUnicode');
      at += 2;
    } else {
      require(!(unit >= 0xdc00 && unit <= 0xdfff), 'InvalidLayoutUnicode');
      require(![0x85, 0x2028, 0x2029].includes(unit), 'UnsupportedLayoutControl');
      require(unit >= 32 ||
        unit === 10 ||
        (unit === 13 && at === raw.length - 1), 'UnsupportedLayoutControl');
      at++;
    }
    for (let i = start; i < at; i++) {
      breaks[i + 1] = breaks[i] + Number(i === start && unit === 10);
      textUnits[i + 1] = textUnits[i] + Number(unit >= 32);
      work.unitsVisited++;
    }
  }
  boundary[raw.length] = 1;
  // The current platform grapheme provider is a DATA dependency, not a proof.
  // The future owner must bind its generation together with fonts/shaping.
  const chunks = [];
  for (let offset = 0; offset < raw.length; offset += 4096)
    chunks.push(String.fromCharCode(...raw.subarray(offset, offset + 4096)));
  const graphemes = new Uint8Array(raw.length + 1);
  for (const item of segmenter.segment(chunks.join(''))) {
    graphemes[item.index] = 1;
    graphemes[item.index + item.segment.length] = 1;
    work.graphemeUnitsVisited += item.segment.length;
  }
  for (let index = 0; index <= raw.length; index++) {
    boundary[index] &= graphemes[index];
    work.boundariesVisited++;
  }
  return { boundary, breaks, textUnits };
}

/** Full plain-body data coverage, O(units + paragraphs + lines + pages).
 * Inputs are snapshots of native-owned current text and engine geometry.
 * A valid return value is NOT a measured-font proof or a publication ticket.
 */
export function prepareLineLayout({ version, paragraphs, pages, lines }) {
  require(integer(version, 0x05000107, 0x0500ffff), 'UnsupportedLayoutWriteVersion');
  require(Array.isArray(paragraphs) &&
    paragraphs.length > 0 &&
    Array.isArray(pages) &&
    pages.length > 0 &&
    Array.isArray(lines), 'InvalidLayoutBatch');
  require(pages.length <= LINE_LAYOUT_LIMITS.pages &&
    lines.length <= LINE_LAYOUT_LIMITS.lines, 'LayoutLimitExceeded');
  const work = {
    unitsVisited: 0,
    graphemeUnitsVisited: 0,
    boundariesVisited: 0,
    paragraphsVisited: 0,
    pagesVisited: 0,
    linesVisited: 0,
  };
  const pageCopies = pages.map((page) => {
    work.pagesVisited++;
    require(integer(page.section, 0, 0xffffffff) &&
      integer(page.width, 1, 2147483647) &&
      integer(page.height, 1, 2147483647), 'InvalidLayoutPage');
    return { section: page.section, width: page.width, height: page.height };
  });
  const seenPage = new Uint8Array(pages.length),
    ends = new Float64Array(pages.length);
  const segmenter = new Intl.Segmenter('ko', { granularity: 'grapheme' });
  const result = [];
  let lineIndex = 0,
    totalUnits = 0,
    previousPage = 0,
    previousSection = 0,
    previousOrdinal = -1;
  for (let index = 0; index < paragraphs.length; index++) {
    work.paragraphsVisited++;
    const p = paragraphs[index];
    require(integer(p.section, 0, 0xffffffff) &&
      integer(p.headerOrdinal, 0, 0xffffffff), 'InvalidLayoutParagraph');
    require(p.section >= previousSection &&
      (p.section !== previousSection ||
        p.headerOrdinal > previousOrdinal), 'UnorderedLayoutParagraph');
    require(p.rawText instanceof Uint16Array &&
      !(
        typeof SharedArrayBuffer === 'function' && p.rawText.buffer instanceof SharedArrayBuffer
      ), 'OwnedLayoutTextRequired');
    totalUnits += p.rawText.length;
    require(totalUnits <= LINE_LAYOUT_LIMITS.units, 'LayoutLimitExceeded');
    const rawText = p.rawText.slice(),
      { boundary, breaks, textUnits } = sourceBoundaries(rawText, work, segmenter),
      segments = [];
    let cursor = 0,
      lastEnd = 0,
      lastHardBreak = false;
    while (lineIndex < lines.length && lines[lineIndex].paragraph === index) {
      const line = lines[lineIndex],
        geometry = line.geometry;
      work.linesVisited++;
      require(segments.length < 65535, 'ParagraphLineCountOverflow');
      require(integer(line.start, 0, rawText.length - 1) &&
        integer(line.end, line.start, rawText.length - 1) &&
        line.start === cursor &&
        boundary[line.start] &&
        boundary[line.end], 'InvalidLayoutTextCoverage');
      require(line.end > line.start ||
        (line.end === rawText.length - 1 &&
          (segments.length === 0 || lastHardBreak)), 'UnexpectedEmptyLayoutLine');
      const hard = breaks[line.end] - breaks[line.start];
      require(hard === 0 || (hard === 1 && rawText[line.end - 1] === 10), 'UnflowedHardBreak');
      require(integer(line.page, 0, pages.length - 1) &&
        line.page >= previousPage &&
        line.page <= previousPage + 1 &&
        (lineIndex !== 0 || line.page === 0), 'InvalidLayoutPageFlow');
      const page = pageCopies[line.page];
      require(page.section === p.section, 'WrongLayoutSection');
      require(geometry &&
        ['y', 'height', 'textHeight', 'baseline', 'spacing', 'x', 'width'].every((name) =>
          integer(geometry[name], -2147483648, 2147483647),
        ), 'InvalidLayoutGeometry');
      const { y, height, textHeight, baseline, spacing, x, width } = geometry;
      const occupied = Math.max(height, height + spacing);
      require(y >= 0 &&
        height > 0 &&
        textHeight > 0 &&
        textHeight <= height &&
        baseline >= 0 &&
        baseline <= height &&
        height + spacing > 0 &&
        height + spacing <= 2147483647 &&
        x >= 0 &&
        width > 0 &&
        x + width <= page.width &&
        y + occupied <= page.height &&
        y >= ends[line.page], 'LayoutOverflowOrOverlap');
      require(integer(line.flags, 0, 0xffffffff) &&
        (line.flags & ~KNOWN_FLAGS) === 0 &&
        (line.flags & (FIRST_SEGMENT | LAST_SEGMENT)) ===
          (FIRST_SEGMENT | LAST_SEGMENT), 'UnsupportedLayoutFlags');
      const first = seenPage[line.page] === 0;
      require(Boolean(line.flags & FIRST_PAGE) === first &&
        Boolean(line.flags & FIRST_COLUMN) === first, 'WrongLayoutFirstLineFlags');
      require(Boolean(line.flags & EMPTY) ===
        (textUnits[line.end] === textUnits[line.start]), 'WrongLayoutEmptyFlag');
      seenPage[line.page] = 1;
      ends[line.page] = y + occupied;
      segments.push({ start: line.start, ...geometry, flags: line.flags });
      cursor = line.end;
      lastEnd = line.end;
      lastHardBreak = hard === 1;
      previousPage = line.page;
      lineIndex++;
    }
    require(segments.length > 0 &&
      lastEnd === rawText.length - 1 &&
      !lastHardBreak, 'IncompleteLayoutParagraph');
    result.push({ section: p.section, headerOrdinal: p.headerOrdinal, rawText, segments });
    previousSection = p.section;
    previousOrdinal = p.headerOrdinal;
  }
  require(lineIndex === lines.length &&
    seenPage.every((seen) => seen === 1), 'IncompleteLayoutBatch');
  return {
    kind: 'hwp5-line-layout-candidate',
    version,
    pages: pageCopies,
    paragraphs: result,
    work,
  };
}
