#!/usr/bin/env node
import { runCLI } from './main.ts';
process.exitCode = await runCLI(process.argv.slice(2), { mainModuleURL: import.meta.url });
