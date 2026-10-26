import { createSizeControls } from './size-controls.mjs';
export function createPictureSizeControls(options) {
  return createSizeControls({
    ...options,
    identity: (picture) => `${picture.section}:${picture.pictureNode}`,
    minimum: 1,
    label: '그림',
    capability: 'pictureResizeAvailable',
    kind: 'picture-resize',
    success: '그림 크기를 적용했습니다. 원본 한글 조판과의 일치는 별도 검증이 필요합니다.',
  });
}
