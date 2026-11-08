#!/usr/bin/env node
import { runMcpServer, parseMcpArguments } from './mcp/server.ts';
import { describeMcpError } from './mcp/tools.ts';

try {
  runMcpServer({ ...parseMcpArguments(process.argv.slice(2)), mainModuleURL: import.meta.url });
} catch (error) {
  process.stderr.write(`error: ${JSON.stringify(describeMcpError(error))}\n`);
  process.exitCode = 2;
}
