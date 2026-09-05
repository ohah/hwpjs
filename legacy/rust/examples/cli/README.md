# CLI 예제

`@ohah/hwpjs` CLI 도구를 사용하는 예제입니다.

## 요구사항

- Node.js >= 20.6.0
- `@ohah/hwpjs` 패키지가 전역 설치되어 있거나, `npx`를 사용할 수 있어야 합니다.

## 설치

```bash
# 루트 디렉토리에서 의존성 설치
npm install

# 또는
bun install

# CLI 전역 설치 (선택사항)
npm install -g @ohah/hwpjs
```

## 사용 방법

### 1. JSON 변환

HWP 파일을 JSON 형식으로 변환합니다.

```bash
# stdout으로 출력
hwpjs to-json ../fixtures/example.hwp

# 파일로 저장 (pretty print)
npm run example:json
```

### 2. Markdown 변환

HWP 파일을 Markdown 형식으로 변환합니다.

```bash
# 기본 변환
hwpjs to-markdown ../fixtures/example.hwp -o output.md

# 이미지 포함
hwpjs to-markdown ../fixtures/example.hwp -o output.md --include-images

# HTML 태그 사용
hwpjs to-markdown ../fixtures/example.hwp -o output.md --use-html

# 또는 npm 스크립트 사용
npm run example:markdown
```

### 3. 파일 정보 확인

HWP 파일의 기본 정보를 확인합니다.

```bash
# 기본 정보
hwpjs info ../fixtures/example.hwp

# JSON 형식으로 출력
hwpjs info ../fixtures/example.hwp --json

# 또는 npm 스크립트 사용
npm run example:info
```

### 4. 이미지 추출

HWP 파일에서 이미지를 추출합니다.

```bash
# 모든 이미지 추출
hwpjs extract-images ../fixtures/sample-5017-pics.hwp -o ./images

# 특정 형식만 추출
hwpjs extract-images ../fixtures/sample-5017-pics.hwp -o ./images --format jpg

# 또는 npm 스크립트 사용
npm run example:images
```

### 5. 배치 변환

디렉토리 내의 모든 HWP 파일을 일괄 변환합니다.

```bash
# JSON 형식으로 변환
hwpjs batch ../fixtures -o ./output --format json

# Markdown 형식으로 변환
hwpjs batch ../fixtures -o ./output --format markdown

# 재귀적으로 하위 디렉토리 포함
hwpjs batch ../fixtures -o ./output --format json --recursive

# Pretty print JSON
hwpjs batch ../fixtures -o ./output --format json --pretty

# 또는 npm 스크립트 사용
npm run example:batch
```

## 사용 가능한 명령어

### `hwpjs to-json <input> [options]`

HWP 파일을 JSON으로 변환합니다.

**옵션:**
- `-o, --output <file>`: 출력 파일 경로 (기본값: stdout)
- `--pretty`: JSON을 포맷팅하여 출력

**예제:**
```bash
hwpjs to-json document.hwp -o output.json --pretty
```

### `hwpjs to-markdown <input> [options]`

HWP 파일을 Markdown으로 변환합니다.

**옵션:**
- `-o, --output <file>`: 출력 파일 경로 (기본값: stdout)
- `--include-images`: 이미지를 base64로 포함
- `--use-html`: HTML 태그 사용 (테이블 등)
- `--include-version`: 버전 정보 포함
- `--include-page-info`: 페이지 정보 포함

**예제:**
```bash
hwpjs to-markdown document.hwp -o output.md --include-images
```

### `hwpjs info <input> [options]`

HWP 파일의 정보를 출력합니다.

**옵션:**
- `--json`: JSON 형식으로 출력

**예제:**
```bash
hwpjs info document.hwp --json
```

### `hwpjs extract-images <input> [options]`

HWP 파일에서 이미지를 추출합니다.

**옵션:**
- `-o, --output-dir <dir>`: 출력 디렉토리 (기본값: ./images)
- `--format <format>`: 이미지 형식 필터 (jpg, png, bmp, all) (기본값: all)

**예제:**
```bash
hwpjs extract-images document.hwp -o ./images --format jpg
```

### `hwpjs batch <input-dir> [options]`

디렉토리 내의 모든 HWP 파일을 일괄 변환합니다.

**옵션:**
- `-o, --output-dir <dir>`: 출력 디렉토리 (기본값: ./output)
- `--format <format>`: 출력 형식 (json, markdown) (기본값: json)
- `-r, --recursive`: 하위 디렉토리 포함
- `--pretty`: JSON 포맷팅 (json 형식만)
- `--include-images`: 이미지 포함 (markdown 형식만)

**예제:**
```bash
hwpjs batch ./documents -o ./output --format markdown --recursive
```

## npx 사용

전역 설치 없이 `npx`를 사용할 수도 있습니다:

```bash
npx @ohah/hwpjs to-json document.hwp
npx @ohah/hwpjs to-markdown document.hwp -o output.md
npx @ohah/hwpjs info document.hwp
```

## 참고사항

- CLI는 Node.js 환경에서만 작동합니다.
- 전역 설치 시 `hwpjs` 명령어를 직접 사용할 수 있습니다.
- `npx`를 사용하면 전역 설치 없이도 CLI를 사용할 수 있습니다.
- 모든 명령어는 `--help` 옵션으로 도움말을 볼 수 있습니다.

