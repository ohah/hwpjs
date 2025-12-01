import { Command } from 'commander';
import { readFileSync, writeFileSync } from 'fs';
// CLI는 빌드된 NAPI 모듈을 사용합니다
// bin/hwpjs.js → dist/cli/index.js → dist/cli/commands/to-json.js
// dist/cli/commands/to-json.js에서 dist/index.js를 require합니다
// @ts-ignore - 런타임에 dist/index.js에서 로드됨 (빌드 후 경로: ../../index)
const { toJson } = require('../../index');

export function toJsonCommand(program: Command) {
  program
    .command('to-json')
    .description('Convert HWP file to JSON')
    .argument('<input>', 'Input HWP file path')
    .option('-o, --output <file>', 'Output JSON file path (default: stdout)')
    .option('--pretty', 'Pretty print JSON')
    .action((input: string, options: { output?: string; pretty?: boolean }) => {
      try {
        // Read HWP file
        const data = readFileSync(input);

        // Convert to JSON
        const jsonString = toJson(data);

        // Parse and format if needed
        let output: string;
        if (options.pretty) {
          const json = JSON.parse(jsonString);
          output = JSON.stringify(json, null, 2);
        } else {
          output = jsonString;
        }

        // Write output
        if (options.output) {
          writeFileSync(options.output, output, 'utf-8');
          console.log(`✓ Converted to JSON: ${options.output}`);
        } else {
          console.log(output);
        }
      } catch (error) {
        console.error('Error:', error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}
