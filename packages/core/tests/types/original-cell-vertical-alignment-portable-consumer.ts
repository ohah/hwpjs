import type {
  HeadlessEditor,
  OriginalCellAlignment,
  OriginalCellSelector,
  OriginalCellSelectionTarget,
  OriginalCellVerticalAlignmentRead,
  OriginalCellVerticalAlignmentTarget,
} from '../../src/index.ts';
import type {
  OriginalCellAlignment as AdapterAlignment,
  OriginalCellSelector as AdapterSelector,
} from '../../../../js/original-cell-vertical-alignment.mjs';
declare const editor: HeadlessEditor;
declare const selected: OriginalCellSelectionTarget;
const read: Promise<OriginalCellVerticalAlignmentRead> =
  editor.getOriginalCellVerticalAlignment(selected);
const values: OriginalCellAlignment[] = ['TOP', 'CENTER', 'BOTTOM'];
const adapterValues: AdapterAlignment[] = values;
const selector: OriginalCellSelector = { section: 0, paragraph: 3, tableNode: 2, listNode: 4 };
const adapterSelector: AdapterSelector = selector;
const coreSelector: OriginalCellSelector = adapterSelector;
// @ts-expect-error Unknown alignment is not a public value.
const wrongValue: OriginalCellAlignment = 'MIDDLE';
// @ts-expect-error Public targets retain their existing opaque Core brand.
const forged: OriginalCellVerticalAlignmentTarget = {};
async function inspect() {
  const result = await read;
  if (result.state === 'available') {
    const value: OriginalCellAlignment | null = result.value;
    const target: OriginalCellVerticalAlignmentTarget = result.target;
    // @ts-expect-error Available observations are immutable.
    result.value = 'BOTTOM';
    return { value, target };
  }
  return result.reason;
}
void [adapterValues, coreSelector, wrongValue, forged, inspect];
