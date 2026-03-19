import { Command } from 'commander';
import { readFileSync } from 'fs';
// CLI는 빌드된 NAPI 모듈을 사용합니다
// @ts-ignore - 런타임에 dist/index.js에서 로드됨 (빌드 후 경로: ../../index)
const { fileHeader, toJson, hwpxToJson, detect } = require('../../index');

export function infoCommand(program: Command) {
  program
    .command('info')
    .description('Display HWP/HWPX file information')
    .argument('<input>', 'Input HWP/HWPX file path')
    .option('--json', 'Output as JSON')
    .action((input: string, options: { json?: boolean }) => {
      try {
        const data = readFileSync(input);
        const format = detect(data);

        if (format === 'hwpx') {
          const fullJson = hwpxToJson(data);
          const document = JSON.parse(fullJson);

          if (options.json) {
            console.log(JSON.stringify({
              format: 'hwpx',
              sections: document.sections?.length || 0,
              paragraphs: document.sections?.reduce(
                (sum: number, s: any) => sum + (s.paragraphs?.length || 0), 0
              ) || 0,
            }, null, 2));
          } else {
            console.log('HWPX File Information');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log(`Format: HWPX`);
            console.log(`Sections: ${document.sections?.length || 0}`);
            const paraCount = document.sections?.reduce(
              (sum: number, s: any) => sum + (s.paragraphs?.length || 0), 0
            ) || 0;
            console.log(`Paragraphs: ${paraCount}`);
          }
        } else {
          const headerJson = fileHeader(data);
          const header = JSON.parse(headerJson);

          if (options.json) {
            const fullJson = toJson(data);
            const document = JSON.parse(fullJson);
            console.log(JSON.stringify({
              format: 'hwp',
              header,
              pageCount: document.sections?.[0]?.paragraphs?.length || 0,
              hasImages: document.bin_data?.items?.length > 0,
              imageCount: document.bin_data?.items?.length || 0,
            }, null, 2));
          } else {
            console.log('HWP File Information');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log(`Format: HWP`);
            console.log(`Version: ${header.version}`);
            console.log(`Compressed: ${header.compressed ? 'Yes' : 'No'}`);
            console.log(`Encrypted: ${header.encrypted ? 'Yes' : 'No'}`);

            try {
              const fullJson = toJson(data);
              const document = JSON.parse(fullJson);
              const imageCount = document.bin_data?.items?.length || 0;
              console.log(`Images: ${imageCount}`);
            } catch {
              // Ignore errors when parsing full document
            }
          }
        }
      } catch (error) {
        console.error('Error:', error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}
