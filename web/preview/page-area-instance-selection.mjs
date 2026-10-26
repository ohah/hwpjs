import { selectMasterPages } from './master-page-selection.mjs';

export function selectPageAreaInstances(groups, page) {
  const fail = (error) => ({ state: 'unavailable', error });
  if (
    !Array.isArray(groups) ||
    !Number.isInteger(page?.number) ||
    page.number < 1 ||
    page.number > 0xffffffff
  )
    return fail('MissingEffectivePageNumber');
  const areas = [],
    owners = new Set();
  try {
    for (const group of groups) {
      if (!['header', 'footer'].includes(group?.host)) return fail('UnsupportedPageAreaOwner');
      if (
        (group.host === 'header' && (page.hideFirstHeader || page.hideHeader)) ||
        (group.host === 'footer' && (page.hideFirstFooter || page.hideFooter))
      )
        continue;
      if (!selectMasterPages(group.area, [page]).length) continue;
      if (owners.has(group.host)) return fail('AmbiguousPageAreaOwner');
      owners.add(group.host);
      areas.push(group);
    }
    return { state: 'selected', areas };
  } catch {
    return fail('UnsupportedPageArea');
  }
}
