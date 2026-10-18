// Query-local grouping of native ownership rows, not another document model.
const key = row => JSON.stringify([row.host, row.parent_node, row.list_node]);
export function linkHwp5UnresolvedFieldOwners(section, flows, markers, resolve, link) {
  if (markers.length === 0) return;
  const groups = new Map(), linked = new Set();
  for (const row of flows) {
    const owner = key(row);
    if (!groups.has(owner)) groups.set(owner, []);
    groups.get(owner).push(row.paragraph);
  }
  for (const marker of markers) {
    const anchor = resolve(section.index, marker.position.paragraph), owner = flows[marker.position.paragraph];
    const units = section.paragraphs[marker.position.paragraph].declaredUnits;
    if (!Number.isSafeInteger(units) || units < 0 || owner.list_node !== marker.list_node || marker.position.unit > units) throw new Error("WindowDependencyBindingMismatch");
    const identity = key(owner);
    if (linked.has(identity)) continue;
    linked.add(identity);
    // Preserve the whole uncertain scope, never fabricate a field end.
    for (const paragraph of groups.get(identity)) {
      const member = resolve(section.index, paragraph);
      link(member, anchor); link(anchor, member);
    }
  }
}
