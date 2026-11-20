// Source type contract only; official emitted-public web/native consumers remain a later gate.
import {
  SPLICE_TEXT_COMMAND,
  type HeadlessEditor,
  type CreatedCellTextTarget,
  type CreatedCellTextSelector,
  type SelectionTarget,
} from '../../src/index.ts';
export function publicHeadlessTypingContract(
  editor: HeadlessEditor,
  target: CreatedCellTextTarget,
  source: SelectionTarget,
) {
  const selector: CreatedCellTextSelector = {
    section: 0,
    identity: '18446744073709551615',
    row: 0,
    column: 0,
  };
  void editor.getCreatedCellTextTarget(selector, { startUnit: 0, endUnit: 0 });
  void editor.dispatchCommand(SPLICE_TEXT_COMMAND, {
    target,
    text: '한😀',
    insertion: {
      character: {
        underline: { kind: 'bottom' },
        strike: { enabled: true },
        textColor: 0x123456,
        fonts: {
          hangul: { name: '가나다' },
          latin: { name: 'Latin' },
          hanja: { name: '漢字' },
          japanese: { name: '日本語' },
          other: { name: 'Other' },
          symbol: { name: 'Symbol' },
          user: { name: 'User' },
        },
      },
    },
  });
  void editor.dispatchCommand(SPLICE_TEXT_COMMAND, { target: source, text: 'source text' });
  // @ts-expect-error Native logical identities remain decimal u64 strings.
  void editor.getCreatedCellTextTarget({ ...selector, identity: 1 }, { startUnit: 0, endUnit: 0 });
  // @ts-expect-error A SelectionTarget is not a Core-issued logical cell target.
  const notLogical: CreatedCellTextTarget = source;
  void notLogical;
  // @ts-expect-error Serialized fields alone cannot supply the private brand.
  const forged: CreatedCellTextTarget = {
    editorId: 'e',
    documentId: 'd',
    generation: 1,
    operationRevision: 0,
    viewRevision: 0,
    coordinateSpace: 'created-cell-utf16',
    format: 'hwpx',
    text: '',
    startUnit: 0,
    endUnit: 0,
  };
  void forged;
  void editor.dispatchCommand(SPLICE_TEXT_COMMAND, {
    target,
    text: 'x',
    // @ts-expect-error Character insertion does not include paragraph or reset formatting.
    insertion: { paragraph: {} },
  });
}
