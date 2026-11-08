import { copyFileTransformInput } from '../../../js/file-transform-input.mjs';

export type { DocumentBytes } from './types/conversion.js';

// 복사 알고리즘과 brand 검증은 파일 변환 공통 구현 한 곳이 소유한다.
export function copyDocumentBytes(
  value: unknown,
  limit: number,
  name: string,
): Uint8Array<ArrayBuffer> {
  return copyFileTransformInput(value, limit, name);
}
