import * as z from 'zod/v4';
import { defineDocumentTool } from './extended-tools.ts';
import { describeMcpError } from './tools.ts';
import type { CallToolResult } from '@modelcontextprotocol/server';
import type { DocumentSessionManager } from './document-sessions.ts';

export function documentSessionTools(manager: DocumentSessionManager) {
  const sessionId = z.string().regex(/^[a-f0-9]{64}$/);
  const annotations = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  };
  const invoke = async (action: () => unknown): Promise<CallToolResult> => {
    try {
      const result = await action();
      return {
        content: [
          { type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result) },
        ],
        ...(typeof result === 'object' && result !== null
          ? { structuredContent: result as Record<string, unknown> }
          : {}),
      };
    } catch (error) {
      return { isError: true, content: [{ type: 'text', text: describeMcpError(error) }] };
    }
  };
  return [
    defineDocumentTool({
      name: 'open_document_session',
      config: {
        title: 'Open read-only document session',
        description:
          'Open a local HWP5/HWPX once for repeated reads. Returns an opaque sessionId owned by this connection. Maximum 4 sessions, 64 MiB per file and 128 MiB owned input including pending reservations. Close when finished. Session edits are not supported; apply_document_changes remains a separate file transaction.',
        inputSchema: z.strictObject({
          inputPath: z.string().min(1),
          expectedSha256: z
            .string()
            .regex(/^[a-f0-9]{64}$/)
            .optional(),
        }),
        annotations,
      },
      invoke: ({ inputPath, expectedSha256 }) =>
        invoke(() => manager.open(inputPath, expectedSha256)),
    }),
    defineDocumentTool({
      name: 'read_document_session',
      config: {
        title: 'Read opened document session',
        description:
          'Read the retained read-only snapshot as text or Markdown, using the same model and image/object references as read_document. Accepts only the server-issued handle and display options. Single UTF-8 text result is limited to 16 MiB; this does not bound model allocations.',
        inputSchema: z.strictObject({
          sessionId,
          format: z.enum(['text', 'markdown']).default('text'),
          view: z.enum(['content', 'structure']).default('content'),
        }),
        annotations: { ...annotations, idempotentHint: true, openWorldHint: false },
      },
      invoke: ({ sessionId, format, view }) =>
        invoke(() => manager.read(sessionId, { format, view })),
    }),
    defineDocumentTool({
      name: 'close_document_session',
      config: {
        title: 'Close opened document session',
        description:
          'Release the opened engine and input capacity. Closed or foreign handles return InvalidDocumentSession.',
        inputSchema: z.strictObject({ sessionId }),
        annotations: { ...annotations, openWorldHint: false },
      },
      invoke: ({ sessionId }) =>
        invoke(async () => {
          await manager.close(sessionId);
          return { closed: true };
        }),
    }),
  ];
}
