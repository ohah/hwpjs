"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractImagesCommand = extractImagesCommand;
const fs_1 = require("fs");
const path_1 = require("path");
// CLI는 빌드된 NAPI 모듈을 사용합니다
// @ts-ignore - 런타임에 dist/index.js에서 로드됨 (빌드 후 경로: ../../index)
const { toMarkdown } = require('../../index');
function extractImagesCommand(program) {
    program
        .command('extract-images')
        .description('Extract images from HWP file')
        .argument('<input>', 'Input HWP file path')
        .option('-o, --output-dir <dir>', 'Output directory for images (default: ./images)', './images')
        .option('--format <format>', 'Image format filter (jpg, png, bmp, or all)', 'all')
        .action((input, options) => {
        try {
            // Read HWP file
            const data = (0, fs_1.readFileSync)(input);
            // Convert to Markdown with blob images
            const result = toMarkdown(data, {
                image: 'blob',
            });
            if (result.images.length === 0) {
                console.log('No images found in HWP file');
                return;
            }
            // Create output directory
            const outputDir = options.outputDir || './images';
            if (!(0, fs_1.existsSync)(outputDir)) {
                (0, fs_1.mkdirSync)(outputDir, { recursive: true });
            }
            // Filter images by format if specified
            const formatFilter = options.format?.toLowerCase();
            const imagesToExtract = formatFilter === 'all'
                ? result.images
                : result.images.filter((img) => img.format.toLowerCase() === formatFilter);
            if (imagesToExtract.length === 0) {
                console.log(`No images found with format: ${formatFilter}`);
                return;
            }
            // Extract images
            let extractedCount = 0;
            for (const image of imagesToExtract) {
                const extension = image.format || 'jpg';
                const filename = `${image.id}.${extension}`;
                const filepath = (0, path_1.join)(outputDir, filename);
                (0, fs_1.writeFileSync)(filepath, image.data);
                extractedCount++;
                console.log(`✓ Extracted: ${filepath} (${image.data.length} bytes)`);
            }
            console.log(`\n✓ Extracted ${extractedCount} image(s) to ${outputDir}`);
        }
        catch (error) {
            console.error('Error:', error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
    });
}
