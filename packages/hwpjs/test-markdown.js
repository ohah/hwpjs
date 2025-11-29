const { readFileSync } = require('fs');
const { join } = require('path');
const { parseHwpToMarkdown } = require('./dist/index.js');

const fixturesPath = join(__dirname, '../../examples/fixtures');
const nooriHwpPath = join(fixturesPath, 'noori.hwp');

console.log('Testing parseHwpToMarkdown with base64 option...\n');

try {
  const hwpData = readFileSync(nooriHwpPath);

  // Test with base64 option
  console.log('=== Base64 Option Test ===');
  const resultBase64 = parseHwpToMarkdown(hwpData, { image: 'base64' });

  console.log('Images array length:', resultBase64.images.length);
  console.log('Markdown contains "data:image/":', resultBase64.markdown.includes('data:image/'));
  console.log('Markdown contains "base64,":', resultBase64.markdown.includes('base64,'));
  console.log('Markdown contains "image-0":', resultBase64.markdown.includes('image-0'));

  // Find first image reference in markdown
  const imageMatch = resultBase64.markdown.match(/!\[이미지\]\(([^)]+)\)/);
  if (imageMatch) {
    console.log('\nFirst image reference:', imageMatch[1].substring(0, 100));
    console.log('Is base64 URI:', imageMatch[1].startsWith('data:image/'));
  }

  console.log('\n=== Blob Option Test ===');
  const resultBlob = parseHwpToMarkdown(hwpData, { image: 'blob' });

  console.log('Images array length:', resultBlob.images.length);
  console.log('Markdown contains "image-0":', resultBlob.markdown.includes('image-0'));
  console.log('Markdown contains "data:image/":', resultBlob.markdown.includes('data:image/'));

  if (resultBlob.images.length > 0) {
    console.log('First image ID:', resultBlob.images[0].id);
    console.log('First image format:', resultBlob.images[0].format);
  }
} catch (error) {
  console.error('Error:', error);
  process.exit(1);
}
