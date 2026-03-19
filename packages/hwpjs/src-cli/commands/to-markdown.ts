import { Command } from 'commander';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname, resolve } from 'path';
// CLI는 빌드된 NAPI 모듈을 사용합니다
// @ts-ignore - 런타임에 dist/index.js에서 로드됨 (빌드 후 경로: ../../index)
const { toMarkdown, hwpxToMarkdown, detect } = require('../../index');

export function toMarkdownCommand(program: Command) {
  program
    .command('to-markdown')
    .description('Convert HWP/HWPX file to Markdown')
    .argument('<input>', 'Input HWP/HWPX file path')
    .option('-o, --output <file>', 'Output Markdown file path (default: stdout)')
    .option('--include-images', 'Include images as base64 data URIs')
    .option('--images-dir <dir>', 'Directory to save images (default: images)')
    .option('--use-html', 'Use HTML tags (e.g., <br> in tables)')
    .option('--include-version', 'Include version information')
    .option('--include-page-info', 'Include page information')
    .action(
      (
        input: string,
        options: {
          output?: string;
          includeImages?: boolean;
          imagesDir?: string;
          useHtml?: boolean;
          includeVersion?: boolean;
          includePageInfo?: boolean;
        }
      ) => {
        try {
          const data = readFileSync(input);
          const format = detect(data);

          let result: { markdown: string; images: any[] };
          if (format === 'hwpx') {
            result = hwpxToMarkdown(data, {
              use_html: options.useHtml,
              include_version: options.includeVersion,
              include_page_info: options.includePageInfo,
            });
          } else {
            result = toMarkdown(data, {
              image: options.includeImages ? 'base64' : 'blob',
              use_html: options.useHtml,
              include_version: options.includeVersion,
              include_page_info: options.includePageInfo,
            });
          }

          let finalMarkdown = result.markdown;
          let imagesSaved = 0;

          // Save images to files if not using base64
          if (!options.includeImages && result.images && result.images.length > 0 && options.output) {
            const outputDir = dirname(resolve(options.output));
            const imagesDir = options.imagesDir
              ? resolve(outputDir, options.imagesDir)
              : join(outputDir, 'images');

            if (!existsSync(imagesDir)) {
              mkdirSync(imagesDir, { recursive: true });
            }

            for (const image of result.images) {
              const fileName = image.id.startsWith('image-')
                ? `BIN${String(parseInt(image.id.replace('image-', '')) + 1).padStart(4, '0')}.${image.format}`
                : `${image.id}.${image.format}`;

              const imagePath = join(imagesDir, fileName);
              writeFileSync(imagePath, image.data);
              imagesSaved++;

              const relativePath = options.imagesDir
                ? join(options.imagesDir, fileName).replace(/\\/g, '/')
                : join('images', fileName).replace(/\\/g, '/');

              const placeholder = `![이미지](${image.id})`;
              const replacement = `![이미지](${relativePath})`;
              finalMarkdown = finalMarkdown.replace(placeholder, replacement);
            }
          }

          if (options.output) {
            writeFileSync(options.output, finalMarkdown, 'utf-8');
            console.log(`✓ Converted ${format.toUpperCase()} to Markdown: ${options.output}`);
            if (imagesSaved > 0) {
              const imagesDir = options.imagesDir || 'images';
              console.log(`✓ Saved ${imagesSaved} image(s) to: ${imagesDir}/`);
            } else if (result.images && result.images.length > 0 && options.includeImages) {
              console.log(`  Note: ${result.images.length} image(s) embedded as base64`);
            }
          } else {
            console.log(finalMarkdown);
          }
        } catch (error) {
          console.error('Error:', error instanceof Error ? error.message : String(error));
          process.exit(1);
        }
      }
    );
}
