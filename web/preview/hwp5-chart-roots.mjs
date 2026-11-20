// Separate known chart view roots without deleting the Native source observations.
export function projectedHwp5ChartRootKeys(content) {
  const targets = new Map(),
    keys = new Set();
  const key = (section, node) => `${section}:${node}`;
  for (const target of content.hwp5ChartTargets ?? []) {
    const id = key(target.section, target.controlNode);
    targets.set(id, targets.has(id) ? null : target);
  }
  for (const root of content.hwp5Drawings ?? []) {
    const target = targets.get(key(root.section, root.controlNode));
    if (
      !target ||
      target.error_name ||
      !target.frame ||
      root.source?.kind_id !== 0x246f6c65 ||
      root.componentNode !== target.componentNode ||
      root.hostParagraph !== target.paragraph ||
      root.anchorUnit !== target.anchorUnit
    )
      continue;
    const expected = target.owner.geometry,
      actual = root.source;
    if (
      Object.keys(expected).every((field) =>
        Array.isArray(expected[field])
          ? Array.isArray(actual[field]) &&
            actual[field].length === expected[field].length &&
            expected[field].every((v, i) => v === actual[field][i])
          : expected[field] === actual[field],
      )
    )
      keys.add(key(root.section, root.controlNode));
  }
  return keys;
}
