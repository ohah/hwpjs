// 앞선 DOM text intent가 끝난 뒤, history와 후속 의미 입력을 한 순서로 처리합니다.
// 좌표나 문서 스냅샷을 저장하지 않으며 적용 시점의 현재 선택을 사용합니다.
export function createHistoryInputIntentQueue({ ready, history, input, error, maxOperations = 1024, maxUnits = 16 * 1024 * 1024 }) {
  if (!Number.isSafeInteger(maxOperations) || maxOperations < 1 || !Number.isSafeInteger(maxUnits) || maxUnits < 0) throw new RangeError('InvalidOrderedInputLimit');
  let generation = 0, sequence = 0, scheduled = false, active = false, processing = false, units = 0;
  const entries = [];
  const clear = () => { generation++; entries.length = 0; active = false; units = 0; scheduled = false; };
  const drain = () => {
      if (processing || !ready()) return;
      active = false;
      if (!entries.length || entries[0].compositionPending) return;
      const entry = entries.shift(); units -= entry.data?.length ?? 0;
      const epoch = generation;
      processing = true;
      try {
        const accepted = entry.kind === 'history' ? history(entry.operation) : input(entry);
        if (epoch !== generation) return;
        if (!accepted) throw Error('OrderedInputRejected');
        active = !ready();
        if (!active) wake();
      } catch (cause) { clear(); error(cause); }
      finally { processing = false; }
  };
  const wake = () => {
    if (scheduled) return;
    scheduled = true;
    const epoch = generation;
    queueMicrotask(() => {
      if (epoch !== generation) return;
      scheduled = false;
      drain();
    });
  };
  const append = entry => {
    const size = entry.data?.length ?? 0;
    if (entries.length >= maxOperations || size > maxUnits - units) return false;
    entries.push(entry); units += size; drain(); return true;
  };
  return {
    get size() { return entries.length + Number(active); },
    get hasCapacity() { return entries.length < maxOperations; },
    history(operation) { return ['undo', 'redo'].includes(operation) && append({ kind: 'history', operation }); },
    input(inputType, data = '') { return typeof data === 'string' && data.isWellFormed() && append({ kind: 'input', inputType, data }); },
    composition() {
      const token = { generation, id: ++sequence };
      return append({ kind: 'input', inputType: 'insertText', data: '', compositionPending: true, token }) ? token : null;
    },
    completeComposition(token, data) {
      const entry = entries.find(entry => entry.token === token);
      if (!entry || token.generation !== generation || typeof data !== 'string' || !data.isWellFormed() || data.length > maxUnits - units) return false;
      entry.data = data; entry.compositionPending = false; units += data.length; wake(); return true;
    },
    wake, clear,
  };
}
