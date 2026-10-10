// 배치 후보 수입니다. 비트맵 디코딩·실제 표시 성공 수가 아닙니다.
export function pictureLayoutCoverage(content, inlineIndex, layers, resourceAt = () => null) {
  const keys = new Set();
  for (const item of inlineIndex.values()) if (item) keys.add(`${item.picture.section}:${item.picture.pictureNode}`);
  for (const item of [...layers.behind, ...layers.front]) keys.add(`${item.picture.section}:${item.picture.pictureNode}`);
  const source = new Set((content.pictures ?? []).map(picture => `${picture.section}:${picture.pictureNode}`));
  const eligible = [...source].filter(key => keys.has(key)).length;
  let decoded = 0, failed = 0, loading = 0;
  const uniquePictures = new Map((content.pictures ?? []).map(picture => [`${picture.section}:${picture.pictureNode}`, picture]));
  for (const [key, picture] of uniquePictures) {
    if (!keys.has(key)) continue;
    const resource = resourceAt(picture.section, picture.pictureNode);
    if (resource?.bitmap) decoded++;
    else if (resource?.error) failed++;
    else loading++;
  }
  return { total: source.size, eligible, pending: source.size - eligible, decoded, failed, loading };
}
