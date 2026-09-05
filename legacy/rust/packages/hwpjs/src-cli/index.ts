#!/usr/bin/env node

import { readFileSync } from 'fs';
import path from 'path';
import { Command } from 'commander';
import { toJsonCommand } from './commands/to-json';
import { toMarkdownCommand } from './commands/to-markdown';
import { toHtmlCommand } from './commands/to-html';
// to-pdf 비활성화 (확장만 해둠)
// import { toPdfCommand } from './commands/to-pdf';
import { infoCommand } from './commands/info';
import { extractImagesCommand } from './commands/extract-images';
import { batchCommand } from './commands/batch';

const program = new Command();

const packageJsonPath = path.join(__dirname, '../../package.json');
const version =
  (JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as { version?: string }).version ?? '0.0.0';
program.name('hwpjs').description('HWP/HWPX file parser CLI').version(version);

// Register commands
toJsonCommand(program);
toMarkdownCommand(program);
toHtmlCommand(program);
// toPdfCommand(program);
infoCommand(program);
extractImagesCommand(program);
batchCommand(program);

program.parse();
