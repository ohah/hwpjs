// 이력이나 텍스트를 소유하지 않고, 확인된 선택의 화면 반영만 기다립니다.
const pointStamp = (point) =>
  point
    ? [
        point.section,
        point.paragraph,
        point.unit,
        point.affinity,
        point.pageArea,
        point.pageOrdinal,
        point.createdCell?.identity,
        point.createdCell?.row,
        point.createdCell?.column,
      ]
    : [null];
export const historySelectionStamp = (selection) => [
  ...pointStamp(selection?.anchor),
  ...pointStamp(selection?.focus),
];
export const sameHistoryPaintStamp = (a, b) =>
  Boolean(a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index])));
export function createHistoryPaintBarrier({ isPainted, release, enqueue = queueMicrotask }) {
  let current = null,
    sequence = 0,
    scheduled = null;
  const notify = () => {
    const ticket = current;
    if (!ticket || ticket.phase !== 'paint' || scheduled === ticket) return;
    scheduled = ticket;
    enqueue(() => {
      if (scheduled === ticket) scheduled = null;
      if (current !== ticket || ticket.phase !== 'paint' || !isPainted(ticket.selection)) return;
      current = null;
      release(ticket);
    });
  };
  return {
    get pending() {
      return current !== null;
    },
    get phase() {
      return current?.phase ?? 'current';
    },
    begin() {
      current = { sequence: ++sequence, phase: 'native', selection: null };
      return current;
    },
    acknowledge(selection) {
      if (!current || current.phase !== 'native') return false;
      if (!selection?.anchor || !selection?.focus) {
        current.phase = 'unresolved';
        return false;
      }
      current.selection = structuredClone(selection);
      current.phase = 'paint';
      notify();
      return true;
    },
    notify,
    reset() {
      current = null;
      sequence++;
      scheduled = null;
    },
  };
}
