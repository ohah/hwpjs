# fileHeader

HWP 파일의 FileHeader만 추출하여 JSON 형식으로 반환하는 함수입니다.

## 시그니처

```typescript
function fileHeader(data: Buffer): string
```

## 매개변수

### `data: Buffer`

HWP 파일의 바이트 배열입니다 (Buffer 또는 Uint8Array).

**예제:**
```typescript
import { readFileSync } from 'fs';
const fileBuffer = readFileSync('./document.hwp');
const data = new Uint8Array(fileBuffer);
```

## 반환값

### `string`

FileHeader 정보를 담은 JSON 문자열입니다.

FileHeader에는 다음 정보가 포함됩니다:
- 시그니처 (signature)
- 버전 정보 (version)
- 압축 여부 (is_compressed)
- 암호화 여부 (is_encrypted)
- 기타 문서 속성

## 예제

### 기본 사용법

```typescript
import { readFileSync } from 'fs';
import { fileHeader } from '@ohah/hwpjs';

const fileBuffer = readFileSync('./document.hwp');
const data = new Uint8Array(fileBuffer);
const result = fileHeader(data);
const header = JSON.parse(result);

console.log('버전:', header.version);
console.log('압축 여부:', header.is_compressed);
console.log('암호화 여부:', header.is_encrypted);
```

### 에러 처리

```typescript
import { readFileSync } from 'fs';
import { fileHeader } from '@ohah/hwpjs';

try {
  const fileBuffer = readFileSync('./document.hwp');
  const data = new Uint8Array(fileBuffer);
  const result = fileHeader(data);
  const header = JSON.parse(result);
  console.log('FileHeader:', header);
} catch (error) {
  console.error('FileHeader 추출 실패:', error);
}
```

## 에러

HWP 파일 형식이 올바르지 않거나 FileHeader를 읽을 수 없는 경우 에러가 발생합니다.

- HWP 파일 형식이 올바르지 않은 경우
- 파일이 손상된 경우
- FileHeader 스트림을 읽을 수 없는 경우

## 참고

이 함수는 전체 문서를 파싱하지 않고 FileHeader만 빠르게 추출합니다. 문서의 메타데이터만 필요한 경우에 유용합니다.

