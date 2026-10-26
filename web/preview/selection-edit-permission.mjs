// Selection-scoped native permission; never grants whole-paragraph editing.
function same(a, b) {
  return Boolean(
    a && b && ['section', 'paragraph', 'startUnit', 'endUnit'].every((key) => a[key] === b[key]),
  );
}

function validate(range) {
  if (
    !range ||
    !['section', 'paragraph', 'startUnit', 'endUnit'].every(
      (key) => Number.isInteger(range[key]) && range[key] >= 0 && range[key] <= 0xffffffff,
    ) ||
    range.endUnit < range.startUnit
  )
    throw new TypeError('InvalidEditPermissionRange');
}

export function createSelectionEditPermission({ kind = 'query-edit-range' } = {}) {
  if (!['query-edit-range', 'query-split-range'].includes(kind))
    throw new TypeError('InvalidEditPermissionKind');
  let sequence = 0,
    current = null;
  return {
    request(range) {
      validate(range);
      if (same(current, range)) return null;
      if (sequence === Number.MAX_SAFE_INTEGER) throw new Error('EditPermissionSequenceExhausted');
      current = { ...range, requestId: ++sequence, allowed: null };
      return {
        kind,
        section: range.section,
        paragraph: range.paragraph,
        startUnit: range.startUnit,
        endUnit: range.endUnit,
        requestId: current.requestId,
      };
    },
    accept(message) {
      if (
        !current ||
        current.allowed !== null ||
        message?.kind !== kind ||
        message.requestId !== current.requestId ||
        !same(message, current) ||
        typeof message.allowed !== 'boolean' ||
        message.error
      )
        return false;
      current.allowed = message.allowed;
      return true;
    },
    allowed(range) {
      return same(current, range) && current.allowed === true;
    },
    pending(range) {
      return same(current, range) && current.allowed === null;
    },
    reject(message) {
      if (
        !current ||
        current.allowed !== null ||
        message?.kind !== kind ||
        message.requestId !== current.requestId ||
        !same(message, current) ||
        typeof message.error !== 'string' ||
        !message.error
      )
        return false;
      current.allowed = false;
      return true;
    },
    invalidate() {
      current = null;
    },
  };
}
