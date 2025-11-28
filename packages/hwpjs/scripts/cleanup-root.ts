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

// 루트 디렉토리의 .wasm 파일 정리
const wasmFiles = files.filter((file) => file.endsWith('.wasm') && file.startsWith('hwpjs.'));
for (const file of wasmFiles) {
  const filePath = join(rootDir, file);
  unlinkSync(filePath);
  console.log(`✓ Removed ${file} from root`);
}

console.log('✓ Root cleanup completed');
