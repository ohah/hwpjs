import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { documentTools } from './tools.mjs';

export function parseMcpArguments(argv) {
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

export function createMcpServer(options = {}) {
  const server = new McpServer({ name: 'hwpjs', version: '0.0.0' });
  for (const { name, config, invoke } of documentTools(options))
    server.registerTool(name, config, invoke);
  return server;
}

/** Official SDK owns framing, negotiation and transport lifetime. The entry
 * passes its own URL so bundled mcp.mjs uses the adjacent canonical WASM.
 * CLI stdout/stderr are captured by tools; stdout here is exclusively MCP.
 */
export function runMcpServer({ transport, onerror, ...options } = {}) {
  return serveStdio(() => createMcpServer(options), {
    ...(transport ? { transport } : {}),
    onerror:
      onerror ??
      ((error) => {
        process.stderr.write(
          `MCP transport error: ${JSON.stringify(String(error?.message ?? error))}\n`,
        );
      }),
  });
}
