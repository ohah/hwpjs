import { formatNumber } from './number-format.mjs';
import { observedMarkerPlacement } from './paragraph-marker.mjs';
import { paragraphSelectionOwner } from './paragraph-selection.mjs';

const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
const positive = (value) => uint(value) && value > 0;
const keyOf = (p) => `${p.section}:${p.paragraph}`;
const kinds = ['none', 'outline', 'number', 'bullet'];
const maxParagraphs = 20000;

function headingOf(format, paragraph) {
  const shape = paragraph.paragraphShape;
  if (format === 'hwpx') return shape?.heading;
  if (!uint(shape?.headingKind)) return null;
  return { kind: kinds[shape.headingKind], id: shape.headingId, level: shape.headingLevel };
}

function definitionsFor(format, raw) {
  const definitions = new Map();
  if (!Array.isArray(raw) || raw.length > 4096) return null;
  for (const entry of raw) {
    if (
      !uint(entry?.id) ||
      definitions.has(entry.id) ||
      !(entry.start === null || uint(entry.start)) ||
      !Array.isArray(entry.levels) ||
      entry.levels.length > 10
    )
      return null;
    const levels = [];
    for (const [i, level] of entry.levels.entries()) {
      const ordinal = format === 'hwp5' ? i : level?.level - 1;
      if (
        !uint(ordinal) ||
        ordinal > 9 ||
        levels[ordinal] ||
        !level ||
        !(level.start === null || uint(level.start)) ||
        !(
          level.template === null ||
          (typeof level.template === 'string' && level.template.length <= 512)
        )
      )
        return null;
      // HWP5 Table 40 locates the layout bits. Limit binary rendering to
      // Table 41's zero format code (decimal).
      let numberFormat = null;
      if (format === 'hwp5') {
        if (uint(level.attributes) && level.attributes <= 0x1f) numberFormat = 'DIGIT';
      } else if (typeof level.format === 'string') numberFormat = level.format;
      levels[ordinal] = {
        start: level.start,
        format: numberFormat,
        template: level.template,
        markerPlacement: observedMarkerPlacement(format, level.placement),
      };
    }
    definitions.set(entry.id, { start: entry.start, levels });
  }
  return definitions;
}

function sectionEvidence(content, source) {
  if (content.format === 'hwpx') return source?.sections;
  if (
    !Array.isArray(content.sectionSources) ||
    !Array.isArray(content.pageControlSources) ||
    !Array.isArray(content.pageControlSourceErrors) ||
    content.pageControlSourceErrors.length ||
    content.sectionSourceErrors?.length
  )
    return null;
  const unknownRestarts = new Set(
    content.pageControlSources
      .filter(
        (control) =>
          control.kind === 'restart' &&
          (!uint(control.attributes) || control.attributes > 5 || control.extra_nonzero),
      )
      .map((control) => control.section),
  );
  return content.sectionSources.map((row) => ({
    section: row.section,
    outline: row.numbering_id,
    controls_complete: !unknownRestarts.has(row.section),
  }));
}

function seed(definition, depth) {
  const start = definition.levels[depth]?.start;
  const overall = depth === 0 ? definition.start : null;
  if (positive(start) && positive(overall) && start !== overall) return null;
  return positive(start) ? start : positive(overall) ? overall : null;
}

function displayLabel(format, definition, counters, depth) {
  const template = definition.levels[depth]?.template;
  if (typeof template !== 'string' || template.length === 0) return null;
  let consumed = false;
  let text = '';
  for (let i = 0; i < template.length; i++) {
    const unit = template.charCodeAt(i);
    if (unit <= 0x1f || (unit >= 0x7f && unit <= 0x9f)) return null;
    if (template[i] !== '^') {
      text += template[i];
      continue;
    }
    consumed = true;
    const token = template[++i];
    if (format === 'hwp5' && (token === 'n' || token === 'N')) {
      const path = counters.slice(0, depth + 1);
      if (!path.every(positive) || path.some((_, j) => definition.levels[j]?.format !== 'DIGIT'))
        return null;
      text += path.join('.') + (token === 'N' ? '.' : '');
      continue;
    }
    if (!token || !/^[1-9]$/.test(token) || /\d/.test(template[i + 1] ?? '')) return null;
    const referenced = Number(token) - 1;
    const value = counters[referenced];
    const kind = definition.levels[referenced]?.format;
    if (
      referenced > depth ||
      !positive(value) ||
      (referenced !== depth && kind !== definition.levels[depth]?.format) ||
      (value > 26 && ['LATIN_CAPITAL', 'LATIN_SMALL'].includes(kind))
    )
      return null;
    const formatted = formatNumber(value, kind);
    if (formatted === null) return null;
    text += formatted;
  }
  return consumed ? text : null;
}

