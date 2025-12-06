#!/usr/bin/env node

import { Command } from 'commander';
import { toJsonCommand } from './commands/to-json';
import { toMarkdownCommand } from './commands/to-markdown';
import { infoCommand } from './commands/info';
import { extractImagesCommand } from './commands/extract-images';
import { batchCommand } from './commands/batch';

const program = new Command();

program.name('hwpjs').description('HWP file parser CLI').version('0.1.0-rc.3');

// Register commands
toJsonCommand(program);
toMarkdownCommand(program);
infoCommand(program);
extractImagesCommand(program);
batchCommand(program);

program.parse();
