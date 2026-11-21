import {
  REPLACE_PICTURE_COMMAND,
  type HeadlessEditor,
  type PictureReplacementTarget,
} from '@hwpjs/core';

type State = ReturnType<HeadlessEditor['getEditorState']>;
export interface PictureReplacementSelection {
  readonly section: number;
  readonly pictureNode: number;
  current(): boolean;
}
export interface PictureReplacementHost {
  capturePictureReplacementSelection?(): PictureReplacementSelection | null;
}
export interface PictureReplacementCapture {
  readonly state: State;
}
const stale = () => Error('그림 선택이나 문서가 바뀌었습니다. 속성 창을 다시 열어주세요.');
export function createPictureReplacementPort(
  editor: Pick<HeadlessEditor, 'getEditorState' | 'getPictureReplacement' | 'dispatchCommand'>,
  host: () => PictureReplacementHost | undefined,
) {
  const owners = new WeakMap<
    PictureReplacementCapture,
    {
      selection: PictureReplacementSelection;
      host: PictureReplacementHost;
      target: PictureReplacementTarget;
      used: boolean;
    }
  >();
  const current = (capture: PictureReplacementCapture) => {
    const owner = owners.get(capture);
    return (
      !!owner &&
      !owner.used &&
      host() === owner.host &&
      editor.getEditorState() === capture.state &&
      owner.selection.current() &&
      editor.getEditorState() === capture.state
    );
  };
  return {
    current,
    async capture(): Promise<PictureReplacementCapture> {
      const state = editor.getEditorState();
      const observedHost = host();
      const selection = observedHost?.capturePictureReplacementSelection?.();
      if (!observedHost || !selection || state.status !== 'ready' || !selection.current())
        throw stale();
      const selector = { section: selection.section, pictureNode: selection.pictureNode };
      const token = state.token;
      if (editor.getEditorState() !== state || host() !== observedHost || !selection.current())
        throw stale();
      const result = await editor.getPictureReplacement(selector, { token });
      if (editor.getEditorState() !== state || host() !== observedHost || !selection.current())
        throw stale();
      if (result.state !== 'available') throw Error(result.reason);
      const capture = Object.freeze({ state });
      owners.set(capture, { selection, host: observedHost, target: result.target, used: false });
      return capture;
    },
    async submit(capture: PictureReplacementCapture, imageBytes: Uint8Array) {
      const owner = owners.get(capture);
      if (!owner || !current(capture)) throw stale();
      const payload = { target: owner.target, imageBytes };
      const send = editor.dispatchCommand.bind(editor);
      if (!current(capture)) throw stale();
      owner.used = true;
      return send(REPLACE_PICTURE_COMMAND, payload);
    },
  };
}
