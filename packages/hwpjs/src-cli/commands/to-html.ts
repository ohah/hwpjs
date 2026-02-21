import { Command } from 'commander';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, resolve } from 'path';
// CLI는 빌드된 NAPI 모듈을 사용합니다
// @ts-ignore - 런타임에 dist/index.js에서 로드됨 (빌드 후 경로: ../../index)
const { toHtml } = require('../../index');

export function toHtmlCommand(program: Command) {
  program
    .command('to-html')
    .description('Convert HWP file to HTML')
    .argument('<input>', 'Input HWP file path')
    .option('-o, --output <file>', 'Output HTML file path (default: stdout)')
    .option('--images-dir <dir>', 'Directory to save images (default: images)')
    .option('--include-version', 'Include version information')
    .option('--include-page-info', 'Include page information')
    .action(
      (
        input: string,
        options: {
          output?: string;
          imagesDir?: string;
          includeVersion?: boolean;
          includePageInfo?: boolean;
        }
      ) => {
        try {
          // Read HWP file
          const data = readFileSync(input);

          // Determine image output directory
          let imageOutputDir: string | undefined;
          let htmlOutputDir: string | undefined;

          if (options.output) {
            htmlOutputDir = dirname(resolve(options.output));
            if (options.imagesDir) {
              // If images directory is specified, create it and use absolute path
              const imagesDir = resolve(htmlOutputDir, options.imagesDir);
              if (!existsSync(imagesDir)) {
                mkdirSync(imagesDir, { recursive: true });
              }
              imageOutputDir = imagesDir;
            }
            // If imagesDir is not specified, images will be embedded as base64
          }

          // Convert to HTML
          const html = toHtml(data, {
            image_output_dir: imageOutputDir,
            html_output_dir: htmlOutputDir,
            include_version: options.includeVersion,
            include_page_info: options.includePageInfo,
          });

          // Write output
          if (options.output) {
            writeFileSync(options.output, html, 'utf-8');
            console.log(`✓ Converted to HTML: ${options.output}`);
            if (imageOutputDir) {
              console.log(`  Images saved to: ${imageOutputDir}/`);
            } else {
              console.log(`  Images embedded as base64 data URIs`);
            }
          } else {
            console.log(html);
          }
        } catch (error) {
          console.error('Error:', error instanceof Error ? error.message : String(error));
          process.exit(1);
        }
      }
    );
}
