// 실제 Canvas/Surface를 사용하며 Native/Core 응답과 renderer는 통제합니다.
import { createCanvasSurface } from '../src/surface.ts';
import { formattingFixture, tick } from './multirange-formatting-fixture.mjs';
import {
  createdCellClipboardSource,
  createdCellTypingOwner,
  createdCellTypingObservation,
} from '../../../web/preview/created-cell-typing-observation.mjs';
import { createdCellCharacterRanges } from '../../../js/created-cell-character-runs.mjs';
export { tick };
export async function runCreatedClipboard(format, body) {
  const f = formattingFixture();
  const address = { identity: '9007199254740993', row: 0, column: 0 };
  f.install({
    content: {
      ...f.state().content,
      format,
      createdCellTypingScope: 9,
      createdTables: [
        {
          section: 0,
          identity: address.identity,
          cells: [
            {
              paragraph_id: 1,
              row: 0,
              column: 0,
              text: 'ABCD',
              character_runs: [{ start_unit: 0, char_shape_id: 0 }],
            },
          ],
        },
      ],
    },
  });
  const sourceParagraph = f.renderer.paragraph;
  let cachedCell, cachedParagraph;
  const generated = () => {
    const cell = f.state().content.createdTables[0].cells[0];
    if (cachedCell === cell) return cachedParagraph;
    cachedCell = cell;
    return (cachedParagraph = {
      section: 0,
      createdCell: { ...address },
      text: cell.text,
      editable: true,
      selectable: true,
      softLineBreakAvailable: true,
      hasCanonicalCharacterRuns: Object.hasOwn(cell, 'character_runs'),
      characterRanges: createdCellCharacterRanges(cell, 0),
      ...(format === 'hwp5'
        ? {
            currentReference: {
              epoch: '1',
              scope: 'native',
              kind: 'cell',
              section: 0,
              id: address.identity,
              row: 0,
              column: 0,
            },
          }
        : {}),
    });
  };
  f.renderer.paragraph = (p) => (p?.createdCell ? generated() : sourceParagraph(p));
  f.renderer.layout = () => ({
    width: 800,
    height: 600,
    rows: [generated(), f.state().content.paragraphs[0]].map((p, i) => ({
      ...p,
      startUnit: 0,
      endUnit: p.text.length,
      width: p.text.length * 8,
      height: 28,
      x: 20,
      y: i * 32,
      boundaries: Array.from({ length: p.text.length + 1 }, (_, unit) => ({ unit, x: unit * 8 })),
    })),
  });
  f.renderer.createdCellClipboardSource = (p) =>
    createdCellClipboardSource(f.state().content, f.renderer.paragraph(p), p);
  f.renderer.createdCellTypingOwner = (p) =>
    createdCellTypingOwner(f.state().content, f.renderer.paragraph(p), p);
  f.renderer.createdCellTypingObservation = (p) =>
    createdCellTypingObservation(f.state().content, f.renderer.paragraph(p), p);
  f.renderer.createdCellCanonicalRuns = (p) =>
    f.renderer.paragraph(p)?.hasCanonicalCharacterRuns === true;
  f.renderer.richTypingScope = (p) => f.renderer.createdCellTypingOwner(p)?.scope ?? null;
  const writes = [];
  const clipboard = {
    writeText: async (text) => {
      writes.push(text);
    },
  };
  f.editor.update = async () => {};
  const surface = createCanvasSurface({
    root: f.root,
    editor: f.editor,
    environment: { clipboard },
    onStatus: (m) => f.reports.push(m),
  });
  const click = async (unit) => {
    f.pointer('pointerdown', 0, unit);
    f.pointer('pointerup', 0, unit);
    await tick();
  };
  try {
    await click(4);
    await body(f, surface, click, { clipboard, writes });
  } finally {
    while (f.waits.length) f.reject();
    await surface.dispose();
  }
}
