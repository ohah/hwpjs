import { attachHwp5Tables } from './hwp5-table-content.mjs';
import { attachHwp5WindowNotes } from './hwp5-window-note-content.mjs';
import { attachHwp5WindowCaptions } from './hwp5-window-caption-content.mjs';
import { attachHwp5WindowDrawings } from './hwp5-window-drawing-content.mjs';
import { attachHwp5WindowPictures } from './hwp5-window-picture-content.mjs';
import { memoHwp5WindowFlows } from './hwp5-window-flows.mjs';

// Cache native flow only within this synchronous preparation; never across edits.
export function attachHwp5WindowObjects(editor, preview, content) {
  if (!content.window) throw new Error('MissingParagraphWindow');
  const scoped = memoHwp5WindowFlows(editor);
  attachHwp5Tables(scoped, preview, content);
  attachHwp5WindowNotes(scoped, content);
  attachHwp5WindowCaptions(scoped, content);
  attachHwp5WindowDrawings(scoped, content);
  return attachHwp5WindowPictures(scoped, content);
}
