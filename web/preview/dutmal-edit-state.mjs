import { dutmalKind } from '../../js/hwpx-dutmal-kind.mjs';

// Drafts are transient. Only a matching native query establishes a baseline.
export function createDutmalEditState({ request, changed = () => {} }) {
  let serial = 0,
    selection = null,
    baseline = null,
    draft = '',
    pending = null,
    error = null,
    closed = false;
  const snapshot = () => ({
    selection: selection && { ...selection },
    baseline,
    draft,
    pending,
    error,
    canSubmit: !closed && selection !== null && baseline !== null && pending === null,
  });
  const publish = () => changed(snapshot());
  const query = () => {
    baseline = null;
    draft = '';
    error = null;
    const requestId = ++serial;
    pending = 'query';
    if (!request({ kind: 'dutmal-text-query', ...selection, requestId })) {
      pending = null;
      error = 'DutmalQueryUnavailable';
    }
    publish();
  };
  return {
    snapshot,
    select(value) {
      if (closed) return false;
      if (
        !value ||
        ![value.section, value.node].every(
          (number) => Number.isInteger(number) && number >= 0 && number <= 0xffffffff,
        )
      )
        throw new RangeError('InvalidDutmalSelection');
      dutmalKind(value.textKind);
      selection = { section: value.section, node: value.node, textKind: value.textKind };
      query();
      return true;
    },
    edit(value) {
      if (closed || baseline === null || pending !== null || typeof value !== 'string')
        return false;
      draft = value;
      publish();
      return true;
    },
    submit() {
      if (!snapshot().canSubmit) return false;
      if (draft === baseline) return true;
      const accepted = request({
        kind: 'dutmal-text',
        ...selection,
        value: draft,
        requestId: ++serial,
      });
      if (accepted) {
        pending = 'write';
        error = null;
        publish();
      }
      return accepted;
    },
    message(message) {
      if (closed) return false;
      if (message.kind === 'dutmal-text-query') {
        if (pending !== 'query' || message.requestId !== serial) return false;
        const identity = message.error ? message : message.dutmal;
        if (
          !identity ||
          ['section', 'node', 'textKind'].some((key) => identity[key] !== selection[key])
        )
          return false;
        if (!message.error && typeof message.dutmal.value !== 'string') return false;
        pending = null;
        error = message.error ?? null;
        if (!error) baseline = draft = message.dutmal.value;
        publish();
        return true;
      }
      if (message.kind === 'dutmal-text' && pending === 'write') {
        if (message.requestId !== serial) return false;
        if (message.error) {
          pending = null;
          error = message.error;
          publish();
          return true;
        }
        if (
          !message.dutmal ||
          ['section', 'node', 'textKind'].some((key) => message.dutmal[key] !== selection[key]) ||
          typeof message.dutmal.value !== 'string'
        )
          return false;
        pending = null;
        error = null;
        baseline = draft = message.dutmal.value;
        publish();
        return true;
      }
      if (['undo', 'redo'].includes(message.kind) && !message.error && selection) {
        query();
        return true;
      }
      return false;
    },
    reset() {
      if (closed) return;
      serial++;
      selection = null;
      baseline = null;
      draft = '';
      pending = error = null;
      publish();
    },
    close() {
      if (closed) return;
      serial++;
      selection = null;
      baseline = null;
      draft = '';
      pending = error = null;
      closed = true;
      publish();
    },
  };
}
