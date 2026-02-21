#!/usr/bin/env node
/**
 * Noto Sans KR 폰트를 다운로드해 packages/hwpjs/fonts/에 넣습니다.
 * PDF 변환 시 한글이 깨지지 않도록 기본 포함용입니다. (OFL 1.1)
 *
 * 출처: https://github.com/google/fonts/tree/main/ofl/notosanskr
 */
import { createWriteStream, mkdirSync, existsSync } from 'fs';
import { get as httpsGet } from 'https';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FONTS_DIR = join(__dirname, '..', 'fonts');
const URL = 'https://github.com/google/fonts/raw/main/ofl/notosanskr/NotoSansKR%5Bwght%5D.ttf';
const OUT_FILE = join(FONTS_DIR, 'NotoSansKR-Regular.ttf');

if (!existsSync(FONTS_DIR)) {
  mkdirSync(FONTS_DIR, { recursive: true });
}

console.log('Downloading Noto Sans KR (variable → Regular)...');
console.log(URL);

await new Promise((resolve, reject) => {
  const file = createWriteStream(OUT_FILE);
  httpsGet(URL, (res) => {
    if (res.statusCode === 302 || res.statusCode === 301) {
      httpsGet(res.headers.location, (r) => r.pipe(file).on('finish', resolve)).on('error', reject);
      return;
    }
    res.pipe(file).on('finish', resolve);
  }).on('error', (err) => {
    file.close();
    reject(err);
  });
});

console.log('Saved:', OUT_FILE);
