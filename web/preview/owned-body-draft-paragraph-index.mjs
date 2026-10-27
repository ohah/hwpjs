import { EditorState } from '@hwpjs/core';
// renderer의 비노출 body draft 전용이다. 텍스트·서식·live DTO를 복제하거나 freeze하지 않는다.
import {
  captureImmutablePaintCoordinates,
  createPaintParagraphLookup,
} from './projection-paragraph-index.mjs';
const statePrototype = EditorState.prototype;
const contentDescriptor = Object.getOwnPropertyDescriptor(statePrototype, 'content');
const contentGetter = contentDescriptor?.get;
function sourceOwnedByState(state, content, source) {
  const current = Object.getOwnPropertyDescriptor(statePrototype, 'content');
  if (
    !contentGetter ||
    current?.get !== contentGetter ||
    current.set !== contentDescriptor.set ||
    current.enumerable !== contentDescriptor.enumerable ||
    current.configurable !== contentDescriptor.configurable
  )
    return false;
  try {
    if (Reflect.apply(contentGetter, state, []) !== content) return false;
    const paragraphs = Object.getOwnPropertyDescriptor(content, 'paragraphs');
    return !!paragraphs && Object.hasOwn(paragraphs, 'value') && paragraphs.value === source;
  } catch {
    return false;
  }
}
const arrayPrototype = Array.prototype;
const arrayMap = arrayPrototype.map;
const arrayFind = arrayPrototype.find;
const arrayIterator = arrayPrototype[Symbol.iterator];
const species = Object.getOwnPropertyDescriptor(Array, Symbol.species)?.get;
const fallback = (rows, point) =>
  rows.find((p) => p.section === point.section && p.paragraph === point.paragraph);
function ordinary(rows) {
  return (
    Array.isArray(rows) &&
    Object.getPrototypeOf(rows) === arrayPrototype &&
    !Object.getOwnPropertyDescriptor(rows, 'find') &&
    !Object.getOwnPropertyDescriptor(rows, 'map') &&
    !Object.getOwnPropertyDescriptor(rows, 'constructor') &&
    !Object.getOwnPropertyDescriptor(rows, Symbol.iterator) &&
    Object.getOwnPropertyDescriptor(arrayPrototype, 'constructor')?.value === Array &&
    Object.getOwnPropertyDescriptor(Array, Symbol.species)?.get === species &&
    Object.getOwnPropertyDescriptor(arrayPrototype, Symbol.iterator)?.value === arrayIterator &&
    Object.getOwnPropertyDescriptor(arrayPrototype, 'find')?.value === arrayFind &&
    Object.getOwnPropertyDescriptor(arrayPrototype, 'map')?.value === arrayMap
  );
}
function coordinate(row) {
  const section = Object.getOwnPropertyDescriptor(row ?? {}, 'section');
  const paragraph = Object.getOwnPropertyDescriptor(row ?? {}, 'paragraph');
  if (
    !section ||
    !paragraph ||
    !Object.hasOwn(section, 'value') ||
    !Object.hasOwn(paragraph, 'value') ||
    !Number.isSafeInteger(section.value) ||
    section.value < 0 ||
    !Number.isSafeInteger(paragraph.value) ||
    paragraph.value < 0
  )
    return null;
  return { section: section.value, paragraph: paragraph.value };
}

// 호출자는 renderer 내부의 기존 map callback뿐이다. 새 replacement는 paint 중 외부에 공개하지 않는다.
function createProjection(source, project, state, content) {
  const original =
    sourceOwnedByState(state, content, source) && ordinary(source)
      ? captureImmutablePaintCoordinates(source)
      : null;
  let paragraphs = source;
  if (project) {
    if (original) {
      // 검증된 실제 state의 배열만 내부에서 직접 생성한다. 외부 map/species를 호출하지 않는다.
      paragraphs = [];
      for (let index = 0; index < source.length; index++)
        Object.defineProperty(paragraphs, index, {
          value: Reflect.apply(project, undefined, [source[index], index, source]),
          writable: true,
          enumerable: true,
          configurable: true,
        });
    } else {
      // 외부 입력은 기존 map 호출과 반환값을 그대로 유지하며 소유권을 얻지 못한다.
      paragraphs = source.map(project);
    }
  }
  let snapshot = null;
  if (original && ordinary(paragraphs) && paragraphs.length === original.length) {
    const sourceRows = new Set(original.map((entry) => entry.row));
    const entries = [];
    for (let index = 0; index < original.length; index++) {
      const descriptor = Object.getOwnPropertyDescriptor(paragraphs, index);
      const row = descriptor?.value;
      const expected = original[index];
      const current = coordinate(row);
      if (
        !current ||
        current.section !== expected.section ||
        current.paragraph !== expected.paragraph ||
        (row !== expected.row &&
          (sourceRows.has(row) ||
            (Object.getPrototypeOf(row) !== Object.prototype &&
              Object.getPrototypeOf(row) !== null)))
      )
        break;
      entries.push(Object.freeze({ ...current, row }));
    }
    if (entries.length === original.length) snapshot = Object.freeze(entries);
  }
  return {
    paragraphs,
    beginFrame() {
      // paint 전에 한 번만 membership과 좌표를 확인한다. 각 행에서 P 전체를 재탐색하지 않는다.
      let valid =
        snapshot &&
        sourceOwnedByState(state, content, source) &&
        ordinary(paragraphs) &&
        paragraphs.length === snapshot.length;
      if (valid)
        for (let index = 0; index < snapshot.length; index++) {
          const row = Object.getOwnPropertyDescriptor(paragraphs, index)?.value;
          const current = coordinate(row),
            expected = snapshot[index];
          if (
            row !== expected.row ||
            !current ||
            current.section !== expected.section ||
            current.paragraph !== expected.paragraph
          ) {
            valid = false;
            break;
          }
        }
      const index = createPaintParagraphLookup();
      return {
        get kind() {
          return valid ? 'owned-body-draft' : 'fallback';
        },
        find(rows, point) {
          if (
            !valid ||
            !sourceOwnedByState(state, content, source) ||
            rows !== paragraphs ||
            !ordinary(rows) ||
            !coordinate(point)
          ) {
            valid = false;
            return fallback(rows, point);
          }
          return index.find(snapshot, point)?.row;
        },
        clear() {
          valid = false;
          index.clear();
        },
      };
    },
  };
}

export function createOwnedBodyDraftProjection(source, project, state, content) {
  return createProjection(source, project, state, content);
}
export function createStatePaintParagraphLookup(source, state, content) {
  return createProjection(source, null, state, content).beginFrame();
}
