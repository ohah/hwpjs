#!/bin/bash

# 배포 패키지에 포함될 파일들의 용량을 체크하는 스크립트

set -e

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

PACKAGE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PACKAGE_DIR"

echo -e "${BLUE}📦 Checking package size...${NC}\n"

# package.json 확인
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ package.json not found${NC}"
    exit 1
fi

# package.json의 files 필드를 기반으로 파일 목록 수집
echo -e "${GREEN}📋 Analyzing files to be included...${NC}\n"

# 결과 파싱 및 출력
node -e "
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 색상 코드 정의 (Node.js 내부에서)
const RED = '\x1b[0;31m';
const GREEN = '\x1b[0;32m';
const YELLOW = '\x1b[1;33m';
const BLUE = '\x1b[0;34m';
const CYAN = '\x1b[0;36m';
const NC = '\x1b[0m';

let files = [];

try {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const filePatterns = pkg.files || [];
  
  // 기본 파일들
  const defaultFiles = ['package.json', 'README.md', 'LICENSE'];
  defaultFiles.forEach(f => {
    if (fs.existsSync(f)) {
      files.push({ path: f });
    }
  });
  
  // package.json의 files 필드에 명시된 파일들
  const singleFiles = ['index.d.ts', 'index.js', 'browser.js', 'react-native.config.js'];
  singleFiles.forEach(f => {
    if (fs.existsSync(f)) {
      files.push({ path: f });
    }
  });
  
  // podspec 파일들
  try {
    const podspecFiles = execSync('find . -maxdepth 1 -name \"*.podspec\" 2>/dev/null', { encoding: 'utf8' });
    podspecFiles.split('\\n').forEach(file => {
      if (file && file.trim()) {
        files.push({ path: file.trim().replace(/^\\.\\//, '') });
      }
    });
  } catch (e) {
    // 무시
  }
  
  // 주요 디렉토리에서 파일 수집 (package.json의 files 필드 기반)
  const dirs = ['dist', 'android', 'ios', 'cpp'];
  
  dirs.forEach(item => {
    if (fs.existsSync(item)) {
      if (fs.statSync(item).isDirectory()) {
        // 디렉토리 내 파일 수집 (제외 패턴 적용)
        try {
          const result = execSync('find \"' + item + '\" -type f ! -path \"*/build/*\" ! -path \"*/.gradle/*\" ! -path \"*/gradle/*\" ! -path \"*/Pods/*\" ! -path \"*/.git/*\" ! -path \"*/__tests__/*\" ! -path \"*/__fixtures__/*\" ! -path \"*/__mocks__/*\" ! -name \".*\" 2>/dev/null', { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
          result.split('\\n').forEach(file => {
            if (file && file.trim()) {
              files.push({ path: file.trim().replace(/^\\.\\//, '') });
            }
          });
        } catch (e) {
          // find 실패 시 무시
        }
      }
    }
  });
} catch (e) {
  console.error(RED + '❌ Failed to collect files: ' + e.message + NC);
  process.exit(1);
}

if (files.length === 0) {
  console.log(YELLOW + '⚠️  No files found in package' + NC);
  process.exit(0);
}

let totalSize = 0;
const dirSizes = {};
const fileSizes = {};
const archSizes = {};

files.forEach(file => {
  const filePath = file.path;
  if (!fs.existsSync(filePath)) return;
  
  const stats = fs.statSync(filePath);
  const size = stats.size;
  totalSize += size;
  
  const dir = path.dirname(filePath);
  if (!dirSizes[dir]) dirSizes[dir] = 0;
  dirSizes[dir] += size;
  
  // 큰 파일들 추적 (1MB 이상)
  if (size > 1024 * 1024) {
    fileSizes[filePath] = size;
  }
  
  // 아키텍처별 크기 추적
  if (filePath.includes('android/src/main/jni/libs/')) {
    const match = filePath.match(/libs\/([^\/]+)\//);
    if (match) {
      const arch = match[1];
      if (!archSizes[arch]) archSizes[arch] = 0;
      archSizes[arch] += size;
    }
  }
});

// 디렉토리별 크기 출력
console.log(CYAN + '📊 Directory sizes (top 10):' + NC + '\\n');
const sortedDirs = Object.entries(dirSizes)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10);

sortedDirs.forEach(([dir, size]) => {
  const sizeMB = (size / 1024 / 1024).toFixed(2);
  const sizeKB = (size / 1024).toFixed(0);
  const sizeStr = size > 1024 * 1024 ? sizeMB + ' MB' : sizeKB + ' KB';
  console.log(\`  \${dir.padEnd(50)} \${sizeStr}\`);
});

// 큰 파일들 출력
if (Object.keys(fileSizes).length > 0) {
  console.log('\\n' + YELLOW + '📁 Large files (>1MB, top 20):' + NC + '\\n');
  Object.entries(fileSizes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .forEach(([file, size]) => {
      const sizeMB = (size / 1024 / 1024).toFixed(2);
      console.log(\`  \${file.padEnd(60)} \${sizeMB} MB\`);
    });
}

// Android 아키텍처별 크기
if (Object.keys(archSizes).length > 0) {
  console.log('\\n' + BLUE + '📱 Android architectures:' + NC + '\\n');
  Object.entries(archSizes)
    .sort((a, b) => b[1] - a[1])
    .forEach(([arch, size]) => {
      const sizeMB = (size / 1024 / 1024).toFixed(2);
      console.log(\`  \${arch.padEnd(20)} \${sizeMB} MB\`);
    });
}

// 총 크기 출력
const totalMB = (totalSize / 1024 / 1024).toFixed(2);
const totalGB = (totalSize / 1024 / 1024 / 1024).toFixed(2);

const separator = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
console.log('\\n' + BLUE + separator + NC);
if (totalSize > 1024 * 1024 * 1024) {
  console.log(GREEN + 'Total package size: ' + totalGB + ' GB (' + totalMB + ' MB)' + NC);
} else {
  console.log(GREEN + 'Total package size: ' + totalMB + ' MB' + NC);
}
console.log(CYAN + 'Total files: ' + files.length + NC);
console.log(BLUE + separator + NC + '\\n');

// 경고 메시지
if (totalSize > 250 * 1024 * 1024) {
  console.log(RED + '⚠️  ERROR: Package size exceeds npm limit (250MB)' + NC);
  process.exit(1);
} else if (totalSize > 100 * 1024 * 1024) {
  console.log(YELLOW + '⚠️  WARNING: Package size is large (>100MB). Consider optimization.' + NC);
  console.log(YELLOW + '   See CONTRIBUTING.md for optimization tips.' + NC + '\\n');
} else {
  console.log(GREEN + '✓ Package size is within acceptable range' + NC + '\\n');
}
"

echo -e "${GREEN}✓ Package size check completed${NC}"

