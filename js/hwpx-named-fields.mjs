const utf8 = new TextDecoder('utf-8', { fatal: true });
const uint = (n) => Number.isSafeInteger(n) && n >= 0 && n <= 0xffffffff;

export function decodeHwpxNamedFields(bytes) {
  const source = JSON.parse(utf8.decode(bytes));
  const invalid = () => new Error('InvalidHwpxNamedFields');
  if (
    source?.format !== 'hwpx' ||
    !['complete', 'partial'].includes(source.coverage) ||
    !Array.isArray(source.rows) ||
    !Array.isArray(source.views)
  )
    throw invalid();
  const projectionViews = source.views.map(({ section, paragraph, text }) => {
    if (!uint(section) || !uint(paragraph) || paragraph === 0 || typeof text !== 'string')
      throw invalid();
    return { section, paragraph: paragraph - 1, text };
  });
  const rows = source.rows.map(({ section, element, name, kind, protection, text, location }) => {
    if (
      !uint(section) ||
      !uint(element) ||
      (name !== null && typeof name !== 'string') ||
      typeof kind !== 'string' ||
      !['protected', 'unknown'].includes(protection) ||
      (text !== null && typeof text !== 'string')
    )
      throw invalid();
    let target = null;
    if (location !== null) {
      if (!location || !uint(location.view)) throw invalid();
      const view = projectionViews[location.view];
      const { startUnit, endUnit } = location;
      if (
        !view ||
        view.section !== section ||
        !uint(startUnit) ||
        !uint(endUnit) ||
        endUnit < startUnit ||
        endUnit > view.text.length ||
        text === null ||
        view.text.slice(startUnit, endUnit) !== text
      )
        throw invalid();
      target = {
        owner: `section:${section}:body`,
        section,
        paragraph: view.paragraph,
        startUnit,
        endUnit,
        projectionView: location.view,
      };
    }
    return {
      id: `hwpx:${section}:${element}`,
      name,
      kind,
      protection,
      value: text === null ? { status: 'unavailable' } : { status: 'available', text },
      location: target,
    };
  });
  return { format: 'hwpx', coverage: source.coverage, rows, projectionViews };
}
