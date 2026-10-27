import type { HeadlessEditor } from '@hwpjs/core';
import type { ParagraphShapeApi } from './paragraph-shape-port.ts';
type EditorApi = Pick<
  HeadlessEditor,
  'getFormattingCapabilities' | 'queryFormatting' | 'dispatchCommand'
>;
export type ParagraphShapeCoreApi = Pick<
  typeof import('@hwpjs/core'),
  'APPLY_FORMATTING_PATCH_COMMAND' | 'getSelectionFormatting' | 'createParagraphSelection'
>;
/** 새 export를 정적으로 가져오지 않고, 호출자가 선택한 같은 공식 core만 주입받습니다. */
export function supportsParagraphShapeApi(
  editor: Partial<EditorApi>,
  core: Partial<ParagraphShapeCoreApi>,
) {
  return (
    typeof editor.getFormattingCapabilities === 'function' &&
    typeof editor.queryFormatting === 'function' &&
    typeof editor.dispatchCommand === 'function' &&
    typeof core.getSelectionFormatting === 'function' &&
    typeof core.createParagraphSelection === 'function' &&
    core.APPLY_FORMATTING_PATCH_COMMAND?.name === 'apply-formatting-patch' &&
    typeof core.APPLY_FORMATTING_PATCH_COMMAND.id === 'symbol'
  );
}
export function createParagraphShapeApi(
  editor: Partial<EditorApi>,
  core: Partial<ParagraphShapeCoreApi>,
): ParagraphShapeApi {
  if (!supportsParagraphShapeApi(editor, core)) throw Error('AtomicFormattingApiRequired');
  const capability = editor.getFormattingCapabilities!,
    query = editor.queryFormatting!,
    dispatch = editor.dispatchCommand!,
    observe = core.getSelectionFormatting!,
    select = core.createParagraphSelection!,
    command = core.APPLY_FORMATTING_PATCH_COMMAND!;
  return {
    command,
    target(state) {
      const current = observe(state).target;
      if (!current) return null;
      return select(state, {
        section: current.section,
        paragraph: current.paragraph,
        startUnit: current.startUnit,
        endUnit: current.endUnit,
        affinity: current.affinity,
      });
    },
    capabilities: (options) => capability.call(editor, options),
    query: (target, options) => query.call(editor, target, options),
    dispatch: (value, payload) => dispatch.call(editor, value, payload),
  };
}
