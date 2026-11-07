#!/usr/bin/env node
import { runMcpServer, parseMcpArguments } from './mcp/server.mjs';

try {
  runMcpServer({ ...parseMcpArguments(process.argv.slice(2)), mainModuleURL: import.meta.url });
} catch (error) {
  process.stderr.write(`error: ${JSON.stringify(String(error?.message ?? error))}\n`);
  process.exitCode = 2;
}
