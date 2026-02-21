import { Command } from 'commander';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, relative, isAbsolute } from 'path';
// CLI는 빌드된 NAPI 모듈을 사용합니다
// @ts-ignore - 런타임에 dist/index.js에서 로드됨 (빌드 후 경로: ../../index)
const { toPdf } = require('../../index');

/** 출력 경로가 cwd 하위인지 검사. path traversal 방지. */
function isOutputUnderCwd(outputPath: string): boolean {
  const cwd = process.cwd();
  const rel = relative(cwd, outputPath);
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}

export function toPdfCommand(program: Command) {
  program
    .command('to-pdf')
    .description('Convert HWP file to PDF')
    .argument('<input>', 'Input HWP file path')
    .option('-o, --output <file>', 'Output PDF file path (required, must be under current directory)')
    .option(
      '--font-dir <dir>',
      'Directory containing TTF/OTF fonts. If omitted, ./fonts is used when it exists'
    )
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
          const outputPath = resolve(options.output);
          if (!isOutputUnderCwd(outputPath)) {
            console.error(
              'Error: --output path must be under the current directory (path traversal not allowed)'
            );
            process.exit(1);
          }
          const data = readFileSync(input);
          const fontDir =
            options.fontDir ||
            (existsSync(resolve(process.cwd(), 'fonts')) ? resolve(process.cwd(), 'fonts') : undefined);
          const pdf = toPdf(data, {
            font_dir: fontDir,
            embed_images: options.embedImages,
          });
          writeFileSync(outputPath, pdf);
          console.log(`✓ Converted to PDF: ${outputPath}`);
        } catch (error) {
          console.error('Error:', error instanceof Error ? error.message : String(error));
          process.exit(1);
        }
      }
    );
}
