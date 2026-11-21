import {
  createEditor,
  SET_OBJECT_OUTER_MARGINS_COMMAND,
  type ObjectOuterMarginsRead,
} from '../../../packages/core/src/index.ts';
import type { RuntimeMessage } from '../../../packages/core/src/contracts.ts';
import type { ObjectOuterMarginsMessage } from '../../../packages/core/src/commands/object-outer-margins-dto.ts';
async function consumer(editor: ReturnType<typeof createEditor>) {
  const read: ObjectOuterMarginsRead = await editor.getObjectOuterMargins({
    kind: 'drawing',
    section: 0,
    node: 17,
  });
  if (read.state === 'available') {
    await editor.dispatchCommand(SET_OBJECT_OUTER_MARGINS_COMMAND, {
      target: read.target,
      margins: read.observation.margins,
    });
    // @ts-expect-error Native binding is not part of the public observation.
    void read.observation.binding;
  }
  await editor.dispatchCommand(SET_OBJECT_OUTER_MARGINS_COMMAND, {
    // @ts-expect-error Public JSON cannot construct an editor's private target.
    target: {},
    margins: { left: 0, right: 0, top: 0, bottom: 0 },
  });
  // @ts-expect-error First margin contract excludes chart owners.
  await editor.getObjectOuterMargins({ kind: 'chart', section: 0, node: 17 });
}
function portable(message: ObjectOuterMarginsMessage): RuntimeMessage {
  return message;
}
void consumer;
void portable;
