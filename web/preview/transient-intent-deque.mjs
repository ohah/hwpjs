// 보류 요소만 소유하며 소모 슬롯은 즉시 참조를 해제합니다.
export function createTransientIntentDeque() {
  let slots = [],
    head = 0;
  return {
    get length() {
      return slots.length - head;
    },
    front() {
      return slots[head];
    },
    push(value) {
      slots.push(value);
    },
    shift() {
      if (head === slots.length) return undefined;
      const value = slots[head];
      slots[head++] = undefined;
      if (head === slots.length) {
        slots = [];
        head = 0;
      } else if (head >= slots.length - head) {
        slots = slots.slice(head);
        head = 0;
      }
      return value;
    },
    clear() {
      slots = [];
      head = 0;
    },
  };
}
