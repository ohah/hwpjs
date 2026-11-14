import { chartDisplayMatchesOle, sameChartSourceFrame } from './chart-source-frame.mjs';
const key = (section, wrapper) => `${section}:${wrapper}`;
function owners(content) {
  const result = new Map(),
    targets = new Map(),
    paragraphs = new Map();
  for (const target of content?.chartTargets ?? []) {
    if (!target || target.error_name) continue;
    const id = key(target.section, target.wrapper);
    targets.set(id, targets.has(id) ? null : target);
  }
  for (const paragraph of content?.paragraphs ?? []) {
    if (!paragraph) continue;
    const id = key(paragraph.section, paragraph.paragraph);
    paragraphs.set(id, paragraphs.has(id) ? null : paragraph);
  }
  for (const ole of content?.oles ?? []) {
    if (
      ole?.state !== 'located' ||
      ole.error ||
      ole.sourceError ||
      ole.representation !== 'chart-alternative' ||
      ole.source?.transform_identity !== true ||
      !Number.isSafeInteger(ole.chartWrapper)
    )
      continue;
    const id = key(ole.section, ole.chartWrapper),
      target = targets.get(id),
      paragraph = paragraphs.get(key(ole.section, ole.paragraph));
    const joined =
      target &&
      paragraph &&
      !paragraph.clipped &&
      target.paragraph === ole.paragraph &&
      target.anchorUnit === ole.anchorUnit &&
      Number.isSafeInteger(ole.anchorUnit) &&
      ole.anchorUnit >= 0 &&
      paragraph.text?.[ole.anchorUnit] === '\ufffc';
    result.set(id, result.has(id) ? null : joined ? ole : null);
  }
  return result;
}

/** A temporary preview lease, not a document/data/geometry authority. */
export function compatibleChartPreviewKeys(before, after) {
  const old = owners(before),
    next = owners(after),
    result = new Set();
  for (const [id, current] of next) {
    const previous = old.get(id);
    if (
      previous &&
      current &&
      previous.oleNode === current.oleNode &&
      typeof current.source.binary_item_id === 'string' &&
      current.source.binary_item_id.length > 0 &&
      previous.source.binary_item_id === current.source.binary_item_id &&
      sameChartSourceFrame(previous.source, current.source)
    )
      result.add(id);
  }
  return result;
}

/** Only paint/layout consumes provisional values; get()/editing still sees null. */
export function createChartPreviewResourceReader(
  content,
  resources,
  { allowProvisional = true } = {},
) {
  const current = owners(content),
    projected = new WeakMap();
  return (section, wrapper) => {
    const entry = resources.status(section, wrapper);
    if (!allowProvisional || !entry || entry.value || entry.error || !entry.previewValue)
      return entry;
    const ole = current.get(key(section, wrapper));
    if (!ole || !chartDisplayMatchesOle(entry.previewValue, ole)) return entry;
    let preview = projected.get(entry);
    if (!preview) {
      preview = { ...entry, value: entry.previewValue, provisional: true };
      projected.set(entry, preview);
    }
    return preview;
  };
}
