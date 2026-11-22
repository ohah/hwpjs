import {
  SET_PICTURE_CROP_COMMAND,
  type HeadlessEditor,
  type PictureCropTarget,
  type PictureCropObservation,
  type PictureCropRect,
} from '@hwpjs/core';
import type {
  PictureReplacementHost,
  PictureReplacementSelection,
} from './picture-replacement-port.ts';
type State = ReturnType<HeadlessEditor['getEditorState']>;
export interface PictureCropCapture {
  readonly state: State;
  readonly observation: PictureCropObservation;
}
export function createPictureCropPort(
  editor: Pick<
    HeadlessEditor,
    'getEditorState' | 'getPictureCrop' | 'releasePictureCrop' | 'dispatchCommand'
  >,
  host: () => PictureReplacementHost | undefined,
) {
  const owners = new WeakMap<
    PictureCropCapture,
    {
      host: PictureReplacementHost;
      selection: PictureReplacementSelection;
      target: PictureCropTarget;
      used: boolean;
    }
  >();
  let generation = 0;
  const current = (capture: PictureCropCapture) => {
    const o = owners.get(capture);
    return (
      !!o &&
      !o.used &&
      host() === o.host &&
      editor.getEditorState() === capture.state &&
      o.selection.current() &&
      editor.getEditorState() === capture.state
    );
  };
  return {
    current,
    async capture(): Promise<PictureCropCapture> {
      const ticket = ++generation,
        state = editor.getEditorState(),
        h = host(),
        selection = h?.capturePictureReplacementSelection?.();
      if (!h || !selection || state.status !== 'ready' || !selection.current())
        throw Error('StalePictureCropSelection');
      const result = await editor.getPictureCrop(
        { section: selection.section, pictureNode: selection.pictureNode },
        { token: state.token },
      );
      if (result.state !== 'available') throw Error(result.reason);
      if (
        generation !== ticket ||
        editor.getEditorState() !== state ||
        host() !== h ||
        !selection.current()
      ) {
        await editor.releasePictureCrop(result.target);
        throw Error('StalePictureCropSelection');
      }
      const capture = Object.freeze({ state, observation: result.observation });
      owners.set(capture, { host: h, selection, target: result.target, used: false });
      return capture;
    },
    async submit(capture: PictureCropCapture, crop: PictureCropRect) {
      const o = owners.get(capture);
      if (!o || !current(capture)) throw Error('StalePictureCropSelection');
      const payload = { target: o.target, crop };
      const send = editor.dispatchCommand.bind(editor);
      if (!current(capture)) throw Error('StalePictureCropSelection');
      o.used = true;
      return send(SET_PICTURE_CROP_COMMAND, payload);
    },
    async release(capture?: PictureCropCapture) {
      generation++;
      if (!capture) return;
      const o = owners.get(capture);
      if (!o || o.used) return;
      o.used = true;
      await editor.releasePictureCrop(o.target);
    },
  };
}
