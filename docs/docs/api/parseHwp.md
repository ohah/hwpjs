# parseHwp

:::warning
이 API는 현재 개발 중이며, 지원 예정입니다.
:::

HWP 파일을 파싱하여 내용을 반환하는 함수입니다.

## 시그니처

```typescript
function parseHwp(path: string): string
```

## 매개변수

### `path: string`

파싱할 HWP 파일의 경로입니다.

**예제:**
- `'./document.hwp'` - 상대 경로
- `'/path/to/document.hwp'` - 절대 경로

## 반환값

### `string`

파싱된 HWP 파일의 내용을 문자열로 반환합니다.

현재는 placeholder 구현으로 `"Hello from hwp-core!"`를 반환합니다.

## 예제

### 기본 사용법

```typescript
import { parseHwp } from '@ohah/hwpjs';

const result = parseHwp('./document.hwp');
console.log(result);
// 출력: "Hello from hwp-core!"
```

### 에러 처리

```typescript
import { parseHwp } from '@ohah/hwpjs';

try {
  const result = parseHwp('./document.hwp');
  console.log(result);
} catch (error) {
  console.error('파싱 실패:', error);
}
```

## 에러

파일을 읽을 수 없거나 파싱에 실패한 경우 에러가 발생합니다.

- 파일이 존재하지 않는 경우
- 파일 경로가 잘못된 경우
- HWP 파일 형식이 올바르지 않은 경우

## 참고

이 함수는 Rust로 구현된 `hwp-core` 라이브러리를 사용하여 HWP 파일을 파싱합니다.

