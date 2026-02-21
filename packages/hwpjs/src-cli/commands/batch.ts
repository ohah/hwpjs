import { Command } from 'commander';
import { readdirSync, readFileSync, writeFileSync, statSync, mkdirSync, existsSync } from 'fs';
import { join, extname, basename, resolve, dirname } from 'path';
// CLI는 빌드된 NAPI 모듈을 사용합니다
// @ts-ignore - 런타임에 dist/index.js에서 로드됨 (빌드 후 경로: ../../index)
const { toJson, toMarkdown, toHtml, toPdf } = require('../../index');

/** PDF용 기본 폰트 디렉터리: 옵션 → cwd/fonts → 패키지 fonts (한글 Noto Sans KR 등). */
function getDefaultFontDir(fontDir?: string): string | undefined {
  if (fontDir) return fontDir;
  const cwdFonts = resolve(process.cwd(), 'fonts');
  if (existsSync(cwdFonts)) return cwdFonts;
  try {
    const pkgRoot = dirname(require.resolve('@ohah/hwpjs/package.json'));
    const bundled = join(pkgRoot, 'fonts');
    if (existsSync(bundled)) return bundled;
  } catch {
    /* 패키지가 로컬 경로로 로드된 경우 등 무시 */
  }
  return undefined;
}

export function batchCommand(program: Command) {
  program
    .command('batch')
    .description('Batch convert HWP files in a directory')
    .argument('<input-dir>', 'Input directory containing HWP files')
    .option('-o, --output-dir <dir>', 'Output directory (default: ./output)', './output')
    .option('--format <format>', 'Output format (json, markdown, html, pdf)', 'json')
    .option('-r, --recursive', 'Process subdirectories recursively')
    .option('--pretty', 'Pretty print JSON (only for json format)')
    .option('--include-images', 'Include images as base64 (only for markdown format)')
    .option(
      '--images-dir <dir>',
      'Directory to save images (only for html format, default: images)'
    )
    .option(
      '--font-dir <dir>',
      'Font directory for PDF (TTF/OTF). If omitted, ./fonts is used when it exists'
    )
    .option('--no-embed-images', 'Do not embed images in PDF (only for pdf format)')
    .action(
      (
        inputDir: string,
        options: {
          outputDir?: string;
          format?: string;
          recursive?: boolean;
          pretty?: boolean;
          includeImages?: boolean;
          imagesDir?: string;
          fontDir?: string;
          embedImages?: boolean;
        }
      ) => {
        try {
          const outputDir = options.outputDir || './output';
          const format = options.format || 'json';

          // Create output directory
          if (!require('fs').existsSync(outputDir)) {
            mkdirSync(outputDir, { recursive: true });
          }

          // Find all HWP files
          const hwpFiles: string[] = [];

          function findHwpFiles(dir: string, basePath: string = '') {
            const entries = readdirSync(dir);

            for (const entry of entries) {
              const fullPath = join(dir, entry);
              const stat = statSync(fullPath);

              if (stat.isDirectory() && options.recursive) {
                findHwpFiles(fullPath, join(basePath, entry));
              } else if (stat.isFile() && extname(entry).toLowerCase() === '.hwp') {
                hwpFiles.push(fullPath);
              }
            }
          }

          findHwpFiles(inputDir);

          if (hwpFiles.length === 0) {
            console.log('No HWP files found in the specified directory');
            return;
          }

          console.log(`Found ${hwpFiles.length} HWP file(s)`);
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

          let successCount = 0;
          let errorCount = 0;

          // Process each file
          for (const filePath of hwpFiles) {
            try {
              const fileName = basename(filePath, '.hwp');
              const data = readFileSync(filePath);

              let outputContent: string | Buffer;
              let outputExt: string;
              let isBinary = false;

              if (format === 'json') {
                const jsonString = toJson(data);
                if (options.pretty) {
                  const json = JSON.parse(jsonString);
                  outputContent = JSON.stringify(json, null, 2);
                } else {
                  outputContent = jsonString;
                }
                outputExt = 'json';
              } else if (format === 'html') {
                // Determine image output directory for HTML
                let imageOutputDir: string | undefined;
                if (options.imagesDir) {
                  const imagesDir = join(outputDir, options.imagesDir);
                  if (!require('fs').existsSync(imagesDir)) {
                    mkdirSync(imagesDir, { recursive: true });
                  }
                  imageOutputDir = imagesDir;
                }
                // If imagesDir is not specified, images will be embedded as base64
                outputContent = toHtml(data, {
                  image_output_dir: imageOutputDir,
                  html_output_dir: outputDir,
                });
                outputExt = 'html';
              } else if (format === 'pdf') {
                const fontDir = getDefaultFontDir(options.fontDir);
                outputContent = toPdf(data, {
                  font_dir: fontDir,
                  embed_images: options.embedImages,
                });
                outputExt = 'pdf';
                isBinary = true;
              } else {
                const result = toMarkdown(data, {
                  image: options.includeImages ? 'base64' : 'blob',
                });
                outputContent = result.markdown;
                outputExt = 'md';
              }

              const outputPath = join(outputDir, `${fileName}.${outputExt}`);
              writeFileSync(outputPath, outputContent, isBinary ? undefined : 'utf-8');

              console.log(`✓ ${filePath} → ${outputPath}`);
              successCount++;
            } catch (error) {
              console.error(
                `✗ ${filePath}: ${error instanceof Error ? error.message : String(error)}`
              );
              errorCount++;
            }
          }

          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          console.log(`✓ Success: ${successCount}`);
          if (errorCount > 0) {
            console.log(`✗ Errors: ${errorCount}`);
          }
        } catch (error) {
          console.error('Error:', error instanceof Error ? error.message : String(error));
          process.exit(1);
        }
      }
    );
}
