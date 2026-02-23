import { unlinkSync, readdirSync } from 'fs';
import { join } from 'path';

const rootDir = process.cwd();

// prepublish 시 루트로 복사된 .node/.wasm만 제거 (커밋 방지)
// dist/ 는 건드리지 않음 — 로컬 실행·테스트에서 바인딩 로드에 필요
const files = readdirSync(rootDir);
const nodeFiles = files.filter((file) => file.endsWith('.node') && file.startsWith('hwpjs.'));
for (const file of nodeFiles) {
  const filePath = join(rootDir, file);
  unlinkSync(filePath);
  console.log(`✓ Removed ${file} from root`);
}

const wasmFiles = files.filter((file) => file.endsWith('.wasm') && file.startsWith('hwpjs.'));
for (const file of wasmFiles) {
  const filePath = join(rootDir, file);
  unlinkSync(filePath);
  console.log(`✓ Removed ${file} from root`);
}

console.log('✓ Root cleanup completed');
