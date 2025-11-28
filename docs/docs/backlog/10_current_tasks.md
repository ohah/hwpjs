# 현재 작업

현재 진행 중이거나 곧 시작할 작업 항목들입니다.

## 지원 예정 함수

### 이미지 추출 함수

- **함수명**: `extract_images`
- **NAPI 함수명**: `extract_images` (node/web/react-native 공통)
- **기능**: HWP 문서에서 이미지를 추출
- **반환 타입**: 옵션으로 파일 경로 리스트 또는 이미지 데이터(바이트) 배열 지원
- **TypeScript 선언**: `extractImages(data: Array<number>, options?: ExtractImagesOptions): ExtractImagesResult`
- **관련 함수**: `extract_images_to_dir` (디렉토리에 저장하는 버전)
- **버전**: 0.1.0-rc.1부터 지원 예정
- **상태**: 계획됨
- **구현 위치**:
  - Rust: `crates/hwp-core/src/viewer/image.rs` (새 파일)
  - NAPI 바인딩: `packages/hwpjs/src/lib.rs`
  - TypeScript: `packages/hwpjs/index.d.ts`

**반환 형식**:
```typescript
interface ExtractImagesResult {
  images: Array<{
    id: string;
    data: Uint8Array;
    format: string; // "jpg", "bmp", "png" 등
  }>;
  paths?: string[]; // output_dir 옵션 사용 시
}
```

### 마크다운 변환 함수

- **함수명**: `to_markdown`
- **NAPI 함수명**: `to_markdown`
- **기능**: HWP 문서를 마크다운으로 변환
- **TypeScript 선언**: `toMarkdown(data: Array<number>, options?: MarkdownOptions): string`
- **버전**: 1.0.0에서 완성 예정 (현재는 내부 구현만 존재)
- **상태**: 구현 중 (내부 구현 완료, NAPI 바인딩 필요)
- **구현 위치**:
  - Rust: `crates/hwp-core/src/viewer/markdown/mod.rs` (이미 구현됨)
  - NAPI 바인딩: `packages/hwpjs/src/lib.rs` (추가 필요)
  - TypeScript: `packages/hwpjs/index.d.ts` (추가 필요)

## 예제 프로젝트

### Web 예제 설정

- **목표**: React Native 예제처럼 Web 환경에서 사용할 수 있는 예제 프로젝트 구성
- **상태**: 구현됨 (기본 설정 완료, 추가 작업 필요)
- **우선순위**: 중간
- **구현 위치**: `examples/web/`
- **필요 작업**:
  1. ✅ Web 예제 프로젝트 디렉토리 생성 (`examples/web/`)
  2. ✅ 빌드 도구 설정 (Vite)
  3. ✅ WASM 빌드 로드 및 사용 예제 작성
  4. SharedArrayBuffer를 위한 서버 설정 예제 (COOP/COEP 헤더)
  5. 다양한 브라우저 환경에서의 동작 확인
  6. 파일 업로드 및 파싱 UI 예제
  7. README 작성 (설정 방법, 실행 방법 등)
- **커스텀 설정 필요사항**:
  - **NAPI-RS WebAssembly 빌드 출력 차이**: NAPI-RS가 생성하는 `hwpjs.wasi-browser.js` 파일이 `./hwpjs.wasm32-wasi.wasm` 파일을 찾지만, 실제 빌드 출력은 `hwpjs.wasm`입니다. 빌드 스크립트에서 WASM 파일을 올바른 이름으로 복사하는 작업이 필요합니다.
  - **의존성 추가**: `@napi-rs/wasm-runtime`, `@emnapi/wasi-threads`, `@emnapi/core`, `@emnapi/runtime`, `tslib` 등 웹 환경에서 필요한 런타임 의존성을 웹 예제 프로젝트에 추가해야 합니다.
  - **package.json browser 필드 수정**: 기본 빌드 출력과 다르게 `browser` 필드를 `./dist/hwpjs.wasi-browser.js`로 설정해야 합니다.
  - **Vite 설정**: WASM 파일을 올바르게 처리하기 위한 Vite 설정이 필요합니다 (`assetsInclude: ['**/*.wasm']`).
- **고려사항**:
  - SharedArrayBuffer 지원을 위한 서버 헤더 설정 필요
  - 개발 서버 설정 (예: Vite dev server)
  - 프로덕션 빌드 설정
  - 다양한 브라우저 호환성
  - NAPI-RS WebAssembly 빌드 출력과 실제 사용 간의 차이점 해결

### Node.js 예제 설정

- **목표**: React Native 예제처럼 Node.js 환경에서 사용할 수 있는 예제 프로젝트 구성
- **상태**: 구현됨 (기본 예제 완료)
- **우선순위**: 중간
- **구현 위치**: `examples/node/`
- **필요 작업**:
  1. ✅ Node.js 예제 프로젝트 디렉토리 생성 (`examples/node/`)
  2. ✅ TypeScript 설정
  3. ✅ 파일 읽기 및 파싱 예제 작성
  4. ⏳ CLI 기능 예제 (추가 예정)
  5. ✅ 에러 핸들링 예제
  6. ✅ README 작성 (설정 방법, 실행 방법 등)
- **고려사항**:
  - Node.js 버전 호환성 (>= 20.6.0)
  - 플랫폼별 네이티브 모듈 로드 (Windows, macOS, Linux 지원)
  - 파일 시스템 접근 예제

## 테스트 환경

### Web 환경 테스트

- **목표**: 웹 브라우저 환경에서 WASM 빌드 동작 검증
- **테스트 프레임워크**: (계획 중)
- **상태**: 계획됨
- **필요 작업**:
  1. 웹 환경 테스트 프레임워크 설정 (예: Vitest + jsdom 또는 Playwright)
  2. WASM 빌드 로드 테스트
  3. SharedArrayBuffer 지원 확인
  4. COOP/COEP 헤더 설정 검증
  5. 브라우저 호환성 테스트 (Chrome, Firefox, Safari, Edge)
- **고려사항**:
  - SharedArrayBuffer는 보안 정책으로 인해 특정 헤더 설정 필요
  - 메모리 제약사항 테스트
  - 다양한 브라우저 환경에서의 동작 검증

## 알 수 없는 요소 (미지원 기능)

### 알 수 없는 Ctrl ID

- **요소**: `CtrlHeaderData::Other`
- **설명**: 표 127, 128의 알 수 없는 컨트롤 ID들
- **현재 상태**: 파서에서 "Other"로 처리되는 미지원 컨트롤들
- **위치**: `crates/hwp-core/src/document/bodytext/ctrl_header.rs:580`
- **우선순위**: 낮음
- **상태**: 조사 필요

### 알 수 없는 Shape Component

- **요소**: `ShapeComponentUnknown`
- **설명**: 알 수 없는 개체 타입
- **현재 상태**: 현재 테스트되지 않은 상태
- **위치**: `crates/hwp-core/src/document/bodytext/shape_component_unknown.rs`
- **우선순위**: 낮음
- **상태**: 조사 필요

### 알 수 없는 필드 타입

- **요소**: `FIELD_UNKNOWN` ("%unk")
- **설명**: 알 수 없는 필드 타입
- **위치**: `crates/hwp-core/src/document/bodytext/ctrl_header.rs:91`
- **우선순위**: 낮음
- **상태**: 조사 필요


## 버전 관리

- **0.1.0-rc.1**: 초기 배포 시작 (이미지 추출 함수 포함 예정)
- **1.0.0**: 마크다운 변환 완성 시 업데이트
