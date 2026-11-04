// 실제 Canvas와 Surface를 쓰며 Core 응답과 renderer만 통제한다. Native 실행 증거가 아니다.
import { fixture } from './non-text-history-fixture.mjs';
import {
  paragraphSelectionRanges,
  paragraphSelectionText,
} from '../../../web/preview/paragraph-selection.mjs';
export const tick = async () => {
  for (let i = 0; i < 60; i++) await Promise.resolve();
};
export function multiblockFixture() {
  const f = fixture();
  f.install({
    content: {
      ...f.state().content,
      paragraphs: ['ABCD', 'EFGH', 'IJKL'].map((text, paragraph) => ({
        section: 0,
        paragraph,
        text,
        editable: true,
        selectable: true,
        selectionOwner: 'section:0:body',
      })),
    },
  });
  f.renderer.pictureAtLogicalPoint = () => null;
  f.renderer.paragraph = (point) =>
    f
      .state()
      .content.paragraphs.find(
        (p) => p.section === point?.section && p.paragraph === point?.paragraph,
      );
  f.renderer.layout = () => ({
    width: 800,
    height: 600,
    rows: f.state().content.paragraphs.map((p, i) => ({
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
  f.renderer.selectionRanges = (a, b) =>
    paragraphSelectionRanges(f.state().content.paragraphs, a, b);
  f.renderer.replacementRanges = (a, b) =>
    paragraphSelectionRanges(f.state().content.paragraphs, a, b, undefined, { includeEmpty: true });
  f.renderer.selectionText = (a, b) => paragraphSelectionText(f.state().content.paragraphs, a, b);
  f.renderer.paragraphReplacementAvailable = () => true;
  f.pointer = (type, paragraph, unit, extra = {}) => {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, {
      button: 0,
      buttons: type === 'pointerup' ? 0 : 1,
      pointerId: 1,
      clientX: 20 + unit * 8,
      clientY: paragraph * 32 + 10,
      ...extra,
    });
    f.canvas().dispatchEvent(event);
    return event;
  };
  f.selectA = async () => {
    f.pointer('pointerdown', 0, 1);
    await tick();
    f.pointer('pointermove', 1, 2);
    f.pointer('pointerup', 1, 2);
    await tick();
  };
  f.selectB = async () => {
    f.pointer('pointerdown', 2, 2, { shiftKey: true });
    f.pointer('pointerup', 2, 2);
    await tick();
  };
  return f;
}
