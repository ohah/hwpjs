# @ohah/hwpjs

HWP parser for Node.js, Web, and React Native

한글과컴퓨터의 한/글 문서 파일(.hwp)을 읽고 파싱하는 라이브러리입니다. Rust로 구현된 핵심 로직을 Node.js, Web, React Native 환경에서 사용할 수 있도록 제공합니다.

## 설치

```bash
npm install @ohah/hwpjs
# 또는
yarn add @ohah/hwpjs
# 또는
pnpm add @ohah/hwpjs
# 또는
bun add @ohah/hwpjs
```

## 사용법

### CLI (Command Line Interface)

명령줄에서 직접 HWP 파일을 변환할 수 있습니다:

```bash
# 전역 설치
npm install -g @ohah/hwpjs

# JSON 변환
hwpjs to-json document.hwp -o output.json --pretty

# Markdown 변환
hwpjs to-markdown document.hwp -o output.md --include-images

# PDF 변환 (폰트 디렉터리 지정 권장)
hwpjs to-pdf document.hwp -o output.pdf --font-dir ./fonts
# 이미지 미포함 PDF
hwpjs to-pdf document.hwp -o output.pdf --font-dir ./fonts --no-embed-images

# 파일 정보 확인
hwpjs info document.hwp

# 이미지 추출
hwpjs extract-images document.hwp -o ./images

# 배치 변환
hwpjs batch ./documents -o ./output --format json --recursive
# 배치 PDF 변환
hwpjs batch ./documents -o ./output --format pdf --font-dir ./fonts
```

