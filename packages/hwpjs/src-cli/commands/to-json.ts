import { Command } from 'commander';
import { readFileSync, writeFileSync } from 'fs';
// CLI는 빌드된 NAPI 모듈을 사용합니다
// @ts-ignore - 런타임에 dist/index.js에서 로드됨 (빌드 후 경로: ../../index)
const { toJson, hwpxToJson, detect } = require('../../index');

export function toJsonCommand(program: Command) {
  program
    .command('to-json')
    .description('Convert HWP/HWPX file to JSON')
    .argument('<input>', 'Input HWP/HWPX file path')
    .option('-o, --output <file>', 'Output JSON file path (default: stdout)')
    .option('--pretty', 'Pretty print JSON')
    .action((input: string, options: { output?: string; pretty?: boolean }) => {
      try {
        const data = readFileSync(input);
        const format = detect(data);

        let jsonString: string;
        if (format === 'hwpx') {
          jsonString = hwpxToJson(data);
        } else {
          jsonString = toJson(data);
        }

        let output: string;
        if (options.pretty) {
          const json = JSON.parse(jsonString);
          output = JSON.stringify(json, null, 2);
        } else {
          output = jsonString;
        }

        if (options.output) {
          writeFileSync(options.output, output, 'utf-8');
          console.log(`✓ Converted ${format.toUpperCase()} to JSON: ${options.output}`);
        } else {
          console.log(output);
        }
      } catch (error) {
        console.error('Error:', error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}
