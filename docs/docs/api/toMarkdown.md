# toMarkdown

HWP 문서를 마크다운 형식으로 변환하는 함수입니다.

## 시그니처

```typescript
function toMarkdown(data: Buffer, options?: ToMarkdownOptions): ToMarkdownResult
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

### `options?: ToMarkdownOptions`

마크다운 변환 옵션입니다 (선택 사항).

```typescript
interface ToMarkdownOptions {
  /** 이미지 형식: 'base64'는 마크다운에 base64 데이터 URI를 직접 포함, 'blob'은 별도 ImageData 배열로 반환 (기본값: 'blob') */
  image?: 'base64' | 'blob';
  /** HTML 태그 사용 여부 (true인 경우 테이블 등 개행 불가 영역에 <br> 태그 사용) */
  useHtml?: boolean;
  /** 버전 정보 포함 여부 */
  includeVersion?: boolean;
  /** 페이지 정보 포함 여부 */
  includePageInfo?: boolean;
  /** 이미지를 파일로 저장할 디렉토리 경로 (선택) */
  imageOutputDir?: string;
}
```

## 반환값

### `ToMarkdownResult`

변환된 마크다운 문자열과 이미지 데이터를 포함하는 객체입니다.

**Web/Node.js:**
```typescript
interface ToMarkdownResult {
  /** 이미지 참조가 포함된 마크다운 문자열 */
  markdown: string;
  /** 추출된 이미지 데이터 (image: 'blob' 옵션 사용 시) */
  images: ImageData[];
}

interface ImageData {
  /** 이미지 ID (예: "image-0") */
  id: string;
  /** 이미지 데이터 (Uint8Array) */
  data: Buffer;
  /** 이미지 형식 (예: "jpg", "png", "bmp") */
  format: string;
}
```

**React Native:**
```typescript
interface ToMarkdownResult {
  /** 이미지 참조가 포함된 마크다운 문자열 */
  markdown: string;
  // 주의: React Native에서는 images 필드가 지원되지 않습니다.
  // 이미지는 base64 데이터 URI로 마크다운에 직접 포함됩니다.
}
```

:::warning
**플랫폼별 차이점:**
- **Web/Node.js**: `image: 'blob'` 옵션 사용 시 `images` 배열에 `ImageData` 객체가 포함됩니다.
- **React Native**: `images` 필드가 지원되지 않으며, 이미지는 항상 base64 데이터 URI로 마크다운에 직접 포함됩니다.
:::

다음 내용이 포함됩니다:

- 문서 제목 및 버전 정보 (옵션에 따라)
- 본문 텍스트
- 표 (Table) - 마크다운 테이블 형식으로 변환
- 이미지 - base64 데이터 URI 또는 별도 이미지 배열
- 컨트롤 객체 (글상자 등)
- 페이지 구분선 (페이지 나누기 시, 옵션에 따라)

## 예제

### Web

Web 환경에서는 Buffer polyfill이 필요합니다. 자세한 설정 방법은 [설치하기 가이드](../guide/installation#web)를 참고하세요.

```typescript
import { toMarkdown } from '@ohah/hwpjs';

// 파일 입력을 통한 사용
const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
fileInput.addEventListener('change', async (event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;

  const arrayBuffer = await file.arrayBuffer();
  const data = new Uint8Array(arrayBuffer);

  // 마크다운으로 변환 (base64 이미지 포함)
  const result = toMarkdown(data, {
    image: 'base64',
    useHtml: false,
    includeVersion: false,
    includePageInfo: false,
  });

  console.log(result.markdown);
});
```

### Node.js

```typescript
import { readFileSync } from 'fs';
import { toMarkdown } from '@ohah/hwpjs';

// HWP 파일 읽기
const fileBuffer = readFileSync('./document.hwp');
const data = new Uint8Array(fileBuffer);

// 마크다운으로 변환 (base64 이미지 포함)
const result = toMarkdown(data, {
  image: 'base64', // 마크다운에 base64 데이터 URI 직접 포함
  useHtml: false,
  includeVersion: false,
  includePageInfo: false,
});

console.log(result.markdown);
// base64 옵션 사용 시: result.images는 빈 배열
```

### React Native

```typescript
import RNFS from 'react-native-fs';
import { Platform } from 'react-native';
import { Hwpjs } from '@ohah/hwpjs';

