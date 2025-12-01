# 예제

HWPJS를 사용하는 다양한 예제를 확인하세요.

## 기본 예제

### 파일 경로로 파싱

```typescript
import { readFileSync } from 'fs';
import { toJson } from '@ohah/hwpjs';

const fileBuffer = readFileSync('./document.hwp');
const data = new Uint8Array(fileBuffer);
const result = toJson(data);
console.log(result);
```

### 에러 처리

```typescript
import { readFileSync } from 'fs';
import { toJson } from '@ohah/hwpjs';

try {
  const fileBuffer = readFileSync('./document.hwp');
  const data = new Uint8Array(fileBuffer);
  const result = toJson(data);
  console.log('변환 성공:', result);
} catch (error) {
  if (error instanceof Error) {
    console.error('변환 실패:', error.message);
  }
}
```

## Node.js 예제

### 여러 파일 일괄 처리

```typescript
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { toJson } from '@ohah/hwpjs';

const hwpFiles = readdirSync('./documents')
  .filter(file => file.endsWith('.hwp'))
  .map(file => join('./documents', file));

hwpFiles.forEach(file => {
  try {
    const fileBuffer = readFileSync(file);
    const data = new Uint8Array(fileBuffer);
    const result = toJson(data);
    console.log(`${file} 변환 완료:`, result);
  } catch (error) {
    console.error(`${file} 변환 실패:`, error);
  }
});
```

### 비동기 처리

```typescript
import { readFileSync } from 'fs';
import { toJson } from '@ohah/hwpjs';

async function toJsonAsync(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const fileBuffer = readFileSync(filePath);
      const data = new Uint8Array(fileBuffer);
      const result = toJson(data);
      resolve(result);
    } catch (error) {
      reject(error);
    }
  });
}

// 사용 예제
async function main() {
  try {
    const result = await toJsonAsync('./document.hwp');
    console.log(result);
  } catch (error) {
    console.error('에러:', error);
  }
}

main();
```

## React Native 예제

### 기본 사용법

```typescript
import { Hwpjs } from '@ohah/hwpjs';
import RNFS from 'react-native-fs';
import { Platform } from 'react-native';

async function loadHwpFile() {
  try {
    // 파일 경로 설정 (플랫폼별)
    let filePath: string;
    if (Platform.OS === 'ios') {
      filePath = `${RNFS.MainBundlePath}/document.hwp`;
    } else {
      filePath = `${RNFS.DocumentDirectoryPath}/document.hwp`;
    }

    // 파일 존재 확인
    const exists = await RNFS.exists(filePath);
    if (!exists) {
      console.error('파일을 찾을 수 없습니다:', filePath);
      return;
    }

    // 파일을 base64로 읽기
    const fileData = await RNFS.readFile(filePath, 'base64');

    // base64를 number[]로 변환
    const numberArray = [...Uint8Array.from(atob(fileData), (c) => c.charCodeAt(0))];

    // HWP 파일 파싱
    const result = Hwpjs.toJson(numberArray);
    console.log('파싱 결과:', result);
  } catch (error) {
    console.error('HWP 파일 파싱 실패:', error);
  }
}
```

### React 컴포넌트에서 사용

```typescript
import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { Hwpjs } from '@ohah/hwpjs';
import RNFS from 'react-native-fs';

function HwpViewer() {
  const [hwpData, setHwpData] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadHwpFile = async () => {
      try {
        const filePath = `${RNFS.DocumentDirectoryPath}/document.hwp`;
        const fileData = await RNFS.readFile(filePath, 'base64');
        const numberArray = [...Uint8Array.from(atob(fileData), (c) => c.charCodeAt(0))];
        const result = Hwpjs.toJson(numberArray);
        setHwpData(result);
      } catch (error) {
        console.error('파싱 실패:', error);
      } finally {
        setLoading(false);
      }
    };

    loadHwpFile();
  }, []);

  if (loading) return <Text>로딩 중...</Text>;
  if (!hwpData) return <Text>파일을 읽을 수 없습니다.</Text>;

  return <Text>{hwpData}</Text>;
}
```

## Web 예제

### 기본 사용법

Web 환경에서는 WASM을 사용하기 위해 `buffer-polyfill.ts`를 먼저 import해야 합니다.

```typescript
// main.tsx 또는 진입점 파일에서 가장 먼저 import
import './buffer-polyfill';
import * as hwpjs from '@ohah/hwpjs';

// 파일 입력에서 HWP 파일 읽기
const fileInput = document.querySelector('input[type="file"]');
fileInput.addEventListener('change', async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;

  const arrayBuffer = await file.arrayBuffer();
  const data = new Uint8Array(arrayBuffer);

  // JSON으로 변환
  const jsonResult = hwpjs.toJson(data);
  console.log(jsonResult);

  // 마크다운으로 변환
  const markdownResult = hwpjs.toMarkdown(data, {
    image: 'base64', // 또는 'blob'
    useHtml: true,
    includeVersion: true,
    includePageInfo: false,
  });
  console.log(markdownResult.markdown);
});
```

### buffer-polyfill.ts 파일 생성

프로젝트에 `buffer-polyfill.ts` 파일을 생성하고 다음 내용을 추가하세요:

```typescript
// Buffer polyfill for napi-rs WASM compatibility
// This must be imported before any WASM modules
if (typeof globalThis.Buffer === 'undefined') {
  globalThis.Buffer = class Buffer extends Uint8Array {
    static from(data: any) {
      if (data instanceof Uint8Array) return data;
      if (data instanceof ArrayBuffer) return new Uint8Array(data);
      if (Array.isArray(data)) return new Uint8Array(data);
      return new Uint8Array(data);
    }
    static isBuffer(obj: any) {
      return obj instanceof Uint8Array;
    }
  } as any;
}

// Ensure Buffer is set on window as well for compatibility
if (typeof window !== 'undefined' && typeof window.Buffer === 'undefined') {
  (window as any).Buffer = globalThis.Buffer;
}
```

## 테스트 예제

실제 테스트 코드에서 사용하는 예제입니다.

```typescript
import { test, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { toJson } from '@ohah/hwpjs';

test('toJson should convert HWP file to JSON', () => {
  const fileBuffer = readFileSync('test.hwp');
  const data = new Uint8Array(fileBuffer);
  const result = toJson(data);
  const parsed = JSON.parse(result);
  expect(parsed).toHaveProperty('file_header');
});
```

## CLI 예제

명령줄에서 직접 HWP 파일을 변환할 수 있습니다.

### 기본 사용법

```bash
# 전역 설치
npm install -g @ohah/hwpjs

# JSON 변환
hwpjs to-json document.hwp -o output.json --pretty

# Markdown 변환
hwpjs to-markdown document.hwp -o output.md --include-images

# 파일 정보 확인
hwpjs info document.hwp

# 이미지 추출
hwpjs extract-images document.hwp -o ./images

# 배치 변환
hwpjs batch ./documents -o ./output --format json --recursive
```

### 스크립트에서 사용

```bash
#!/bin/bash
# 모든 HWP 파일을 JSON으로 변환
for file in *.hwp; do
  hwpjs to-json "$file" -o "${file%.hwp}.json" --pretty
done
```

더 자세한 내용은 [CLI 가이드](./cli)를 참고하세요.

## 참고

더 많은 예제는 프로젝트의 [examples 디렉토리](https://github.com/ohah/hwpjs/tree/main/examples)를 확인하세요.

