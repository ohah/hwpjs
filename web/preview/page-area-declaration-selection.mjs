// Explicit reference-compatible policy; no claim of Hancom pagination equivalence.
const uint = (value) => Number.isSafeInteger(value) && value >= 0 && value <= 0xffffffff;
const ownerKey = (section, owner) => section + ':' + owner;
const slotKey = (section, host, apply) => section + ':' + host + ':' + apply;

export function createPageAreaDeclarationSelection(areas, binding) {
  const fail = (error) => ({ state: 'unavailable', error });
  if (!Array.isArray(areas) || binding?.state !== 'bound' || !Array.isArray(binding.declarations))
    return fail('MissingPageAreaDeclarationBinding');
  const owners = new Map(),
    timelines = new Map(),
    seen = new Set();
  for (const group of areas) {
    if (
      !group ||
      !uint(group.section) ||
      !uint(group.area?.owner_node) ||
      !uint(group.area?.list_node) ||
      !['header', 'footer'].includes(group.host) ||
      !['both', 'odd', 'even'].includes(group.area.apply)
    )
      return fail('InvalidPageAreaDeclarationGroup');
    const key = ownerKey(group.section, group.area.owner_node);
    if (owners.has(key)) return fail('AmbiguousPageAreaDeclarationGroup');
    owners.set(key, group);
  }
  for (const [sequence, declaration] of binding.declarations.entries()) {
    if (
      !declaration ||
      ![
        declaration.section,
        declaration.sourceElement,
        declaration.pageOrdinal,
        declaration.paragraph,
        declaration.unit,
      ].every(uint)
    )
      return fail('InvalidPageAreaDeclaration');
    const key = ownerKey(declaration.section, declaration.sourceElement),
      group = owners.get(key);
    if (!group || seen.has(key)) return fail('AmbiguousPageAreaDeclarationGroup');
    seen.add(key);
    const slot = slotKey(group.section, group.host, group.area.apply);
    const entries = timelines.get(slot) ?? [];
    entries.push({ page: declaration.pageOrdinal, sequence, group });
    timelines.set(slot, entries);
  }
  if (seen.size !== owners.size) return fail('MissingPageAreaDeclaration');
  for (const entries of timelines.values())
    entries.sort((a, b) => a.page - b.page || a.sequence - b.sequence);
  const latest = (section, host, apply, ordinal) => {
    const entries = timelines.get(slotKey(section, host, apply)) ?? [];
    let low = 0,
      high = entries.length;
    while (low < high) {
      const middle = low + Math.floor((high - low) / 2);
      if (entries[middle].page <= ordinal) low = middle + 1;
      else high = middle;
    }
    return entries[low - 1]?.group;
  };
  return {
    state: 'prepared',
    policy: 'rhwp-declaration-start',
    select(page) {
      if (
        !page ||
        !uint(page.section) ||
        !uint(page.ordinal) ||
        !uint(page.number) ||
        page.number < 1
      )
        return fail('InvalidPageAreaDeclarationPage');
      const selected = [];
      for (const host of ['header', 'footer']) {
        const hide =
          host === 'header'
            ? page.hideHeader || page.hideFirstHeader
            : page.hideFooter || page.hideFirstFooter;
        if (hide) continue;
        const specific = latest(page.section, host, page.number % 2 ? 'odd' : 'even', page.ordinal);
        const group = specific ?? latest(page.section, host, 'both', page.ordinal);
        if (group) selected.push(group);
      }
      return { state: 'selected', areas: selected };
    },
  };
}
