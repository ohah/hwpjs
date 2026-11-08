import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { documentTools, describeMcpError } from './tools.ts';
import type { DocumentToolsOptions } from './tools.ts';
import type { ServeStdioOptions } from '@modelcontextprotocol/server/stdio';

export function parseMcpArguments(argv: unknown): { wasmPath?: string } {
  if (
    !Array.isArray(argv) ||
    !argv.every((value) => typeof value === 'string' && value.isWellFormed())
  )
    throw new TypeError('Usage: hwpjs-mcp [--wasm PATH]');
  if (argv.length === 0) return {};
  if (argv.length !== 2 || argv[0] !== '--wasm' || !argv[1] || argv[1].includes('\0'))
    throw new TypeError('Usage: hwpjs-mcp [--wasm PATH]');
  return { wasmPath: argv[1] };
}

export function createMcpServer(options: DocumentToolsOptions = {}) {
  const server = new McpServer({ name: 'hwpjs', version: '0.0.0' });
  for (const tool of documentTools(options)) tool.register(server);
  return server;
}

// 공식 SDK가 프로토콜과 전송 수명을 소유하며 stdout은 MCP 전용입니다.
export function runMcpServer({
  transport,
  onerror,
  ...options
}: DocumentToolsOptions & Pick<ServeStdioOptions, 'transport' | 'onerror'> = {}) {
  return serveStdio(() => createMcpServer(options), {
    ...(transport ? { transport } : {}),
    onerror:
      onerror ??
      ((error) => {
        process.stderr.write(`MCP transport error: ${JSON.stringify(describeMcpError(error))}\n`);
      }),
  });
}
