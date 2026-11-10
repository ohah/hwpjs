import type { EditorState, HeadlessEditor } from '@hwpjs/core';
import {
  createGeneratedTableGridPort,
  generatedTableGridReason,
  type GeneratedTableGridCapture,
  type GeneratedTableGridCommand,
  type GeneratedTableGridCore,
  type GeneratedTableGridHost,
} from './generated-table-grid-port.ts';
import {
  createSourceTableGridPort,
  sourceTableGridReason,
  type SourceTableGridCapture,
  type SourceTableGridCore,
  type SourceTableGridHost,
} from './source-table-grid-port.ts';

export interface TableGridHost extends GeneratedTableGridHost, SourceTableGridHost {}
/** Only this router's WeakMap associates an opaque lease with a concrete port capture. */
export type TableGridCapture = Readonly<
  { state: EditorState } & ({ kind: 'generated' } | { kind: 'source' })
>;
type Owned =
  | { kind: 'generated'; capture: GeneratedTableGridCapture }
  | { kind: 'source'; capture: SourceTableGridCapture };

export function createTableGridPort(
  editor: HeadlessEditor,
  core: GeneratedTableGridCore & SourceTableGridCore,
  getHost: () => TableGridHost | undefined,
) {
  const generated = createGeneratedTableGridPort(editor, core, getHost);
  const source = createSourceTableGridPort(editor, core, getHost);
  const issued = new WeakMap<TableGridCapture, Owned>();
  let pending = false,
    disposed = false;
  const choose = (): Owned => {
    const capture = generated.capture();
    return capture.cell && !capture.reason
      ? { kind: 'generated', capture }
      : { kind: 'source', capture: source.capture() };
  };
  return {
    capture(): TableGridCapture {
      const owned = choose();
      const lease = Object.freeze({ kind: owned.kind, state: owned.capture.state });
      if (!pending && !disposed) issued.set(lease, owned);
      return lease;
    },
    presentation() {
      const owned = choose();
      const values = owned.kind === 'generated' ? generated.presentation() : source.presentation();
      if (pending || disposed)
        for (const value of Object.values(values)) {
          value.enabled = false;
          value.surfaceSelection = false;
          value.reason = pending ? '표의 행·열 변경을 반영하고 있습니다.' : '종료된 도구입니다.';
        }
      return values;
    },
    contextTarget() {
      if (pending || disposed) return null;
      const owned = choose();
      return owned.kind === 'generated' ? generated.contextTarget() : source.contextTarget();
    },
    reason(code: string) {
      return code.includes('Generated')
        ? generatedTableGridReason(code)
        : sourceTableGridReason(code);
    },
    async apply(lease: TableGridCapture, command: GeneratedTableGridCommand) {
      const owned = issued.get(lease);
      if (!owned || pending || disposed)
        return { status: 'rejected-unapplied' as const, error: 'StaleTableGridLease' };
      issued.delete(lease);
      pending = true;
      try {
        return await (owned.kind === 'generated'
          ? generated.apply(owned.capture, command)
          : source.apply(owned.capture, command));
      } finally {
        pending = false;
      }
    },
    dispose() {
      disposed = true;
      generated.dispose();
      source.dispose();
    },
  };
}
