import { readFileSync } from 'fs';
import { join } from 'path';
import { toMarkdown } from '@ohah/hwpjs';

/**
 * toMarkdown 이미지 옵션 테스트
 */
function testMarkdownImageOptions() {
  try {
    // 예제 HWP 파일 경로
    const hwpFilePath = join(process.cwd(), 'noori.hwp');
    const fileBuffer = readFileSync(hwpFilePath);

    console.log('Testing toMarkdown with image options...\n');

    // Test with base64 option
    console.log('=== Base64 Option Test ===');
    const resultBase64 = toMarkdown(fileBuffer, { image: 'base64' });

    console.log('Images array length:', resultBase64.images.length);
    console.log('Markdown contains "data:image/":', resultBase64.markdown.includes('data:image/'));
    console.log('Markdown contains "base64,":', resultBase64.markdown.includes('base64,'));
    console.log('Markdown contains "image-0":', resultBase64.markdown.includes('image-0'));

    // Find first image reference in markdown
    const imageMatch = resultBase64.markdown.match(/!\[이미지\]\(([^)]+)\)/);
    if (imageMatch) {
      console.log('\nFirst image reference (first 100 chars):', imageMatch[1].substring(0, 100));
      console.log('Is base64 URI:', imageMatch[1].startsWith('data:image/'));
    }

    // Show a sample of markdown
    const sampleStart = resultBase64.markdown.indexOf('![이미지]');
    if (sampleStart !== -1) {
      console.log('\nSample markdown around first image:');
      console.log(resultBase64.markdown.substring(Math.max(0, sampleStart - 50), sampleStart + 200));
    }

    console.log('\n=== Blob Option Test ===');
    const resultBlob = toMarkdown(fileBuffer, { image: 'blob' });

    console.log('Images array length:', resultBlob.images.length);
    console.log('Markdown contains "image-0":', resultBlob.markdown.includes('image-0'));
    console.log('Markdown contains "data:image/":', resultBlob.markdown.includes('data:image/'));

    if (resultBlob.images.length > 0) {
      console.log('First image ID:', resultBlob.images[0].id);
      console.log('First image format:', resultBlob.images[0].format);
      console.log('First image data length:', resultBlob.images[0].data.length);
    }

    // Show a sample of markdown
    const blobSampleStart = resultBlob.markdown.indexOf('![이미지]');
    if (blobSampleStart !== -1) {
      console.log('\nSample markdown around first image:');
      console.log(resultBlob.markdown.substring(Math.max(0, blobSampleStart - 50), blobSampleStart + 100));
    }

    console.log('\n=== Default Option Test (should be blob) ===');
    const resultDefault = toMarkdown(fileBuffer);

    console.log('Images array length:', resultDefault.images.length);
    console.log('Markdown contains "image-0":', resultDefault.markdown.includes('image-0'));
    console.log('Markdown contains "data:image/":', resultDefault.markdown.includes('data:image/'));

    // Summary
    console.log('\n=== Summary ===');
    console.log('Base64 option: images array should be empty, markdown should contain base64 URIs');
    console.log('Blob option: images array should have items, markdown should contain placeholders');
    console.log('Default: should behave like blob option');

  } catch (error) {
    console.error('Error:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Stack trace:', error.stack);
    }
    process.exit(1);
  }
}

testMarkdownImageOptions();

