import { currentParagraphReference } from './current-paragraph-reference.ts';
export function tableParagraphReference(value: unknown, section: number) {
  return currentParagraphReference(value, section, 'UnsupportedTableInsertReference');
}
