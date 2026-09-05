import { Command } from 'commander';
import { readdirSync, readFileSync, writeFileSync, statSync, mkdirSync } from 'fs';
import { join, extname, basename } from 'path';
// CLI는 빌드된 NAPI 모듈을 사용합니다
// @ts-ignore - 런타임에 dist/index.js에서 로드됨 (빌드 후 경로: ../../index)
const {
  toJson,
  toMarkdown,
  toHtml,
  hwpxToJson,
  hwpxToHtml,
  hwpxToMarkdown,
  detect,
} = require('../../index');

export function batchCommand(program: Command) {
  program
    .command('batch')
    .description('Batch convert HWP/HWPX files in a directory')
    .argument('<input-dir>', 'Input directory containing HWP/HWPX files')
    .option('-o, --output-dir <dir>', 'Output directory (default: ./output)', './output')
    .option('--format <format>', 'Output format (json, markdown, html)', 'json')
    .option('-r, --recursive', 'Process subdirectories recursively')
    .option('--pretty', 'Pretty print JSON (only for json format)')
    .option('--include-images', 'Include images as base64 (only for markdown format)')
    .option(
      '--images-dir <dir>',
      'Directory to save images (only for html format, default: images)'
    )
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
        }
      ) => {
        try {
          const outputDir = options.outputDir || './output';
          const format = options.format || 'json';

          if (!require('fs').existsSync(outputDir)) {
            mkdirSync(outputDir, { recursive: true });
          }

          // Find all HWP/HWPX files
          const files: string[] = [];

          function findFiles(dir: string) {
            const entries = readdirSync(dir);
            for (const entry of entries) {
              const fullPath = join(dir, entry);
              const stat = statSync(fullPath);
              if (stat.isDirectory() && options.recursive) {
                findFiles(fullPath);
              } else if (stat.isFile()) {
                const ext = extname(entry).toLowerCase();
                if (ext === '.hwp' || ext === '.hwpx') {
                  files.push(fullPath);
                }
              }
            }
          }

          findFiles(inputDir);

          if (files.length === 0) {
            console.log('No HWP/HWPX files found in the specified directory');
            return;
          }

          console.log(`Found ${files.length} file(s)`);
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

          let successCount = 0;
          let errorCount = 0;

          for (const filePath of files) {
            try {
              const ext = extname(filePath).toLowerCase();
              const fileName = basename(filePath, ext);
              const data = readFileSync(filePath);
              const fileFormat = detect(data);
              const isHwpx = fileFormat === 'hwpx';

              let outputContent: string;
              let outputExt: string;

              if (format === 'json') {
                const jsonString = isHwpx ? hwpxToJson(data) : toJson(data);
                if (options.pretty) {
                  const json = JSON.parse(jsonString);
                  outputContent = JSON.stringify(json, null, 2);
                } else {
                  outputContent = jsonString;
                }
                outputExt = 'json';
              } else if (format === 'html') {
                let imageOutputDir: string | undefined;
                if (options.imagesDir) {
                  const imagesDir = join(outputDir, options.imagesDir);
                  if (!require('fs').existsSync(imagesDir)) {
                    mkdirSync(imagesDir, { recursive: true });
                  }
                  imageOutputDir = imagesDir;
                }
                outputContent = isHwpx
                  ? hwpxToHtml(data, { image_output_dir: imageOutputDir })
                  : toHtml(data, { image_output_dir: imageOutputDir, html_output_dir: outputDir });
                outputExt = 'html';
              } else {
                const result = isHwpx
                  ? hwpxToMarkdown(data, {})
                  : toMarkdown(data, { image: options.includeImages ? 'base64' : 'blob' });
                outputContent = result.markdown;
                outputExt = 'md';
              }

              const outputPath = join(outputDir, `${fileName}.${outputExt}`);
              writeFileSync(outputPath, outputContent, 'utf-8');

              console.log(`✓ ${filePath} (${fileFormat.toUpperCase()}) → ${outputPath}`);
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