더 자세한 내용은 [CLI 가이드](https://ohah.github.io/hwpjs/guide/cli)를 참고하세요.

### Node.js

```typescript
import { readFileSync } from 'fs';
import { toJson, toMarkdown, toPdf, fileHeader } from '@ohah/hwpjs';

// HWP 파일 읽기
const fileBuffer = readFileSync('./document.hwp');

// PDF로 변환 (font_dir에 TTF/OTF 폰트 디렉터리 지정)
const pdfBuffer = toPdf(fileBuffer, {
  font_dir: './fonts',
  embed_images: true,
});
require('fs').writeFileSync('./output.pdf', pdfBuffer);

// JSON으로 변환
const jsonString = toJson(fileBuffer);
const document = JSON.parse(jsonString);
console.log(document);

// Markdown으로 변환
const { markdown, images } = toMarkdown(fileBuffer, {
  image: 'blob', // 또는 'base64'
  use_html: true,
  include_version: true,
  include_page_info: true,
});

// FileHeader만 추출
const headerString = fileHeader(fileBuffer);
const header = JSON.parse(headerString);
console.log(header);
```

### Web (Browser)

```typescript
import { toJson, toMarkdown } from '@ohah/hwpjs';

// File input에서 HWP 파일 읽기
const fileInput = document.querySelector('input[type="file"]');
fileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  const arrayBuffer = await file.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);

  // JSON으로 변환
  const jsonString = toJson(uint8Array);
  const document = JSON.parse(jsonString);

  // Markdown으로 변환 (base64 이미지 포함)
  const { markdown } = toMarkdown(uint8Array, {
    image: 'base64',
  });

  // 결과 표시
  document.getElementById('output').innerHTML = markdown;
});
```

### React Native

```typescript
import { toJson, toMarkdown, toPdf } from '@ohah/hwpjs';
import * as FileSystem from 'expo-file-system';

// HWP 파일 읽기
const fileUri = 'file:///path/to/document.hwp';
const base64 = await FileSystem.readAsStringAsync(fileUri, {
  encoding: FileSystem.EncodingType.Base64,
});
const uint8Array = Uint8Array.from(atob(base64), c => c.charCodeAt(0));

// JSON으로 변환
const jsonString = toJson(uint8Array);
const document = JSON.parse(jsonString);

// Markdown으로 변환
const { markdown, images } = toMarkdown(uint8Array, {
  image: 'blob',
});

// PDF로 변환 (한글 폰트 경로 필요)
// 패키지에 포함된 폰트: node_modules/@ohah/hwpjs/fonts/ 를 앱 문서 디렉터리 등에 복사한 뒤 그 경로를 넘기세요.
const pdfBuffer = toPdf(uint8Array, {
  fontDir: '/path/to/fonts', // NotoSansKR-Regular.ttf 가 있는 디렉터리
  embedImages: true,
});
await FileSystem.writeAsStringAsync(
  `${FileSystem.documentDirectory}output.pdf`,
  Buffer.from(pdfBuffer).toString('base64'),
  { encoding: FileSystem.EncodingType.Base64 }
);
```

## API

### `toJson(data: Buffer | Uint8Array): string`

HWP 파일을 JSON 문자열로 변환합니다.

**Parameters:**
- `data`: HWP 파일의 바이트 배열 (Buffer 또는 Uint8Array)

**Returns:**
- JSON 문자열 (파싱된 HWP 문서)

**Example:**
```typescript
const fileBuffer = readFileSync('./document.hwp');
const jsonString = toJson(fileBuffer);
const document = JSON.parse(jsonString);
```

### `toMarkdown(data: Buffer | Uint8Array, options?: ToMarkdownOptions): ToMarkdownResult`

HWP 파일을 Markdown 형식으로 변환합니다.

**Parameters:**
- `data`: HWP 파일의 바이트 배열 (Buffer 또는 Uint8Array)
- `options`: 변환 옵션 (선택)
  - `image`: 이미지 형식 (`'base64'` 또는 `'blob'`, 기본값: `'blob'`)
  - `use_html`: HTML 태그 사용 여부 (기본값: `false`)
  - `include_version`: 버전 정보 포함 여부 (기본값: `false`)
  - `include_page_info`: 페이지 정보 포함 여부 (기본값: `false`)

**Returns:**
- `ToMarkdownResult` 객체:
  - `markdown`: Markdown 문자열
  - `images`: 이미지 데이터 배열 (blob 형식인 경우)

**Example:**
```typescript
// Base64 이미지 포함
const { markdown } = toMarkdown(fileBuffer, {
  image: 'base64',
  use_html: true,
});

// Blob 이미지 (별도 배열로 반환)
const { markdown, images } = toMarkdown(fileBuffer, {
  image: 'blob',
});
// images 배열에서 이미지 데이터 사용
images.forEach(img => {
  console.log(`Image ${img.id}: ${img.format}, ${img.data.length} bytes`);
});
```

### `fileHeader(data: Buffer | Uint8Array): string`

HWP 파일의 FileHeader만 추출하여 JSON 문자열로 반환합니다.

**Parameters:**
- `data`: HWP 파일의 바이트 배열 (Buffer 또는 Uint8Array)

**Returns:**
- JSON 문자열 (FileHeader 정보)

**Example:**
```typescript
const fileBuffer = readFileSync('./document.hwp');
const headerString = fileHeader(fileBuffer);
const header = JSON.parse(headerString);
console.log(header.version);
```

### `toPdf(data: Buffer | Uint8Array, options?: ToPdfOptions): Buffer`

HWP 파일을 PDF 바이트로 변환합니다. 한글 등이 포함된 문서는 `font_dir`에 한글 지원 폰트(예: Noto Sans KR)를 넣어야 합니다.

**Parameters:**
- `data`: HWP 파일의 바이트 배열 (Buffer 또는 Uint8Array)
- `options`: 변환 옵션 (선택)
  - `font_dir`: TTF/OTF 폰트가 있는 디렉터리 경로 (신뢰할 수 있는 경로만 사용)
  - `embed_images`: PDF에 이미지 임베드 여부 (기본값: `true`)

**Returns:**
- PDF 파일 내용 (Buffer)

**Example:**
```typescript
const pdfBuffer = toPdf(fileBuffer, {
  font_dir: './fonts',
  embed_images: true,
});
require('fs').writeFileSync('./output.pdf', pdfBuffer);
```

## 예제

더 자세한 예제는 [예제 디렉토리](../../examples)를 참고하세요.

- [Node.js 예제](../../examples/node)
- [Web 예제](../../examples/web)
- [React Native 예제](../../examples/react-native)

## 지원 플랫폼

### Node.js
- Windows (x64, x86, arm64)
- macOS (x64, arm64)
- Linux (x64)

### Web
- WASM (WebAssembly)

### React Native
- iOS
- Android

## 라이선스

MIT
