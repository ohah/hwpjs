import {
  createEditor,
  SET_PICTURE_CROP_COMMAND,
  type PictureCropRead,
  type PictureCropRect,
} from '../../../packages/core/src/index.ts';
export async function example(editor: ReturnType<typeof createEditor>) {
  const result: PictureCropRead = await editor.getPictureCrop({ section: 0, pictureNode: 7 });
  if (result.state !== 'available') return;
  // @ts-expect-error Native lease keys are not a public observation.
  void result.observation.leaseKey;
  await editor.dispatchCommand(SET_PICTURE_CROP_COMMAND, {
    // @ts-expect-error Plain JSON cannot mint an opaque crop target.
    target: {},
    crop: { left: 0, top: 0, right: 1, bottom: 1 },
  });
  const rect: PictureCropRect = { left: 100, top: 200, right: 3000, bottom: 1800 };
  await editor.dispatchCommand(SET_PICTURE_CROP_COMMAND, { target: result.target, crop: rect });
  await editor.releasePictureCrop(result.target);
}
