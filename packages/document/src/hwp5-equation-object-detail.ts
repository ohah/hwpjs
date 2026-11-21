import type { ObservationSdk } from './types/document-view.ts';

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const uint = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  !Object.is(value, -0) &&
  value >= 0 &&
  value <= 0xffffffff;
const fields = [
  'equationNode',
  'controlNode',
  'paragraphNode',
  'paragraph',
  'sourceUnit',
  'currentUnit',
] as const;
function validSite(value: unknown): value is Record<(typeof fields)[number], number> {
  return (
    record(value) &&
    fields.every((key) => uint(value[key])) &&
    uint(value.controlNode) &&
    uint(value.paragraphNode) &&
    uint(value.equationNode) &&
    value.controlNode > value.paragraphNode &&
    value.equationNode > value.controlNode
  );
}
/** Read only the common script prefix. Explicit version-only layout does not
 * claim font/version/tail interpretation or try alternate layouts on error. */
export function readHwp5EquationObjectDetail(
  sdk: ObservationSdk,
  target: { section: number; node: number },
  source: unknown,
): { status: 'available'; script: string } | { status: 'unavailable'; reason: string } {
  if (
    !record(source) ||
    source.section !== target.section ||
    source.node !== target.node ||
    !uint(source.paragraph) ||
    !uint(source.anchorUnit)
  )
    throw Error('InvalidEquationObjectSource');
  const sitesQuery: unknown = Reflect.get(sdk, 'equationSites');
  const detailQuery: unknown = Reflect.get(sdk, 'equationSource');
  if (typeof sitesQuery !== 'function' || typeof detailQuery !== 'function')
    return { status: 'unavailable', reason: 'Hwp5EquationSourcesAbiUnavailable' };
  let sites: unknown, detail: unknown;
  try {
    sites = Reflect.apply(sitesQuery, sdk, [target.section]);
  } catch {
    return { status: 'unavailable', reason: 'Hwp5EquationSitesUnavailable' };
  }
  if (!Array.isArray(sites) || sites.length > 10000 || !sites.every(validSite))
    throw Error('InvalidEquationObjectSites');
  const matches = sites.filter((site) => site.equationNode === target.node);
  if (matches.length !== 1) throw Error('EquationObjectBindingMismatch');
  const site = matches[0];
  if (
    site.paragraph !== source.paragraph ||
    site.currentUnit !== source.anchorUnit ||
    sites.some(
      (row) =>
        row !== site &&
        (row.controlNode === site.controlNode ||
          (row.paragraph === site.paragraph && row.currentUnit === site.currentUnit)),
    )
  )
    throw Error('EquationObjectBindingMismatch');
  try {
    detail = Reflect.apply(detailQuery, sdk, [target.section, target.node, 'version-only']);
  } catch {
    return { status: 'unavailable', reason: 'Hwp5EquationSourceUnavailable' };
  }
  if (
    !record(detail) ||
    detail.schemaVersion !== 1 ||
    detail.layout !== 'version-only' ||
    !validSite(detail.site)
  )
    throw Error('EquationObjectBindingMismatch');
  const detailSite = detail.site;
  if (fields.some((key) => detailSite[key] !== site[key]))
    throw Error('EquationObjectBindingMismatch');
  if (
    !record(detail.decoding) ||
    detail.decoding.script !== 'exact' ||
    typeof detail.script !== 'string'
  )
    return { status: 'unavailable', reason: 'EquationScriptNotExact' };
  return { status: 'available', script: detail.script };
}
