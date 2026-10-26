export function hwp5WindowIdentities(projection) {
  const ordinals = new Map();
  for (const [index, section] of projection.sections.entries()) {
    if (section.index !== index) throw new Error("WindowDependencyBindingMismatch");
    for (let paragraph = 0; paragraph < section.paragraphs.length; paragraph++)
      ordinals.set(`${index}:${paragraph}`, ordinals.size);
  }
  const resolve = (section, paragraph) => {
    if (
      !Number.isSafeInteger(section) ||
      !Number.isSafeInteger(paragraph) ||
      section < 0 ||
      paragraph < 0
    )
      throw new Error("WindowDependencyBindingMismatch");
    const ordinal = ordinals.get(`${section}:${paragraph}`);
    if (ordinal === undefined) throw new Error("WindowDependencyBindingMismatch");
    return ordinal;
  };
  return { total: ordinals.size, ordinals, resolve };
}
