// 한 번의 동기 배치 동안 allocation의 추가와 합계만 소유합니다.
// ownedHeights는 내부 plain/mixed adapter의 외부 미노출 fragment에만 사용합니다.
export function createFootnoteAllocationIndex(overhead, policy, ownedHeights = false) {
  const pages = new Map();
  return {
    fragments(ordinal) {
      return pages.get(ordinal)?.fragments ?? [];
    },
    append(ordinal, fragment) {
      let entry = pages.get(ordinal);
      if (!entry) {
        entry = { fragments: [], sum: 0 };
        pages.set(ordinal, entry);
      }
      entry.fragments.push(fragment);
      // reduce의 초기값 0과 append 순서를 유지하며 overhead와 간격을 합치지 않습니다.
      if (ownedHeights) entry.sum = entry.sum + fragment.height;
    },
    reserved(ordinal) {
      const entry = pages.get(ordinal);
      if (!entry?.fragments.length) return 0;
      const sum = ownedHeights
        ? entry.sum
        : entry.fragments.reduce((n, fragment) => n + fragment.height, 0);
      return overhead + sum + policy.betweenNotes * (entry.fragments.length - 1);
    },
    keys() {
      return pages.keys();
    },
  };
}
