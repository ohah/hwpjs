// 진행 중인 읽기/해독 슬롯입니다. 문서 전환으로 실행 중인 작업을 없는 것으로 세지 않습니다.
export function createPictureResourceSlots(limit) {
  let active = 0;
  const waiters = new Set();
  const wake = () => {
    for (const resolve of waiters) resolve();
    waiters.clear();
  };
  return {
    take() {
      if (active >= limit) return false;
      active++;
      return true;
    },
    changed() {
      return new Promise((resolve) => waiters.add(resolve));
    },
    release() {
      if (active < 1) throw new Error('UnbalancedPictureResourceSlot');
      active--;
      wake();
    },
    wake,
    stats() {
      return { active, waiting: waiters.size, limit };
    },
  };
}
