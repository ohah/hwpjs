import {
  EDIT_PAGE_RESTART_COMMAND,
  type HeadlessEditor,
  type PageRestartTarget,
} from '../../src/index.ts';
declare const editor: HeadlessEditor;
declare const target: PageRestartTarget;
void editor.dispatchCommand(EDIT_PAGE_RESTART_COMMAND, { target, number: 7 });
void editor.getPageRestarts({ section: 0 }).then((read) => {
  if (read.state === 'available') {
    read.entries.forEach((row) => {
      const value: number = row.number;
      void value;
    });
    read.unavailable.forEach((row) => {
      const reason: string = row.reason;
      void reason;
    });
  }
});
// @ts-expect-error A plain object cannot construct a private target.
const forgedTarget: PageRestartTarget = {};
void forgedTarget;
// @ts-expect-error Native observations are never part of the public command DTO.
void editor.dispatchCommand(EDIT_PAGE_RESTART_COMMAND, { target, number: 7, before: {} });
