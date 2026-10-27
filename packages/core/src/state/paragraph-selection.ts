import type { EditorState } from './editor-state.ts';
import type { SelectionTarget } from '../commands/commands.ts';
import { validateSelection } from '../commands/selection.ts';
// @ts-ignore Shared canonical display ownership; no new reference authority.
import { paragraphSelectionOwner } from '../../../../web/preview/paragraph-selection.mjs';

export interface ParagraphSelectionOptions {
  readonly section: number;
  readonly paragraph: number;
  readonly startUnit: number;
  readonly endUnit?: number;
  readonly affinity?: 'forward' | 'backward';
}

/** Select one current display paragraph by coordinates, including an empty caret.
 * Owner and native references come only from the existing snapshot/command path.
 * A target from an old observation remains subject to the normal token checks.
 */
export function createParagraphSelection(
  state: EditorState,
  options: ParagraphSelectionOptions,
): SelectionTarget {
  if (
    !options ||
    typeof options !== 'object' ||
    Array.isArray(options) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(options))
  )
    throw Error('InvalidParagraphSelectionOptions');
  for (const key of Reflect.ownKeys(options)) {
    if (
      typeof key !== 'string' ||
      !['section', 'paragraph', 'startUnit', 'endUnit', 'affinity'].includes(key) ||
      !('value' in Object.getOwnPropertyDescriptor(options, key)!)
    )
      throw Error('InvalidParagraphSelectionOptions');
  }
  if (state.status !== 'ready') throw Error('EditorNotReady');
  const content = state.content as {
    format?: string;
    paragraphs?: { section: number; paragraph: number; [key: string]: unknown }[];
  };
  if (!content || !['hwp5', 'hwpx'].includes(content.format ?? ''))
    throw Error('InvalidCoordinateSpace');
  const row = Array.isArray(content.paragraphs)
    ? content.paragraphs.find(
        (item) => item.section === options.section && item.paragraph === options.paragraph,
      )
    : undefined;
  const target: SelectionTarget = {
    ...state.token,
    coordinateSpace: 'display',
    format: content.format as 'hwp5' | 'hwpx',
    owner: paragraphSelectionOwner(row) ?? '',
    section: options.section,
    paragraph: options.paragraph,
    startUnit: options.startUnit,
    endUnit: options.endUnit === undefined ? options.startUnit : options.endUnit,
    affinity: options.affinity === undefined ? 'forward' : options.affinity,
  };
  validateSelection(target, state);
  return Object.freeze(target);
}