function advance(stream, depth, definition) {
  const { counters } = stream;
  if (counters.length > depth + 1) counters.length = depth + 1;
  if (depth > counters.length || !counters.slice(0, depth).every(positive)) return false;
  const current = counters[depth];
  if (current === null) return false;
  counters[depth] =
    current === undefined ? seed(definition, depth) : positive(current + 1) ? current + 1 : null;
  return positive(counters[depth]);
}

export function paragraphNumberingLabels(content, source) {
  const labels = new Map();
  const { format, paragraphs } = content;
  if (
    !['hwp5', 'hwpx'].includes(format) ||
    !Array.isArray(paragraphs) ||
    paragraphs.length > maxParagraphs ||
    paragraphs.length !== content.totalParagraphs ||
    content.window ||
    content.limited ||
    content.viewKind
  )
    return labels;
  const raw = format === 'hwp5' ? source : source?.definitions;
  const definitions = definitionsFor(format, raw);
  const sections = sectionEvidence(content, source);
  const flows = format === 'hwp5' ? content.currentParagraphFlows : content.paragraphFlows;
  if (
    !definitions ||
    !Array.isArray(sections) ||
    sections.some((section, i) => section.section !== i) ||
    !Array.isArray(flows) ||
    flows.length !== paragraphs.length ||
    content.paragraphFlowErrors?.length ||
    content.flowSourceErrors?.length
  )
    return labels;
  const owners = new Map(flows.map((row) => [keyOf(row), row.host]));
  if (owners.size !== paragraphs.length) return labels;
  const streams = {
    number: { id: undefined, section: undefined, blocked: false, counters: [] },
    outline: { id: undefined, blocked: false, counters: [] },
  };
  let priorSection = 0;
  let priorParagraph = -1;
  for (const [index, paragraph] of paragraphs.entries()) {
    const key = keyOf(paragraph);
    const { section, paragraph: ordinal } = paragraph;
    const expected = format === 'hwpx' ? index : section === priorSection ? priorParagraph + 1 : 0;
    if (
      !uint(section) ||
      ordinal !== expected ||
      !owners.has(key) ||
      section < priorSection ||
      section > priorSection + 1
    )
      return new Map();
    priorSection = section;
    priorParagraph = ordinal;
    const sectionSource = sections[section];
    if (sectionSource?.controls_complete !== true) {
      streams.number.blocked = streams.outline.blocked = true;
      continue;
    }
    const heading = headingOf(format, paragraph);
    if (paragraph.clipped || !kinds.includes(heading?.kind)) {
      streams.number.blocked = streams.outline.blocked = true;
      continue;
    }
    // A definition ID identifies the format, not a restart decision
    // after a gap in an ordinary numbered list.
    if (heading.kind !== 'number' && streams.number.id !== undefined && owners.get(key) === 'body')
      streams.number.blocked = true;
    if (heading.kind === 'none' || heading.kind === 'bullet') continue;
    const stream = streams[heading.kind];
    if (stream.blocked) continue;
    const outline = heading.kind === 'outline';
    const id = outline && heading.id === 0 ? sectionSource.outline : heading.id;
    const definition = definitions.get(id);
    if (
      owners.get(key) !== 'body' ||
      paragraphSelectionOwner(paragraph) !== `section:${section}:body` ||
      !uint(id) ||
      (outline && (heading.id !== 0 || id === 0)) ||
      !definition ||
      (stream.id !== undefined && stream.id !== id) ||
      (!outline &&
        (stream.section === undefined ? !positive(definition.start) : stream.section !== section))
    ) {
      stream.blocked = true;
      continue;
    }
    stream.id = id;
    if (!outline) stream.section = section;
    const depth = heading.level;
    if (!uint(depth) || depth > 9) {
      stream.blocked = true;
      continue;
    }
    if (!advance(stream, depth, definition)) continue;
    const text = displayLabel(format, definition, stream.counters, depth);
    if (text === null) continue;
    const markerPlacement = definition.levels[depth]?.markerPlacement;
    labels.set(key, {
      kind: heading.kind,
      text,
      ...(markerPlacement
        ? {
            markerPlacement,
            widthText: markerPlacement.useInstanceWidth
              ? text
              : displayLabel(
                  format,
                  definition,
                  stream.counters.map(() => 1),
                  depth,
                ),
          }
        : {}),
    });
  }
  return labels;
}

export function attachParagraphNumbering(editor, content) {
  const query = editor?.paragraphNumberingSource;
  if (
    typeof query !== 'function' ||
    content.window ||
    content.viewKind ||
    content.limited ||
    !content.paragraphs?.some((p) =>
      ['number', 'outline'].includes(headingOf(content.format, p)?.kind),
    )
  )
    return content;
  try {
    const labels = paragraphNumberingLabels(content, query.call(editor));
    for (const paragraph of content.paragraphs) {
      const label = labels.get(keyOf(paragraph));
      if (label) paragraph.numberingLabel = label;
    }
  } catch {
    // The optional source must not make the existing editor unreadable.
  }
  return content;
}
