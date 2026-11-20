import { nativeDocumentParagraph } from '../../js/document-text-coordinates.mjs';
import { displayHwpxContent } from './hwpx-content.mjs';
// One event-order index shared by window dependency planning and search reveal.
export function hwpxWindowIdentities(projection) {
  displayHwpxContent(projection, { maxUnits: 0, maxParagraphs: 0 });
  const ordinals = new Map(),
    parents = new Map(),
    sections = new Set(),
    stack = [],
    groups = [];
  for (const event of projection.events) {
    if (event.kind === 'paragraph_start') {
      const ordinal = ordinals.size;
      ordinals.set(`${event.section}:${event.paragraph}`, ordinal);
      sections.add(event.section);
      if (stack.length) {
        parents.set(ordinal, stack.at(-1));
        groups.push([stack.at(-1), ordinal]);
      }
      stack.push(ordinal);
    } else if (event.kind === 'paragraph_end') stack.pop();
  }
  const resolve = (section, paragraph) => {
    const ordinal = ordinals.get(`${section}:${paragraph}`);
    if (ordinal === undefined) throw Error('WindowDependencyBindingMismatch');
    return ordinal;
  };
  return {
    ordinals,
    parents,
    sections,
    groups,
    resolve,
    resolveDisplay: (section, paragraph) => {
      const native = nativeDocumentParagraph('hwpx', paragraph);
      if (native === undefined) throw Error('WindowDependencyBindingMismatch');
      return resolve(section, native);
    },
  };
}
