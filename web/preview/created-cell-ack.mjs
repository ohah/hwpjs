// 현재 Native 셀 ACK의 본문·소유자·UTF-16 경계를 입력과 clipboard가 공유합니다.
import { sameParagraph } from './text-geometry.mjs';
import { isUtf16Boundary } from './utf16-boundary.mjs';
export function matchesCreatedCellAck({
  previous,
  target,
  paragraph,
  nativeOwner,
  revision,
  current,
}) {
  const after = previous?.afterSelection;
  return Boolean(
    Number.isSafeInteger(revision) &&
    revision >= 0 &&
    revision < 0xffffffff &&
    current() &&
    paragraph &&
    paragraph.text === previous.afterText &&
    after &&
    sameParagraph(after.anchor, target) &&
    sameParagraph(after.focus, target) &&
    Number.isSafeInteger(after.focus.unit) &&
    after.focus.unit >= 0 &&
    after.anchor.unit === after.focus.unit &&
    after.focus.unit <= paragraph.text.length &&
    isUtf16Boundary(paragraph.text, after.focus.unit) &&
    nativeOwner?.owner === previous.cellTypingOwner &&
    nativeOwner?.scope === previous.cellTypingScope &&
    current(),
  );
}
