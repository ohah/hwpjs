import {
  checkedPictureResizeSelector,
  checkedPictureResizeBefore,
  checkedPictureResizeRequest,
} from '../../js/picture-anchored-resize-transport.mjs';
export function queryPictureAnchoredResize(editor, format, input) {
  if (editor?.supportsPictureAnchoredResize?.() !== true)
    throw Error('AnchoredPictureResizeUnavailable');
  const selector = checkedPictureResizeSelector(input);
  return checkedPictureResizeBefore(
    editor.pictureAnchoredResize(selector.section, selector.pictureNode),
    format,
  );
}
export function commitPictureAnchoredResize(editor, format, input) {
  if (editor?.supportsPictureAnchoredResize?.() !== true)
    throw Error('AnchoredPictureResizeUnavailable');
  return editor.setPictureAnchoredResize(checkedPictureResizeRequest(input, format));
}
