import { createTransientIntentDeque } from './transient-intent-deque.mjs';
// 순서와 Native 호출 개수는 보존하고, head 종류별 준비와 task yield만 판정합니다.
export function createHistoryInputIntentQueue({
  ready,
  nativeReady,
  readyForKind,
  history,
  input,
  error,
  maxOperations = 1024,
  maxUnits = 16 * 1024 * 1024,
  maxOperationsPerYield = nativeReady === undefined && readyForKind === undefined
    ? Number.MAX_SAFE_INTEGER
    : 16,
  yieldTask = (resume) => setTimeout(resume, 0),
}) {
  if (
    !Number.isSafeInteger(maxOperations) ||
    maxOperations < 1 ||
    !Number.isSafeInteger(maxUnits) ||
    maxUnits < 0 ||
    !Number.isSafeInteger(maxOperationsPerYield) ||
    maxOperationsPerYield < 1
  )
    throw new RangeError('InvalidOrderedInputLimit');
  if (
    (nativeReady !== undefined && typeof nativeReady !== 'function') ||
    (readyForKind !== undefined && typeof readyForKind !== 'function')
  )
    throw new TypeError('InvalidOrderedInputReadiness');
  if (typeof yieldTask !== 'function') throw new TypeError('InvalidOrderedInputYield');
  let generation = 0,
    sequence = 0,
    scheduled = false,
    active = false,
    processing = false,
    units = 0,
    operations = 0,
    yieldTicket = null;
  const entries = createTransientIntentDeque();
  const compositions = new Map();
  const nativeSettled = () => (nativeReady ? nativeReady() === true : Boolean(ready()));
  const canRun = (entry) => {
    if (!entry || entry.compositionPending) return false;
    const strict = Boolean(ready());
    if (nativeReady && nativeReady() !== true) return false;
    const decision = readyForKind?.(entry.kind);
    if (decision === undefined) return strict;
    if (decision !== true) return false;
    // 모델 준비를 별도로 확인하지 않고 Native busy를 우회할 수 없습니다.
    return entry.kind === 'history' ? strict || nativeReady !== undefined : strict;
  };
  const clear = () => {
    generation++;
    entries.clear();
    compositions.clear();
    active = false;
    units = 0;
    scheduled = false;
    operations = 0;
    yieldTicket = null;
  };
  const requestYield = () => {
    if (yieldTicket) return;
    const ticket = { generation };
    yieldTicket = ticket;
    let installing = true,
      calledInline = false;
    try {
      yieldTask(() => {
        if (installing) {
          calledInline = true;
          return;
        }
        if (yieldTicket !== ticket || ticket.generation !== generation) return;
        yieldTicket = null;
        operations = 0;
        drain();
      });
      installing = false;
      if (calledInline) throw Error('InvalidOrderedInputYield');
    } catch (cause) {
      installing = false;
      if (yieldTicket === ticket) {
        clear();
        error(cause);
      }
    }
  };
  const drain = () => {
    if (processing || yieldTicket) return;
    if (active && nativeSettled()) active = false;
    const entry = entries.front();
    if (!entry || entry.compositionPending) return;
    if (operations >= maxOperationsPerYield) {
      requestYield();
      return;
    }
    const epoch = generation;
    if (!canRun(entry) || epoch !== generation || entries.front() !== entry) return;
    entries.shift();
    active = false;
    if (entry.token) compositions.delete(entry.token);
    units -= entry.data?.length ?? 0;
    processing = true;
    try {
      const accepted = entry.kind === 'history' ? history(entry.operation) : input(entry);
      if (epoch !== generation) return;
      if (!accepted) throw Error('OrderedInputRejected');
      operations++;
      // 새 옵션에서 active는 Native 대기만, paint 대기는 외부 barrier가 계속 소유합니다.
      active = !nativeSettled();
      if (canRun(entries.front())) wake();
    } catch (cause) {
      clear();
      error(cause);
    } finally {
      processing = false;
    }
  };
  const wake = () => {
    if (scheduled || yieldTicket) return;
    scheduled = true;
    const epoch = generation;
    queueMicrotask(() => {
      if (epoch !== generation) return;
      scheduled = false;
      drain();
    });
  };
  const append = (entry) => {
    const size = entry.data?.length ?? 0;
    if (entries.length >= maxOperations || size > maxUnits - units) return false;
    entries.push(entry);
    if (entry.token) compositions.set(entry.token, entry);
    units += size;
    drain();
    return true;
  };
  return {
    get size() {
      return entries.length + Number(active);
    },
    get hasCapacity() {
      return entries.length < maxOperations;
    },
    history(operation) {
      return ['undo', 'redo'].includes(operation) && append({ kind: 'history', operation });
    },
    input(inputType, data = '') {
      return (
        typeof data === 'string' &&
        data.isWellFormed() &&
        append({ kind: 'input', inputType, data })
      );
    },
    composition() {
      const token = { generation, id: ++sequence };
      return append({
        kind: 'input',
        inputType: 'insertText',
        data: '',
        compositionPending: true,
        token,
      })
        ? token
        : null;
    },
    completeComposition(token, data) {
      const entry = compositions.get(token);
      if (
        !entry ||
        token.generation !== generation ||
        typeof data !== 'string' ||
        !data.isWellFormed() ||
        data.length > maxUnits - units
      )
        return false;
      entry.data = data;
      entry.compositionPending = false;
      units += data.length;
      wake();
      return true;
    },
    wake,
    clear,
  };
}
