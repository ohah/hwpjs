import { formatNumber } from './number-format.mjs';
import { placePageNumberGlyph } from './page-number-glyphs.mjs';
import { hwpUnitPixels } from './hwp-units.mjs';

const positions = [
  'NONE',
  'TOP_LEFT',
  'TOP_CENTER',
  'TOP_RIGHT',
  'BOTTOM_LEFT',
  'BOTTOM_CENTER',
  'BOTTOM_RIGHT',
  'OUTSIDE_TOP',
  'OUTSIDE_BOTTOM',
  'INSIDE_TOP',
  'INSIDE_BOTTOM',
];
const key = (section, value) => `${section}:${value}`;

/** Bind source declarations to the completed physical scene, including otherwise empty pages. */
export function attachHwpxPageNumbers(content, layout, measure) {
  const source = content.hwpxPageNumberSource;
  if (source === null) return { ...layout, pageNumberSourceUnavailable: true };
  if (!source) return layout;
  const fail = (error) => ({ ...layout, pageNumberError: error });
  if (source.error) return fail(source.error);
  if (
    !source.sections.some(
      (section) =>
        section.position ||
        section.controls.length ||
        section.startPage ||
        section.hideFirst ||
        section.parity !== 'BOTH',
    )
  )
    return layout;
  if (content.window || content.limited || layout.state !== 'paginated' || layout.limited)
    return fail('IncompleteHwpxPageNumberScene');
  const sections = new Map(source.sections.map((row) => [row.section, row]));
  const settings = new Map(content.pageSettings.map((row) => [row.section_ordinal, row]));
  const paragraphs = new Map(
    content.paragraphs.map((row) => [key(row.section, row.paragraph), row]),
  );
  const owners = new Map();
  const flowOwners = new Map();
  for (const flow of content.paragraphFlows ?? []) {
    if (flow.top_level !== true || flow.host !== 'body') continue;
    const id = key(flow.section, flow.source_node);
    const paragraphKey = key(flow.section, flow.paragraph);
    flowOwners.set(paragraphKey, flow.source_node);
    owners.set(id, owners.has(id) ? null : paragraphs.get(paragraphKey));
  }
  const ownerFor = (section, control) => {
    if (control.paragraph == null) return owners.get(key(section, control.sourceNode));
    const id = key(section, control.paragraph);
    return flowOwners.get(id) === control.sourceNode ? paragraphs.get(id) : null;
  };
  const spans = new Map();
  for (const row of layout.rows) {
    if (row.kind !== 'text' || !Number.isInteger(row.pageOrdinal) || row.pageArea) continue;
    const id = key(row.section, row.paragraph);
    const span = spans.get(id);
    if (!span) spans.set(id, { first: row.pageOrdinal, last: row.pageOrdinal });
    else {
      span.first = Math.min(span.first, row.pageOrdinal);
      span.last = Math.max(span.last, row.pageOrdinal);
    }
  }
  const controlsByPage = new Map();
  for (const section of source.sections) {
    if (section.parity !== 'BOTH') return fail('UnsupportedHwpxSectionPageParity');
    for (const control of section.controls) {
      const owner = ownerFor(section.section, control);
      const span = owner && spans.get(key(owner.section, owner.paragraph));
      if (!span || span.first !== span.last || !layout.pages[span.first])
        return fail('AmbiguousHwpxPageControlPage');
      const pageControls = controlsByPage.get(span.first) ?? {};
      pageControls[control.kind] = control.value;
      controlsByPage.set(span.first, pageControls);
    }
  }
  let active = null,
    activeOwner,
    position = 0;
  let counter = source.initialPage,
    previousSection;
  const pages = [],
    glyphs = [],
    seenSections = new Set();
  const onlySection = sections.size === 1 ? source.sections[0].section : undefined;
  for (const [ordinal, paperPage] of layout.pages.entries()) {
    const section = paperPage.section ?? onlySection;
    const declaration = sections.get(section);
    const margin = settings.get(section)?.margin;
    if (!declaration || !margin || paperPage.ordinal !== ordinal)
      return fail('MissingHwpxPageNumberSection');
    const first = section !== previousSection;
    if (first) {
      if (seenSections.has(section)) return fail('DisorderedHwpxPageNumberSections');
      seenSections.add(section);
      previousSection = section;
      if (declaration.startPage) counter = declaration.startPage;
      if (declaration.position) {
        active = declaration.position;
        position = positions.indexOf(active.position);
        activeOwner = ownerFor(section, active);
        if (position < 0 || !activeOwner) return fail('UnsupportedHwpxPageNumberPosition');
      }
    }
    const { restart, hide } = controlsByPage.get(ordinal) ?? {};
    if (restart !== undefined) counter = restart;
    if (counter > 0xffffffff) return fail('HwpxPageNumberOverflow');
    const hidden = Boolean(hide || (first && declaration.hideFirst));
    const page = { ...paperPage, section, number: counter++, hidePageNumber: hidden };
    pages.push(page);
    if (!position || hidden) continue;
    const formatted = formatNumber(page.number, active.format);
    if (formatted === null) return fail('UnsupportedHwpxPageNumberFormatRange');
    const text = active.sideChar ? `${active.sideChar} ${formatted} ${active.sideChar}` : formatted;
    const styleOwner =
      source.charShapeId === null
        ? activeOwner
        : {
            section: activeOwner.section,
            paragraph: activeOwner.paragraph,
            text,
            characterRanges: [{ start: 0, end: text.length, charShapeId: source.charShapeId }],
          };
    const { x, width } = page.page;
    const header = {
      x,
      width,
      y: page.paper.y + hwpUnitPixels(margin.top),
      height: hwpUnitPixels(margin.header),
    };
    const footer = {
      x,
      width,
      y: page.paper.y + page.paper.height - hwpUnitPixels(margin.bottom + margin.footer),
      height: hwpUnitPixels(margin.footer),
    };
    const result = placePageNumberGlyph(
      { ...page, header, footer },
      position,
      text,
      styleOwner,
      0,
      measure,
    );
    if (result.state !== 'placed') return fail(result.error);
    glyphs.push({ ...result.glyph, styleOwner });
  }
  if (seenSections.size !== sections.size) return fail('MissingHwpxPageNumberSection');
  return { ...layout, pages, pageNumberGlyphs: glyphs };
}
