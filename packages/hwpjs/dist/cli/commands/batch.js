"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.batchCommand = batchCommand;
const fs_1 = require("fs");
const path_1 = require("path");
// CLI는 빌드된 NAPI 모듈을 사용합니다
// @ts-ignore - 런타임에 dist/index.js에서 로드됨 (빌드 후 경로: ../../index)
const { toJson, toMarkdown } = require('../../index');
function batchCommand(program) {
    program
        .command('batch')
        .description('Batch convert HWP files in a directory')
        .argument('<input-dir>', 'Input directory containing HWP files')
        .option('-o, --output-dir <dir>', 'Output directory (default: ./output)', './output')
        .option('--format <format>', 'Output format (json or markdown)', 'json')
        .option('-r, --recursive', 'Process subdirectories recursively')
        .option('--pretty', 'Pretty print JSON (only for json format)')
        .option('--include-images', 'Include images as base64 (only for markdown format)')
        .action((inputDir, options) => {
        try {
            const outputDir = options.outputDir || './output';
            const format = options.format || 'json';
            // Create output directory
            if (!require('fs').existsSync(outputDir)) {
                (0, fs_1.mkdirSync)(outputDir, { recursive: true });
            }
            // Find all HWP files
            const hwpFiles = [];
            function findHwpFiles(dir, basePath = '') {
                const entries = (0, fs_1.readdirSync)(dir);
                for (const entry of entries) {
                    const fullPath = (0, path_1.join)(dir, entry);
                    const stat = (0, fs_1.statSync)(fullPath);
                    if (stat.isDirectory() && options.recursive) {
                        findHwpFiles(fullPath, (0, path_1.join)(basePath, entry));
                    }
                    else if (stat.isFile() && (0, path_1.extname)(entry).toLowerCase() === '.hwp') {
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
                    const fileName = (0, path_1.basename)(filePath, '.hwp');
                    const data = (0, fs_1.readFileSync)(filePath);
                    let outputContent;
                    let outputExt;
                    if (format === 'json') {
                        const jsonString = toJson(data);
                        if (options.pretty) {
                            const json = JSON.parse(jsonString);
                            outputContent = JSON.stringify(json, null, 2);
                        }
                        else {
                            outputContent = jsonString;
                        }
                        outputExt = 'json';
                    }
                    else {
                        const result = toMarkdown(data, {
                            image: options.includeImages ? 'base64' : 'blob',
                        });
                        outputContent = result.markdown;
                        outputExt = 'md';
                    }
                    const outputPath = (0, path_1.join)(outputDir, `${fileName}.${outputExt}`);
                    (0, fs_1.writeFileSync)(outputPath, outputContent, 'utf-8');
                    console.log(`✓ ${filePath} → ${outputPath}`);
                    successCount++;
                }
                catch (error) {
                    console.error(`✗ ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
                    errorCount++;
                }
            }
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log(`✓ Success: ${successCount}`);
            if (errorCount > 0) {
                console.log(`✗ Errors: ${errorCount}`);
            }
        }
        catch (error) {
            console.error('Error:', error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
    });
}
