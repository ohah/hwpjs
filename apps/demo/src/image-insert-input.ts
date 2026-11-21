import { pictureUnits, pictureSize, type PictureSizeDraft } from './object-properties-input.ts';
// @ts-ignore Existing shared byte ownership and bounded-copy boundary.
import { copyPictureInput } from '../../../js/picture-replacement-input.mjs';
// @ts-ignore Canonical HWPUNIT conversion shared with picture layout.
import { hwpUnitPixels } from '../../../web/preview/hwp-units.mjs';
// @ts-ignore Existing bitmap decoder; accepted PNG/JPEG never take its PCX path.
import { createPictureBitmapDecoder } from '../../../web/preview/picture-bitmap-decoder.mjs';
export const imageInsertLimit = 8 * 1024 * 1024;
export const imageInsertDimensionMaximum = 0x7fffffff;
export function checkedInsertImageBytes(input: Uint8Array): Uint8Array {
  const bytes = copyPictureInput(input, imageInsertLimit, 'Image') as Uint8Array;
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v);
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (!png && !jpeg) throw Error('UnsupportedInsertImageFormat');
  return bytes;
}
export function fittedInsertImageSize(width: number, height: number) {
  if (![width, height].every((n) => Number.isSafeInteger(n) && n > 0))
    throw Error('InvalidDecodedImageSize');
  const natural = { width: width / hwpUnitPixels(1), height: height / hwpUnitPixels(1) };
  const cap = pictureUnits('150'),
    scale = Math.min(1, cap / natural.width, cap / natural.height);
  const result = {
    width: Math.max(1, Math.round(natural.width * scale)),
    height: Math.max(1, Math.round(natural.height * scale)),
  };
  return checkedInsertImageSize(result);
}
export function checkedInsertImageSize(size: { width: number; height: number }) {
  if (
    ![size.width, size.height].every(
      (n) => Number.isSafeInteger(n) && n >= 1 && n <= imageInsertDimensionMaximum,
    )
  )
    throw Error('InvalidPictureInsertionSize');
  return size;
}
export function insertImageSize(
  draft: PictureSizeDraft,
  original: { width: number; height: number },
) {
  return checkedInsertImageSize(pictureSize(draft, original));
}
export async function decodeInsertImageSize(
  bytes: Uint8Array,
  bitmap?: (value: Blob) => Promise<{ width: number; height: number; close(): void }>,
) {
  const decoder = createPictureBitmapDecoder(undefined, bitmap ? { bitmap } : {});
  const image = await decoder(bytes);
  try {
    const { width, height } = image;
    fittedInsertImageSize(width, height);
    return { width, height };
  } finally {
    image.close?.();
  }
}
export function imageInsertError(error: unknown): string {
  const code = error instanceof Error ? error.message : String(error);
  const messages: Record<string, string> = {
    StaleImageInsert: '삽입할 위치가 바뀌었습니다. 창을 닫고 커서를 다시 선택하세요.',
    CompositionBlocked: '글자 조합이 끝난 뒤 다시 시도하세요.',
    ImageByteLimitExceeded: '그림 파일은 8 MiB 이하로 선택하세요.',
    InvalidImageBytes: '읽을 수 있는 그림 파일을 선택하세요.',
    UnsupportedInsertImageFormat: 'PNG 또는 JPEG 그림 파일을 선택하세요.',
    InvalidDecodedImageSize: '그림의 원본 크기를 확인할 수 없습니다.',
    InvalidPictureDimension: '너비와 높이를 올바른 mm 값으로 입력하세요.',
    InvalidPictureInsertionSize: '그림 크기가 지원 범위를 벗어났습니다.',
    ImageInsertionUnavailable: '현재 문서 엔진은 새 그림 삽입을 지원하지 않습니다.',
    UnsupportedPictureInsertionHost: '선택 영역 없이 일반 본문에 커서를 놓아주세요.',
    ReadOnlyDocument: '읽기 전용 문서에는 그림을 삽입할 수 없습니다.',
    EditorNotReady: '문서를 열고 편집 준비가 끝나면 사용할 수 있습니다.',
    HistoryRecoveryRequired: '편집 이력을 복구한 뒤 다시 시도하세요.',
    HistoryV2Required: '편집 이력 지원이 확인되지 않아 그림을 삽입할 수 없습니다.',
    ImageInsertionRequiresFullDocument: '문서 전체가 열린 상태에서 사용할 수 있습니다.',
  };
  return messages[code] ?? '그림을 삽입할 수 없습니다. 파일과 현재 문서 상태를 확인하세요.';
}
