# toJson

HWP 파일을 JSON 형식으로 변환하는 함수입니다.

## 시그니처

```typescript
function toJson(data: Buffer): string
```

## 매개변수

### `data: Buffer`

변환할 HWP 파일의 바이트 배열입니다 (Buffer 또는 Uint8Array).

**예제:**
```typescript
import { readFileSync } from 'fs';
const fileBuffer = readFileSync('./document.hwp');
const data = new Uint8Array(fileBuffer);
```

## 반환값

### `string`

변환된 HWP 문서의 JSON 문자열입니다.

## 예제

### 기본 사용법

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
  console.log(result);
} catch (error) {
  console.error('변환 실패:', error);
}
```

## 에러

HWP 파일 형식이 올바르지 않거나 변환에 실패한 경우 에러가 발생합니다.

- HWP 파일 형식이 올바르지 않은 경우
- 파일이 손상된 경우
- JSON 직렬화에 실패한 경우

## 참고

이 함수는 Rust로 구현된 `hwp-core` 라이브러리를 사용하여 HWP 파일을 파싱하고 JSON으로 변환합니다.

