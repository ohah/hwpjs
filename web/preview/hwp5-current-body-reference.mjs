// Only reference-bearing requests use this admission path. Legacy ordinal callers remain explicit.
// Query and mutation run synchronously on the same Native editor session.
export function validateHwp5CurrentBodyReference(editor, message, referenceError, ownerError) {
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
    const window = editor.currentSourceReferences(message.section, {
      first: message.paragraph,
      count: 1,
    });
    const actual = window.references?.[0];
    if (
      window.version !== 1 ||
      window.first !== message.paragraph ||
      window.total <= message.paragraph ||
      window.references.length !== 1 ||
      !actual ||
      keys.some((key) => values[key] !== actual[key])
    )
      fail();
    // Original references also exist in nested cells/notes; identity alone is not ownership.
    const flow = editor.paragraphFlow(message.section);
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
