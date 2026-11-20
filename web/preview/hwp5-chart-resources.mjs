import { createChartDisplayResources } from './chart-display-resources.mjs';
import { hwp5ChartAnchorIndex } from './hwp5-chart-anchor.mjs';
export const hwp5ChartKey = (section, control) => `${section}:${control}`;
const sameArray = (a, b) =>
  Array.isArray(a) &&
  Array.isArray(b) &&
  a.length === b.length &&
  a.every((value, i) => value === b[i]);
const sameRecord = (a, b) =>
  a &&
  b &&
  Object.keys(a).length === Object.keys(b).length &&
  Object.keys(a).every((key) =>
    Array.isArray(a[key]) ? sameArray(a[key], b[key]) : a[key] === b[key],
  );
export function sameHwp5ChartOwner(a, b) {
  if (!a || !b) return false;
  return (
    Object.keys(a).length === Object.keys(b).length &&
    Object.keys(a).every((key) =>
      key === 'geometry'
        ? sameRecord(a.geometry, b.geometry)
        : Array.isArray(a[key])
          ? sameArray(a[key], b[key])
          : a[key] === b[key],
    )
  );
}
export function hwp5ChartDisplayMatchesTarget(value, target) {
  return (
    value?.kind === 'hwp5_chart_display' &&
    value.format === 'hwp5' &&
    value.version === 1 &&
    value.section === target?.section &&
    value.owner?.control_node === target.controlNode &&
    value.physical_id === target.resource?.physical_id &&
    sameArray(value.resource_sha256, target.resource?.resource_sha256) &&
    sameHwp5ChartOwner(value.owner, target.owner)
  );
}
/** One real Core resource reader supplies each fresh value. Epochs are observations, not edit bindings. */
export function createHwp5ChartResources({ read, current, onChange }) {
  let observed,
    targets = new Map();
  const currentTargets = () => {
    const value = current();
    if (value !== observed) {
      observed = value;
      targets = new Map();
      for (const target of value.hwp5ChartTargets ?? []) {
        const key = hwp5ChartKey(target.section, target.controlNode);
        targets.set(key, targets.has(key) ? null : target);
      }
    }
    return targets;
  };
  return createChartDisplayResources({
    read,
    onChange,
    targetOwner: (target) => target.controlNode,
    validate(value, section, control) {
      const target = currentTargets().get(hwp5ChartKey(section, control));
      return Boolean(target && !target.error_name && hwp5ChartDisplayMatchesTarget(value, target));
    },
  });
}
/** Compatible intrinsic data may paint provisionally; it never becomes a current Native value. */
export function compatibleHwp5ChartPreviewKeys(content, resources) {
  const keys = new Set();
  for (const target of content.hwp5ChartTargets ?? []) {
    if (target.error_name) continue;
    const entry = resources.get(target.section, target.controlNode),
      old = entry?.value ?? entry?.previewValue;
    if (
      !old ||
      entry.error ||
      !sameArray(old.resource_sha256, target.resource?.resource_sha256) ||
      old.physical_id !== target.resource?.physical_id
    )
      continue;
    const owner = old.owner,
      current = target.owner;
    if (
      ['control_node', 'component_node', 'ole_node', 'paragraph_node', 'ordinal'].every(
        (key) => owner[key] === current[key],
      ) &&
      owner.geometry.instance_id === current.geometry.instance_id
    )
      keys.add(hwp5ChartKey(target.section, target.controlNode));
  }
  return keys;
}
export function readHwp5ChartPaintResource(resources, target) {
  const entry = resources.status(target.section, target.controlNode);
  if (!entry) return null;
  if (entry.value) return entry;
  const preview = entry.previewValue;
  if (
    preview &&
    !entry.error &&
    sameArray(preview.resource_sha256, target.resource?.resource_sha256) &&
    preview.physical_id === target.resource?.physical_id
  )
    return { value: preview, provisional: true, error: null };
  return entry;
}

/** Current read-only membership. No edit binding is issued by a painted hit. */
export function currentHwp5ChartTarget(content, target) {
  const uint = (n) => Number.isSafeInteger(n) && n >= 0 && n <= 0xffffffff;
  if (
    content?.format !== 'hwp5' ||
    content.hwp5ChartDisplayAvailable !== true ||
    !uint(target?.section) ||
    !uint(target?.controlNode) ||
    typeof content.hwp5ChartSourceEpoch !== 'string' ||
    !Number.isSafeInteger(content.hwp5ChartHistoryRevision) ||
    content.hwp5ChartHistoryRevision < 0
  )
    return null;
  const rows = (content.hwp5ChartTargets ?? []).filter(
    (r) => r.section === target.section && r.controlNode === target.controlNode,
  );
  if (rows.length !== 1) return null;
  const row = rows[0],
    owner = row.owner;
  const paragraphs = (content.paragraphs ?? []).filter(
    (p) => p.section === row.section && p.paragraph === row.paragraph,
  );
  let displayAnchor;
  if (paragraphs.length === 1) {
    try {
      displayAnchor = hwp5ChartAnchorIndex(paragraphs[0]).get(owner?.current_unit);
    } catch {
      return null;
    }
  }
  return row.kind === 'hwp5-chart' &&
    !row.error_name &&
    !row.sourceError &&
    row.sourceEpoch === content.hwp5ChartSourceEpoch &&
    row.historyRevision === content.hwp5ChartHistoryRevision &&
    uint(row.componentNode) &&
    uint(row.oleNode) &&
    owner?.control_node === row.controlNode &&
    owner.component_node === row.componentNode &&
    owner.ole_node === row.oleNode &&
    owner.paragraph_node === row.physicalParagraphNode &&
    owner.paragraph === row.paragraph &&
    uint(owner.current_unit) &&
    displayAnchor === row.anchorUnit &&
    uint(row.anchorUnit) &&
    paragraphs.length === 1 &&
    !paragraphs[0].clipped &&
    !paragraphs[0].tableCell &&
    !paragraphs[0].drawingText &&
    !paragraphs[0].drawingCaption &&
    paragraphs[0].text?.[row.anchorUnit] === '\ufffc' &&
    !row.resource?.error_name
    ? row
    : null;
}
