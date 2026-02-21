import { Command } from 'commander';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
// CLI는 빌드된 NAPI 모듈을 사용합니다
// @ts-ignore - 런타임에 dist/index.js에서 로드됨 (빌드 후 경로: ../../index)
const { toPdf } = require('../../index');

export function toPdfCommand(program: Command) {
  program
    .command('to-pdf')
    .description('Convert HWP file to PDF')
    .argument('<input>', 'Input HWP file path')
    .option('-o, --output <file>', 'Output PDF file path (required)')
    .option('--font-dir <dir>', 'Directory containing TTF/OTF fonts (e.g. LiberationSans)')
    .option('--no-embed-images', 'Do not embed images in PDF')
    .action(
      (
        input: string,
        options: {
          output?: string;
          fontDir?: string;
          embedImages?: boolean;
        }
      ) => {
        try {
          if (!options.output) {
            console.error('Error: -o, --output <file> is required for to-pdf');
            process.exit(1);
          }
          const data = readFileSync(input);
          const pdf = toPdf(data, {
            font_dir: options.fontDir,
            embed_images: options.embedImages,
          });
          const outputPath = resolve(options.output);
          writeFileSync(outputPath, pdf);
          console.log(`✓ Converted to PDF: ${outputPath}`);
        } catch (error) {
          console.error('Error:', error instanceof Error ? error.message : String(error));
          process.exit(1);
        }
      }
    );
}
