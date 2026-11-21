import { surfaceOperation } from '../commands/surface-protocol.ts';
/** Read-source lifetime classification only. Never grants a generic surface operation. */
export const isNativeReadSourceRead = (kind: string): boolean =>
  surfaceOperation(kind) === 'read' ||
  kind === 'object-geometry-query' ||
  kind === 'page-restarts-query' ||
  kind === 'hwp5-equation-script-capture' ||
  kind === 'hwp5-equation-script-close';
export const isNativeReadSourceMutation = (kind: string): boolean =>
  surfaceOperation(kind) === 'mutation' ||
  kind === 'edit-page-restart' ||
  kind === 'hwp5-equation-script-edit';
