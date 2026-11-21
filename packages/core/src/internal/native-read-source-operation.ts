import { surfaceOperation } from '../commands/surface-protocol.ts';
/** Read-source lifetime classification only. Never grants a generic surface operation. */
export const isNativeReadSourceRead = (kind: string): boolean =>
  surfaceOperation(kind) === 'read' ||
  kind === 'object-geometry-query' ||
  kind === 'page-restarts-query';
export const isNativeReadSourceMutation = (kind: string): boolean =>
  surfaceOperation(kind) === 'mutation' || kind === 'edit-page-restart';
