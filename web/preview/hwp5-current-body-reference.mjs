// Only reference-bearing requests use this admission path. Legacy ordinal callers remain explicit.
// Query and mutation run synchronously on the same Native editor session.
export function validateHwp5CurrentBodyReference(
  editor,
  message,
  referenceError,
  ownerError,
  sections,
) {
  if (Object.hasOwn(message, 'reference')) {
    const ref = message.reference;
    const keys = ['epoch', 'scope', 'kind', 'section', 'id', 'row', 'column'];
    const fail = () => {
      throw new Error(referenceError);
    };
    if (
      !ref ||
      typeof ref !== 'object' ||
      Array.isArray(ref) ||
      Reflect.ownKeys(ref).length !== keys.length
    )
      fail();
    const values = {};
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(ref, key);
      if (!descriptor || !('value' in descriptor)) fail();
      values[key] = descriptor.value;
    }
    if (
      !['original', 'generated'].includes(values.kind) ||
      values.section !== message.section ||
      values.row !== 0 ||
      values.column !== 0 ||
      !Number.isInteger(message.paragraph) ||
      message.paragraph < 0 ||
      message.paragraph > 0xffffffff
    )
      fail();
    if (!editor.supportsCurrentSourceReferences?.())
      throw new Error('Hwp5CurrentSourceReferenceAbiUnavailable');
    // Optional query-local storage only. G01 single-command callers keep their
    // exact one-slot read. Atomic batches share bounded windows and one flow per section.
    let section = sections?.get(message.section);
    if (sections && !section) {
      section = { windows: new Map() };
      sections.set(message.section, section);
    }
    const first = sections ? Math.floor(message.paragraph / 1024) * 1024 : message.paragraph;
    let window = section?.windows.get(first);
    if (!window) {
      window = editor.currentSourceReferences(message.section, {
        first,
        count: sections ? 1024 : 1,
      });
      section?.windows.set(first, window);
    }
    const actual = window.references?.[message.paragraph - first];
    if (
      window.version !== 1 ||
      window.first !== first ||
      window.total <= message.paragraph ||
      !Array.isArray(window.references) ||
      window.references.length !== Math.min(sections ? 1024 : 1, window.total - first) ||
      !actual ||
      keys.some((key) => values[key] !== actual[key])
    )
      fail();
    // Original references also exist in nested cells/notes; identity alone is not ownership.
    const flow = section?.flow ?? editor.paragraphFlow(message.section);
    if (section) section.flow = flow;
    const host = flow[message.paragraph];
    if (
      flow.length !== window.total ||
      host?.paragraph !== message.paragraph ||
      host.host !== 'body' ||
      host.top_level !== true
    )
      throw new Error(ownerError);
  }
}
