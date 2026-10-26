/** Current native identity only. Payload rendering/activation is not implied. */
export function attachHwpxOleSources(editor, content, available) {
  content.oleSourceAvailable = available === true;
  delete content.oles;
  delete content.oleSourceErrors;
  if (!content.oleSourceAvailable) return content;
  content.oles = [];
  content.oleSourceErrors = [];
  const owners = new Map(),
    sections = new Set();
  for (const p of content.paragraphs) {
    const key = `${p.section}:${p.paragraph}`,
      group = owners.get(key) ?? [];
    group.push(p);
    owners.set(key, group);
    sections.add(p.section);
  }
  for (const section of sections) {
    let sites;
    try {
      sites = editor.oleSites(section);
    } catch (error) {
      if (['OutOfMemory', 'LimitExceeded'].includes(error.message)) throw error;
      content.oleSourceErrors.push({ section, error: error.message });
      continue;
    }
    for (const site of sites) {
      const paragraph = site.paragraph === null ? null : site.paragraph - 1;
      const matches = paragraph === null ? [] : (owners.get(`${section}:${paragraph}`) ?? []);
      if (content.window && paragraph !== null && !matches.length) continue;
      const row = {
        section,
        oleNode: site.ole_node,
        paragraph,
        anchorUnit: site.anchor_unit,
        state: 'unavailable',
        error: site.error_name,
        source: null,
        sourceError: null,
        paintable: false,
        chartWrapper: site.chart_wrapper ?? null,
        representation: site.chart_wrapper == null ? 'standalone' : 'unresolved-chart-alternative',
      };
      if (
        !row.error &&
        (matches.length !== 1 ||
          matches[0].clipped ||
          typeof matches[0].text !== 'string' ||
          matches[0].text[site.anchor_unit] !== '\ufffc')
      )
        row.error = 'OleDisplayBindingMismatch';
      if (!row.error) {
        row.state = 'located';
        if (row.chartWrapper !== null) {
          const targets = (content.chartTargets ?? []).filter(
            (target) =>
              target.section === section &&
              target.wrapper === row.chartWrapper &&
              target.paragraph === paragraph &&
              target.anchorUnit === row.anchorUnit &&
              target.error_name === null,
          );
          if (targets.length === 1) row.representation = 'chart-alternative';
        }
        try {
          row.source = editor.oleSource(section, site.ole_node);
        } catch (error) {
          if (['OutOfMemory', 'LimitExceeded'].includes(error.message)) throw error;
          row.sourceError = error.message;
        }
      }
      content.oles.push(row);
    }
  }
  return content;
}
