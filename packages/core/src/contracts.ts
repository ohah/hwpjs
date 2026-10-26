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
  dispose(): void | Promise<void>;
}

export type RuntimeFactory = () => EditorRuntime | Promise<EditorRuntime>;
