#!/usr/bin/env node

if (process.argv[2] === 'mcp') {
  process.argv.splice(2, 1);
  await import(new URL('./mcp.mjs', import.meta.url).href);
} else {
  await import(new URL('./cli.mjs', import.meta.url).href);
}
