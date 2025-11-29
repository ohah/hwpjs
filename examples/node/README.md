# Node.js 예제

Node.js 환경에서 `@ohah/hwpjs`를 사용하는 예제 프로젝트입니다.

## 요구사항

- Node.js >= 20.6.0
- npm 또는 yarn 또는 bun

## 설치

```bash
# 루트 디렉토리에서 의존성 설치
npm install

# 또는
bun install
```

## 사용 방법

기본 예제는 현재 디렉토리의 `noori.hwp` 파일을 읽어서 파싱합니다.

```bash
npm run start
```

## 프로젝트 구조

```
examples/node/
├── src/
│   └── index.ts    # 기본 예제
├── noori.hwp       # 예제 HWP 파일
├── package.json
├── tsconfig.json
└── README.md
```

## 주요 기능

### 파일 읽기 및 파싱

Node.js의 `fs` 모듈을 사용하여 HWP 파일을 읽고 파싱합니다.

```typescript
import { readFileSync } from 'fs';
import { toJson } from '@ohah/hwpjs';

const fileBuffer = readFileSync('noori.hwp');
const data = new Uint8Array(fileBuffer);
const parsedResult = toJson(data);
const parsedJson = JSON.parse(parsedResult);
```

### 에러 핸들링

파일 읽기, 파싱 과정에서 발생할 수 있는 오류를 처리합니다.

```typescript
try {
  const fileBuffer = readFileSync('noori.hwp');
  const data = new Uint8Array(fileBuffer);
  const parsedResult = toJson(data);
  // ...
} catch (error) {
  console.error('오류 발생:', error);
  if (error instanceof Error) {
    console.error('오류 메시지:', error.message);
  }
}
```

## 사용 가능한 함수

- `toJson(data: Buffer): string` - HWP 파일을 JSON 형식으로 변환
- `toMarkdown(data: Buffer, options?): ToMarkdownResult` - HWP 파일을 마크다운 형식으로 변환
- `fileHeader(data: Buffer): string` - FileHeader만 추출

## 참고사항

- Node.js 환경에서는 네이티브 모듈이 자동으로 로드됩니다.
- 플랫폼별로 다른 네이티브 바이너리가 사용됩니다 (Windows, macOS, Linux).
- `@ohah/hwpjs` 패키지는 workspace 의존성으로 설정되어 있습니다.
