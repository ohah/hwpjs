import type { NamedFieldSource } from './editor/named-fields.ts';
import type { NativeHistoryStats } from './history-options.ts';
/** Owned command data at the backend boundary; never an authoritative document model. */
export interface RuntimeMessage {
  kind: string;
  [key: string]: unknown;
}

export interface RuntimeRequestContext {
  editorId: string;
  documentId: string | null;
  generation: number;
  requestId: number;
  operationRevision: number;
}

export interface RuntimeReply {
  kind: string;
  content?: unknown;
  error?: string;
  applied?: boolean;
  historyStats?: NativeHistoryStats;
  historyPoisoned?: boolean;
  historyRevision?: number;
  historyRevisions?: readonly number[];
  meta?: {
    application?: 'unapplied' | 'applied' | 'unknown';
    changed?: boolean | null;
    context?: RuntimeRequestContext;
  };
  [key: string]: unknown;
}

/** One document candidate or active document. A runtime must not be shared by editors. */
export interface EditorRuntime {
  request(message: RuntimeMessage, context?: RuntimeRequestContext): Promise<RuntimeReply>;
  /** Read current source-owned fields without changing selection, content or history. */
  readNamedFields?(context: RuntimeRequestContext): Promise<NamedFieldSource>;
  dispose(): void | Promise<void>;
}

export type RuntimeFactory = (() => EditorRuntime | Promise<EditorRuntime>) & {
  /** Returns owned constructor bytes; the editor clears them after candidate admission. */
  createDocumentBytes?(format: 'hwp5' | 'hwpx'): Promise<Uint8Array>;
};
