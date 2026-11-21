import {
  createEditor,
  REPLACE_PICTURE_COMMAND,
  type PictureReplacementRead,
  type PictureReplacementSelector,
  type PictureReplacementTarget,
} from '../../../packages/core/src/index.ts';
import type { RuntimeMessage } from '../../../packages/core/src/contracts.ts';
import type { PictureReplacementMessage } from '../../../packages/core/src/commands/picture-replacement-dto.ts';

async function consumer(editor: ReturnType<typeof createEditor>, imageBytes: Uint8Array) {
  const selector: PictureReplacementSelector = { section: 0, pictureNode: 17 };
  const read: PictureReplacementRead = await editor.getPictureReplacement(selector);
  if (read.state === 'available') {
    const target: PictureReplacementTarget = read.target;
    await editor.dispatchCommand(REPLACE_PICTURE_COMMAND, { target, imageBytes });
    const format: 'hwp5' | 'hwpx' = read.observation.format;
    void format;
    // @ts-expect-error Native session is intentionally absent from public observation.
    void read.observation.binding;
  }
  // @ts-expect-error Plain JSON cannot mint an opaque editor target.
  await editor.dispatchCommand(REPLACE_PICTURE_COMMAND, { target: {}, imageBytes });
  // @ts-expect-error Physical picture address cannot be replaced by a resize address.
  await editor.getPictureReplacement({ section: 0, resizeRecordNode: 17 });
}
function portableMessage(message: PictureReplacementMessage): RuntimeMessage {
  return message;
}
void consumer;
void portableMessage;
