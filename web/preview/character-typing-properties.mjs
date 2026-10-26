import { characterPropertyArgs } from "../../js/character-property-args.mjs";
import { isSourceCharacterSize } from "./character-size-selection.mjs";

function scalarStart(text, unit) {
  const previous = text.charCodeAt(unit - 1),
    current = text.charCodeAt(unit);
  return previous >= 0xd800 && previous <= 0xdbff && current >= 0xdc00 && current <= 0xdfff
    ? unit - 1
    : unit;
}

export function typingSourceSpan(text, unit) {
  if (
    typeof text !== "string" ||
    !text.length ||
    !Number.isInteger(unit) ||
    unit < 0 ||
    unit > text.length
  )
    return null;
  const at = scalarStart(text, unit);
  return {
    start: at > 0 ? scalarStart(text, at - 1) : 0,
    end: at > 0 ? at : text.codePointAt(0) > 0xffff ? 2 : 1,
  };
}

export function mergeTypingProperties(previous, requested) {
  characterPropertyArgs(requested);
  const patch = Object.fromEntries(Object.entries(requested).filter(([, value]) => value !== null));
  return { ...previous, ...patch };
}

export function characterTypingState(text, unit, property, properties, read) {
  if (
    !["bold", "italic"].includes(property) ||
    typeof text !== "string" ||
    !Number.isInteger(unit) ||
    unit < 0 ||
    unit > text.length
  )
    return null;
  if (typeof properties?.[property] === "boolean") return properties[property];
  if (text.length === 0) return false;
  const { start, end } = typingSourceSpan(text, unit);
  const state = read(start, end, property);
  return typeof state === "boolean" ? state : null;
}

/** 입력 크기는 현재 입력 서식을 우선하며 빈 원문의 기본값은 추정하지 않습니다. */
export function characterTypingSize(text, unit, properties, read) {
  if (typeof text !== "string" || !Number.isInteger(unit) || unit < 0 || unit > text.length)
    return null;
  if (properties?.size !== undefined && properties.size !== null) {
    try {
      characterPropertyArgs({ size: properties.size });
      return properties.size;
    } catch {
      return null;
    }
  }
  if (!text.length) return null;
  const { start, end } = typingSourceSpan(text, unit);
  const state = read(start, end);
  return isSourceCharacterSize(state) ? state : null;
}
