// An observed raw profile for partial preview, not an interpretation of the word.
export function hasObservedZeroTableObjectTail(source) {
  return (
    source?.object_extra_bytes === 2 &&
    Object.hasOwn(source, 'object_extra_u16') &&
    source.object_extra_u16 === 0
  );
}
