import { createEditor, createParagraphSelection, type HeadlessEditor } from '@hwpjs/core';
import { bindRuntimeAdmission } from '../../../packages/core/src/internal/runtime-admission.ts';
import type { DocumentSearchSelectionPort } from '../src/document-search-controller.ts';

// Source-only synthetic Runtime and Surface ports, not an actual Native ABI or
// renderer. The complete read and selection schemas are explicit in this fixture.
export function createTextToolsFixtureEditor(
  content: any,
  options: { readError?: string; nativeParagraphs?: any[] } = {},
) {
  const calls: any[] = [];
  const editor = createEditor({
    runtimeFactory() {
      let live = true;
      const runtime: any = {
        async request(message: any, context: any) {
          calls.push(message);
          const base = {
            kind: message.kind,
            meta: { context, application: 'unapplied', changed: false },
          };
          if (message.kind === 'document-text-snapshot') {
            if (options.readError) return { ...base, error: options.readError };
            const paragraphs = options.nativeParagraphs ?? content.paragraphs;
            const counts = new Map<number, number>();
            for (const row of paragraphs)
              counts.set(row.section, (counts.get(row.section) ?? 0) + 1);
            return {
              ...base,
              documentText: {
                schemaVersion: 1,
                scope: 'native-document-text',
                complete: true,
                format: content.format,
                binding: { session: 'synthetic-native', revision: null },
                coverage: {
                  totalParagraphs: paragraphs.length,
                  sections: [...counts].map(([section, paragraphCount]) => ({
                    section,
                    paragraphCount,
                  })),
                },
                rows: paragraphs.map((row: any, ordinal: number) => ({
                  ordinal,
                  section: row.section,
                  paragraph: ordinal,
                  ref: `synthetic-${ordinal}`,
                  text: row.text,
                })),
              },
            };
          }
          if (message.kind === 'document-text-selection') {
            const request = message.request;
            const ordinal = Number(request.ref.slice('synthetic-'.length));
            const row = (options.nativeParagraphs ?? content.paragraphs)[ordinal];
            if (!row) return { ...base, error: 'StaleDocumentTextReference' };
            return {
              ...base,
              documentTextSelection: {
                schemaVersion: 1,
                scope: request.scope,
                coordinateSpace: 'native-current-text-observation',
                executionAuthority: false,
                format: content.format,
                binding: request.binding,
                ref: request.ref,
                expectedOriginal: request.expectedOriginal,
                beforeText: row.text,
                target: {
                  kind: 'paragraph',
                  section: row.section,
                  paragraph: row.paragraph,
                  startUnit: request.startUnit,
                  endUnit: request.endUnit,
                },
              },
            };
          }
          if (message.kind === 'text-transaction-capabilities')
            return {
              ...base,
              textTransactionCapabilities: {
                available: false,
                reason: 'SyntheticFixtureReadOnlyContract',
                supportsNewlines: false,
              },
            };
          return {
            ...base,
            content,
            ...(!['load', 'enable'].includes(message.kind)
              ? { meta: { context, application: 'applied', changed: true } }
              : {}),
          };
        },
        dispose() {
          live = false;
        },
      };
      bindRuntimeAdmission(
        runtime,
        async (message, context, admit) => {
          admit();
          return runtime.request(message, context);
        },
        () => live,
      );
      return runtime;
    },
  });
  return { editor, calls };
}
export function textToolsFixtureSelection(editor: HeadlessEditor): DocumentSearchSelectionPort {
  return async (observation, current) => {
    if (!current() || observation.native.target.kind !== 'paragraph') return null;
    const native = observation.native.target;
    let target;
    try {
      target = createParagraphSelection(editor.getEditorState(), {
        section: native.section,
        paragraph: native.paragraph,
        startUnit: native.startUnit,
        endUnit: native.endUnit,
      });
    } catch {
      return null;
    }
    const state = await editor.setSelection(target, { stateVersion: observation.stateVersion });
    return current() ? { state } : null;
  };
}
