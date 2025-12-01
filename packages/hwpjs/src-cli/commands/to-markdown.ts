import { Command } from 'commander';
import { readFileSync, writeFileSync } from 'fs';
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
    .option('--use-html', 'Use HTML tags (e.g., <br> in tables)')
    .option('--include-version', 'Include version information')
    .option('--include-page-info', 'Include page information')
    .action(
      (
        input: string,
        options: {
          output?: string;
          includeImages?: boolean;
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

          // Write output
          if (options.output) {
            writeFileSync(options.output, result.markdown, 'utf-8');
            console.log(`✓ Converted to Markdown: ${options.output}`);
            if (result.images.length > 0 && !options.includeImages) {
              console.log(
                `  Note: ${result.images.length} images extracted (use --include-images to embed them)`
              );
            }
          } else {
            console.log(result.markdown);
          }
        } catch (error) {
          console.error('Error:', error instanceof Error ? error.message : String(error));
          process.exit(1);
        }
      }
    );
}
