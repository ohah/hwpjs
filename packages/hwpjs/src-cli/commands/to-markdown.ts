import { Command } from 'commander';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname, resolve } from 'path';
// CLI는 빌드된 NAPI 모듈을 사용합니다
// @ts-ignore - 런타임에 dist/index.js에서 로드됨 (빌드 후 경로: ../../index)
const { toMarkdown } = require('../../index');

export function toMarkdownCommand(program: Command) {
  program
    .command('to-markdown')
    .description('Convert HWP file to Markdown')
    .argument('<input>', 'Input HWP file path')
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
          // Read HWP file
          const data = readFileSync(input);

          // Convert to Markdown
          const result = toMarkdown(data, {
            image: options.includeImages ? 'base64' : 'blob',
            use_html: options.useHtml,
            include_version: options.includeVersion,
            include_page_info: options.includePageInfo,
          });

          let finalMarkdown = result.markdown;
          let imagesSaved = 0;

          // Save images to files if not using base64
          if (!options.includeImages && result.images.length > 0 && options.output) {
            // Determine images directory
            const outputDir = dirname(resolve(options.output));
            const imagesDir = options.imagesDir
              ? resolve(outputDir, options.imagesDir)
              : join(outputDir, 'images');

            // Create images directory if it doesn't exist
            if (!existsSync(imagesDir)) {
              mkdirSync(imagesDir, { recursive: true });
            }

            // Save each image and update markdown references
            for (const image of result.images) {
              // Generate filename from image ID
              // image-0 -> BIN0001.jpg (or use original ID if available)
              const fileName = image.id.startsWith('image-')
                ? `BIN${String(parseInt(image.id.replace('image-', '')) + 1).padStart(4, '0')}.${image.format}`
                : `${image.id}.${image.format}`;

              const imagePath = join(imagesDir, fileName);
              writeFileSync(imagePath, image.data);
              imagesSaved++;

              // Replace placeholder with relative path
              // Calculate relative path from markdown file to image
              const relativePath = options.imagesDir
                ? join(options.imagesDir, fileName).replace(/\\/g, '/')
                : join('images', fileName).replace(/\\/g, '/');

              // Replace image-0 with actual path
              const placeholder = `![이미지](${image.id})`;
              const replacement = `![이미지](${relativePath})`;
              finalMarkdown = finalMarkdown.replace(placeholder, replacement);
            }
          }

          // Write output
          if (options.output) {
            writeFileSync(options.output, finalMarkdown, 'utf-8');
            console.log(`✓ Converted to Markdown: ${options.output}`);
            if (imagesSaved > 0) {
              const imagesDir = options.imagesDir || 'images';
              console.log(`✓ Saved ${imagesSaved} image(s) to: ${imagesDir}/`);
            } else if (result.images.length > 0 && options.includeImages) {
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
