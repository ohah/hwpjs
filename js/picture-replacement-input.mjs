// 기존 그림 API 이름은 공통 파일 바이트 소유 계층으로 연결합니다.
export { copyFileTransformInput as copyPictureInput } from './file-transform-input.mjs';

export const PICTURE_REPLACEMENT_LIMITS = Object.freeze({
  documentBytes: 64 * 1024 * 1024,
  imageBytes: 8 * 1024 * 1024,
  wasmBytes: 32 * 1024 * 1024,
  outputBytes: 64 * 1024 * 1024,
});
