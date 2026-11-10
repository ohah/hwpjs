// Admission and owned wire copy only. The runtime verifies the Native source slot.
export function currentParagraphReference(value: unknown, section: number, errorName: string) {
  const fail = (): never => {
    throw Error(errorName);
  };
  const keys = ['epoch', 'scope', 'kind', 'section', 'id', 'row', 'column'] as const;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  if (Reflect.ownKeys(value).length !== keys.length) return fail();
  const copy: Record<string, unknown> = {};
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor)) return fail();
    copy[key] = descriptor.value;
  }
  const decimal = (v: unknown, max: bigint) =>
    typeof v === 'string' && /^(0|[1-9][0-9]{0,19})$/.test(v) && BigInt(v) <= max;
  if (
    !decimal(copy.epoch, 0xffffffffffffffffn) ||
    copy.epoch === '0' ||
    typeof copy.scope !== 'string' ||
    copy.scope.length === 0 ||
    !['original', 'generated'].includes(copy.kind as string) ||
    copy.section !== section ||
    !decimal(copy.id, 0xffffffffn) ||
    (copy.kind === 'generated' && copy.id === '0') ||
    copy.row !== 0 ||
    copy.column !== 0
  )
    return fail();
  return Object.freeze(copy);
}
