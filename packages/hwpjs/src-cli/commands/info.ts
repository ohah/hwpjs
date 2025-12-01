import { Command } from 'commander';
import { readFileSync } from 'fs';
// CLI는 빌드된 NAPI 모듈을 사용합니다
// @ts-ignore - 런타임에 dist/index.js에서 로드됨 (빌드 후 경로: ../../index)
const { fileHeader, toJson } = require('../../index');

export function infoCommand(program: Command) {
  program
    .command('info')
    .description('Display HWP file information')
    .argument('<input>', 'Input HWP file path')
    .option('--json', 'Output as JSON')
    .action((input: string, options: { json?: boolean }) => {
      try {
        // Read HWP file
        const data = readFileSync(input);

        // Get file header
        const headerJson = fileHeader(data);
        const header = JSON.parse(headerJson);

        if (options.json) {
          // Get full document info
          const fullJson = toJson(data);
          const document = JSON.parse(fullJson);

          console.log(
            JSON.stringify(
              {
                header,
                pageCount: document.sections?.[0]?.paragraphs?.length || 0,
                hasImages: document.bin_data?.items?.length > 0,
                imageCount: document.bin_data?.items?.length || 0,
              },
              null,
              2
            )
          );
        } else {
          // Human-readable output
          console.log('HWP File Information');
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          console.log(`Version: ${header.version}`);
          console.log(`Compressed: ${header.compressed ? 'Yes' : 'No'}`);
          console.log(`Encrypted: ${header.encrypted ? 'Yes' : 'No'}`);
          if (header.distributed_doc_version) {
            console.log(`Distributed Doc Version: ${header.distributed_doc_version}`);
          }

          // Get full document for additional info
          try {
            const fullJson = toJson(data);
            const document = JSON.parse(fullJson);
            const imageCount = document.bin_data?.items?.length || 0;
            console.log(`Images: ${imageCount}`);
          } catch {
            // Ignore errors when parsing full document
          }
        }
      } catch (error) {
        console.error('Error:', error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}
