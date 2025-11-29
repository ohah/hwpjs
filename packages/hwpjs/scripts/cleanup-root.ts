import { unlinkSync, readdirSync } from 'fs';
import { join } from 'path';

const rootDir = process.cwd();

// 루트 디렉토리의 .node 파일 정리
const files = readdirSync(rootDir);
const nodeFiles = files.filter((file) => file.endsWith('.node') && file.startsWith('hwpjs.'));
for (const file of nodeFiles) {
  const filePath = join(rootDir, file);
  unlinkSync(filePath);
  console.log(`✓ Removed ${file} from root`);
}
// dist 폴더의 .node 파일도 정리
const distDir = join(rootDir, 'dist');
const distFiles = readdirSync(distDir);
const distNodeFiles = distFiles.filter((file) => file.endsWith('.node'));
for (const file of distNodeFiles) {
  const filePath = join(distDir, file);
  unlinkSync(filePath);
  console.log(`✓ Removed dist/${file}`);
}

// 루트 디렉토리의 .wasm 파일 정리
const wasmFiles = files.filter((file) => file.endsWith('.wasm') && file.startsWith('hwpjs.'));
for (const file of wasmFiles) {
  const filePath = join(rootDir, file);
  unlinkSync(filePath);
  console.log(`✓ Removed ${file} from root`);
}

// dist 폴더의 .wasm 파일도 정리
const distWasmFiles = distFiles.filter((file) => file.endsWith('.wasm'));
for (const file of distWasmFiles) {
  const filePath = join(distDir, file);
  unlinkSync(filePath);
  console.log(`✓ Removed dist/${file}`);
}

console.log('✓ Root cleanup completed');
