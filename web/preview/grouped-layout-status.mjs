export function updateGroupedLayoutStatus(node, layout) {
  const groups = layout.groupCoverage ?? [];
  node.hidden = groups.length === 0;
  if (!groups.length) {
    node.textContent = '';
    return;
  }
  const expected = groups.reduce((sum, group) => sum + group.expected, 0);
  const eligible = groups.reduce((sum, group) => sum + group.eligible, 0);
  const incomplete = groups.filter((group) => !group.complete);
  const errors = incomplete.flatMap((group) =>
    group.errors.map((error) => `구역 ${group.section + 1} · 노드 ${error.node}: ${error.error}`),
  );
  node.textContent = `그룹 ${groups.length}개 · 개체 배치 후보 ${eligible}/${expected} · 미완료 그룹 ${incomplete.length}개 (이미지 해독·실제 표시 성공과는 별도입니다.)${errors.length ? ' ' + errors.join(' / ') : ''}`;
}
