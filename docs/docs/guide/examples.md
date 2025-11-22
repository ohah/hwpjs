# 예제

HWPJS를 사용하는 다양한 예제를 확인하세요.

## 기본 예제

### 파일 경로로 파싱

```typescript
import { parseHwp } from '@ohah/hwpjs';

const result = parseHwp('./document.hwp');
console.log(result);
```

### 에러 처리

```typescript
import { parseHwp } from '@ohah/hwpjs';

try {
  const result = parseHwp('./document.hwp');
  console.log('파싱 성공:', result);
} catch (error) {
  if (error instanceof Error) {
    console.error('파싱 실패:', error.message);
  }
}
```

## Node.js 예제

### 여러 파일 일괄 처리

```typescript
import { parseHwp } from '@ohah/hwpjs';
import { readdirSync } from 'fs';
import { join } from 'path';

const hwpFiles = readdirSync('./documents')
  .filter(file => file.endsWith('.hwp'))
  .map(file => join('./documents', file));

hwpFiles.forEach(file => {
  try {
    const result = parseHwp(file);
    console.log(`${file} 파싱 완료:`, result);
  } catch (error) {
    console.error(`${file} 파싱 실패:`, error);
  }
});
```

### 비동기 처리

```typescript
import { parseHwp } from '@ohah/hwpjs';
import { promisify } from 'util';

async function parseHwpAsync(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const result = parseHwp(filePath);
      resolve(result);
    } catch (error) {
      reject(error);
    }
  });
}

// 사용 예제
async function main() {
  try {
    const result = await parseHwpAsync('./document.hwp');
    console.log(result);
  } catch (error) {
    console.error('에러:', error);
  }
}

main();
```

## 테스트 예제

실제 테스트 코드에서 사용하는 예제입니다.

```typescript
import { test, expect } from 'bun:test';
import { parseHwp } from '@ohah/hwpjs';

test('parseHwp should parse HWP file', () => {
  const result = parseHwp('test.hwp');
  expect(result).toBe('Hello from hwp-core!');
});
```

## 참고

더 많은 예제는 프로젝트의 [examples 디렉토리](https://github.com/ohah/hwpjs/tree/main/examples)를 확인하세요.

