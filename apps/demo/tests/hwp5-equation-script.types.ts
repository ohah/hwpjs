import {
  EDIT_HWP5_EQUATION_SCRIPT_COMMAND,
  type HeadlessEditor,
  type Hwp5EquationScriptTarget,
  type Hwp5EquationScriptRead,
} from '@hwpjs/core';
declare const editor: HeadlessEditor;
declare const target: Hwp5EquationScriptTarget;
const read: Promise<Hwp5EquationScriptRead> = editor.getHwp5EquationScript({
  section: 0,
  equationNode: 8,
  layout: 'version-only',
});
void read;
void editor.dispatchCommand(EDIT_HWP5_EQUATION_SCRIPT_COMMAND, { target, script: 'x' });
// @ts-expect-error A structural clone is not an opaque Core target.
const forged: Hwp5EquationScriptTarget = {};
void forged;
void editor.getHwp5EquationScript({
  section: 0,
  equationNode: 8,
  layout: 'version-only',
  // @ts-expect-error Native witness fields are not a public selector.
  epoch: '1',
});
// @ts-expect-error Unknown layouts are rejected at the package boundary.
void editor.getHwp5EquationScript({ section: 0, equationNode: 8, layout: 'auto' });
