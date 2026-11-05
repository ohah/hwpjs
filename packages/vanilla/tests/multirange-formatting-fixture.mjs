// 실제 Surface/Canvas의 보기 수명이며 Core 응답과 renderer만 통제한다.
import { multiblockFixture, tick } from './multiblock-clipboard-fixture.mjs';
import { characterRangesState } from '../../../web/preview/character-property-selection.mjs';
import { characterSizeRangesState } from '../../../web/preview/character-size-selection.mjs';
import { paragraphSelectionRanges } from '../../../web/preview/paragraph-selection.mjs';
import { selectedFontIds } from '../../../web/preview/character-font-selection.mjs';
import { FONT_LANGUAGES } from '../../../js/font-face-identity.mjs';
export { tick };
export function formattingFixture() {
  const f = multiblockFixture();
  f.renderer.historyModelMatches = () => true;
  f.renderer.isSelectionPainted = () => true;
  const content = {
    ...f.state().content,
    characterPropertiesAvailable: true,
    characterUnderlineAvailable: true,
    characterStrikeAvailable: true,
    characterFontNameAvailable: true,
    characterTextColorAvailable: true,
    paragraphs: f.state().content.paragraphs.map((p, i) => ({
      ...p,
      paragraphShape: { alignment: 1 },
      characterRanges: [{ start: 0, end: p.text.length, charShapeId: i === 1 ? 1 : 0 }],
    })),
    characterShapes: [
      { id: 0, height: 1200, bold: false, italic: true },
      { id: 1, height: 1400, bold: true, italic: true },
    ],
    characterUnderlines: [
      { id: 0, kind: 'none' },
      { id: 1, kind: 'none' },
    ],
    characterStrikes: [
      { id: 0, enabled: false },
      { id: 1, enabled: false },
    ],
    characterTextColors: [
      { id: 0, color: 0x123456 },
      { id: 1, color: 0x123456 },
    ],
    characterFontReferences: [
      { id: 0, fontIds: [0, 0, 0, 0, 0, 0, 0] },
      { id: 1, fontIds: [0, 0, 0, 0, 0, 0, 0] },
    ],
    fontFaces: FONT_LANGUAGES.map((language) => ({
      language,
      id: 0,
      name: '검증 글꼴 ' + language,
    })),
  };
  f.install({ content });
  const ranges = (a, b) =>
    paragraphSelectionRanges(f.state().content.paragraphs, a, b, undefined, {
      sourcePositions: false,
    });
  f.renderer.selectionCharacterState = (a, b, property) =>
    characterRangesState(f.state().content, ranges(a, b), property);
  f.renderer.selectionCharacterSize = (a, b) =>
    characterSizeRangesState(f.state().content, ranges(a, b));
  f.renderer.selectionFontIds = (a, b, language) =>
    selectedFontIds(f.state().content, ranges(a, b), language);
  for (const key of [
    'characterPropertyRangesAvailable',
    'characterUnderlineRangesAvailable',
    'characterStrikeRangesAvailable',
    'textColorRangesAvailable',
    'characterFontNameRangesAvailable',
    'characterFontRangesAvailable',
    'characterShadeRangesAvailable',
    'characterShadeAvailable',
    'characterOutlineRangesAvailable',
    'characterOutlineAvailable',
    'characterEffectRangesAvailable',
  ])
    f.renderer[key] = () => true;
  f.messages = [];
  const acquire = f.editor.acquireInputSurface;
  f.editor.acquireInputSurface = (...args) => {
    const lease = acquire(...args);
    return {
      ...lease,
      request: (message, ...rest) => {
        f.messages.push(structuredClone(message));
        return lease.request(message, ...rest);
      },
    };
  };
  let dialogs = [];
  f.doc.querySelector = () => dialogs[0] ?? null;
  f.doc.querySelectorAll = () => dialogs;
  f.dialog = () => ({ ownerDocument: f.doc, isConnected: true, open: true });
  f.setDialogs = (value) => {
    dialogs = value;
  };
  return f;
}
