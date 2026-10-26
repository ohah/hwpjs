import { createSizeControls } from './size-controls.mjs';
export function createCellSizeControls(options) {
  return createSizeControls({
    ...options,
    identity: (cell) => `${cell.section}:${cell.listNode}`,
    label: '셀',
    capability: 'cellSizeAvailable',
    kind: 'cell-size',
    success: '셀 크기 적용 · 화면은 최소 크기 제약으로 표시되며 원본 조판은 재계산되지 않습니다.',
  });
}
