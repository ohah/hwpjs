"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toHtmlCommand = toHtmlCommand;
const fs_1 = require("fs");
const path_1 = require("path");
// CLI는 빌드된 NAPI 모듈을 사용합니다
// @ts-ignore - 런타임에 dist/index.js에서 로드됨 (빌드 후 경로: ../../index)
const { toHtml } = require('../../index');
function toHtmlCommand(program) {
    program
        .command('to-html')
        .description('Convert HWP file to HTML')
        .argument('<input>', 'Input HWP file path')
        .option('-o, --output <file>', 'Output HTML file path (default: stdout)')
        .option('--images-dir <dir>', 'Directory to save images (default: images)')
        .option('--include-version', 'Include version information')
        .option('--include-page-info', 'Include page information')
        .action((input, options) => {
        try {
            // Read HWP file
            const data = (0, fs_1.readFileSync)(input);
            // Determine image output directory
            let imageOutputDir;
            let htmlOutputDir;
            if (options.output) {
                htmlOutputDir = (0, path_1.dirname)((0, path_1.resolve)(options.output));
                if (options.imagesDir) {
                    // If images directory is specified, create it and use absolute path
                    const imagesDir = (0, path_1.resolve)(htmlOutputDir, options.imagesDir);
                    if (!(0, fs_1.existsSync)(imagesDir)) {
                        (0, fs_1.mkdirSync)(imagesDir, { recursive: true });
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
                (0, fs_1.writeFileSync)(options.output, html, 'utf-8');
                console.log(`✓ Converted to HTML: ${options.output}`);
                if (imageOutputDir) {
                    console.log(`  Images saved to: ${imageOutputDir}/`);
                }
                else {
                    console.log(`  Images embedded as base64 data URIs`);
                }
            }
            else {
                console.log(html);
            }
        }
        catch (error) {
            console.error('Error:', error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
    });
}
