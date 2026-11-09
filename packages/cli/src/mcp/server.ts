import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import publicPackage from '../../../hwpjs/package.json' with { type: 'json' };
import { documentTools, describeMcpError } from './tools.ts';
import { validateMcpOcrExecutable } from './extended-tools.ts';
import type { DocumentToolsOptions } from './tools.ts';
import type { ServeStdioOptions } from '@modelcontextprotocol/server/stdio';
import { createDocumentSessionManager } from './document-sessions.ts';
import type { DocumentSessionDependencies } from './document-sessions.ts';
import { documentSessionTools } from './session-tools.ts';

export type McpServerOptions = DocumentToolsOptions & {
  sessionDependencies?: DocumentSessionDependencies;
};

export function parseMcpArguments(
  argv: unknown,
): Pick<DocumentToolsOptions, 'wasmPath' | 'ocrExecutable'> {
  const usage = 'Usage: hwpjs-mcp [--wasm PATH] [--ocr-executable PATH]';
  if (
    !Array.isArray(argv) ||
    !argv.every((value) => typeof value === 'string' && value.isWellFormed())
  )
    throw new TypeError(usage);
  const options: Pick<DocumentToolsOptions, 'wasmPath' | 'ocrExecutable'> = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index],
      value = argv[index + 1];
    if (typeof value !== 'string' || !value || value.includes('\0')) throw new TypeError(usage);
    if (flag === '--wasm' && options.wasmPath === undefined) options.wasmPath = value;
    else if (flag === '--ocr-executable' && options.ocrExecutable === undefined) {
      if (value.startsWith('--')) throw new TypeError(usage);
      validateMcpOcrExecutable(value);
      options.ocrExecutable = value;
    } else throw new TypeError(usage);
  }
  return options;
}

export function createMcpServer(options: McpServerOptions = {}) {
  const server = new McpServer({ name: 'hwpjs', version: publicPackage.version });
  const sessions = createDocumentSessionManager(options, {
    files: options.cliDependencies?.files,
    openDocument: options.cliDependencies?.engine?.openDocument,
    renderDocument: options.cliDependencies?.renderDocument,
    ...options.sessionDependencies,
  });
  const report = (error: unknown) =>
    server.server.onerror?.(error instanceof Error ? error : new Error(String(error)));
  const originalClose = server.close.bind(server);
  server.close = async () => {
    try {
      await sessions.dispose();
    } finally {
      await originalClose();
    }
  };
  server.server.onclose = () => {
    void sessions.dispose().catch(report);
  };
  const originalConnect = server.connect.bind(server);
  server.connect = async (...args) => {
    try {
      await originalConnect(...args);
    } catch (error) {
      await sessions.dispose();
      throw error;
    }
  };
  try {
    for (const tool of documentTools(options)) tool.register(server);
    for (const tool of documentSessionTools(sessions)) tool.register(server);
  } catch (error) {
    void sessions.dispose().catch(report);
    throw error;
  }
  return server;
}

// 공식 SDK가 프로토콜과 전송 수명을 소유하며 stdout은 MCP 전용입니다.
export function runMcpServer({
  transport,
  onerror,
  ...options
}: McpServerOptions & Pick<ServeStdioOptions, 'transport' | 'onerror'> = {}) {
  return serveStdio(() => createMcpServer(options), {
    ...(transport ? { transport } : {}),
    onerror:
      onerror ??
      ((error) => {
        process.stderr.write(`MCP transport error: ${JSON.stringify(describeMcpError(error))}\n`);
      }),
  });
}