// 파일 경로 설정
const filePath = Platform.OS === 'ios'
  ? `${RNFS.MainBundlePath}/document.hwp`
  : `${RNFS.DocumentDirectoryPath}/document.hwp`;

// 파일 읽기
const fileData = await RNFS.readFile(filePath, 'base64');

// base64를 number[]로 변환
const numberArray = [...Uint8Array.from(atob(fileData), (c) => c.charCodeAt(0))];

// 마크다운으로 변환
const result = Hwpjs.toMarkdown(numberArray, {
  image: 'base64', // React Native에서는 base64만 지원
  useHtml: false,
  includeVersion: false,
  includePageInfo: false,
});

console.log(result.markdown);
// 주의: React Native에서는 result.images가 없습니다.
// 이미지는 base64 데이터 URI로 마크다운에 직접 포함됩니다.
```

### 이미지를 별도로 받기 (Web/Node.js만 지원)

:::warning
**React Native에서는 지원되지 않습니다.** React Native에서는 이미지가 항상 base64 데이터 URI로 마크다운에 직접 포함됩니다.
:::

```typescript
import { readFileSync } from 'fs';
import { toMarkdown } from '@ohah/hwpjs';

const fileBuffer = readFileSync('./document.hwp');
const data = new Uint8Array(fileBuffer);

// 마크다운으로 변환 (이미지를 별도 배열로 받기)
const result = toMarkdown(data, {
  image: 'blob', // 별도 ImageData 배열로 반환 (Web/Node.js만 지원)
  useHtml: true,
  includeVersion: true,
  includePageInfo: false,
});

console.log(result.markdown);
// result.images에 ImageData 배열 포함
// 마크다운에는 "![이미지](image-0)" 형식으로 참조됨
result.images.forEach((img) => {
  console.log(`이미지 ${img.id}: ${img.format} 형식, ${img.data.length} bytes`);
});
```

## 지원 기능

### 텍스트 추출

- 문단 텍스트 추출
- 제어 문자 제거
- 공백 정규화

### 컨트롤 객체

다음 컨트롤 객체가 감지되고 마크다운으로 변환됩니다:

- **표 (Table)**: 마크다운 테이블 형식으로 변환
- **이미지**: base64 데이터 URI 또는 별도 이미지 배열로 제공
- **그리기 개체 (Shape Object)**: 글상자 등
- **머리말/꼬리말 (Header/Footer)**: `*[머리말]*`, `*[꼬리말]*`
- **단 정의 (Column Definition)**: `*[단 정의]*`

## 출력 형식

```markdown
# HWP 문서

본문 내용이 여기에 표시됩니다.

| 열1 | 열2 | 열3 |
|-----|-----|-----|
| 셀1 | 셀2 | 셀3 |
| 셀4 | 셀5 | 셀6 |

![이미지](data:image/jpeg;base64,/9j/4AAQSkZJRg...)

또는 이미지를 별도로 받은 경우:

![이미지](image-0)

---

[다음 페이지 내용...]
```

### 옵션에 따른 출력 차이

- `includeVersion: true`: 문서 버전 정보가 포함됩니다.
- `includePageInfo: true`: 페이지 구분선이 포함됩니다.
- `useHtml: true`: 테이블 등 개행 불가 영역에 `<br>` 태그가 사용됩니다.
- `image: 'base64'`: 이미지가 마크다운에 base64 데이터 URI로 직접 포함됩니다.
- `image: 'blob'`: 이미지가 별도 배열로 반환되고, 마크다운에는 참조만 포함됩니다.

## 제한사항

1. **그리기 개체**: 일부 그리기 개체의 실제 내용은 추출되지 않을 수 있습니다.
2. **스타일링**: 글자 모양, 문단 모양 등의 서식 정보는 반영되지 않습니다.
3. **복잡한 레이아웃**: 일부 복잡한 레이아웃은 완벽하게 변환되지 않을 수 있습니다.

## 참고

- 이 함수는 Rust로 구현된 `hwp-core` 라이브러리를 사용하여 HWP 파일을 파싱하고 마크다운으로 변환합니다.
- 표 내용은 마크다운 테이블 형식으로 변환됩니다.
- 이미지는 base64 데이터 URI로 임베드하거나 별도 배열로 받을 수 있습니다.
