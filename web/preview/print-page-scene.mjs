const MAX_PAGE_VISITS = 250000;

/** Preserve compositor order while indexing visible items by world-space paper bounds. */
export function indexPrintPageScene(pages, groups) {
  const pageScenes = pages.map(() => Object.fromEntries(groups.map(({ key }) => [key, []])));
  let visits = 0;
  for (const { key, items, bounds } of groups) {
    for (const item of items) {
      const box = bounds(item);
      if (box === null) continue;
      const { y, height } = box;
      const bottom = y + height;
      if (![y, height, bottom].every(Number.isFinite) || height < 0)
        throw Error('InvalidPrintItemBounds');
      let first = 0,
        end = pages.length;
      while (first < end) {
        const middle = (first + end) >>> 1;
        const page = pages[middle];
        if (page.y + page.height <= y) first = middle + 1;
        else end = middle;
      }
      for (let i = first; i < pages.length && pages[i].y < bottom; i++) {
        if (++visits > MAX_PAGE_VISITS) throw Error('PrintSceneVisitBudgetExceeded');
        pageScenes[i][key].push(item);
      }
    }
  }
  return { pageScenes, visits };
}
