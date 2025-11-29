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
import { ReactNative } from '@ohah/hwpjs';
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
    const result = ReactNative.hwp_parser(numberArray);
    console.log('파싱 결과:', result);
  } catch (error) {
    console.error('HWP 파일 파싱 실패:', error);
  }
}
```

### React 컴포넌트에서 사용

```typescript
import { useEffect, useState } from 'react';
import { ReactNative } from '@ohah/hwpjs';
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
        const result = ReactNative.hwp_parser(numberArray);
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

## 참고

더 많은 예제는 프로젝트의 [examples 디렉토리](https://github.com/ohah/hwpjs/tree/main/examples)를 확인하세요.

