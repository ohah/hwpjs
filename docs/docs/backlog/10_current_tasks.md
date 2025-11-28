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

## 테스트 환경

### Node.js 환경 테스트

- **목표**: Node.js 환경에서 HWP 파싱 기능 검증
- **테스트 프레임워크**: Bun
- **테스트 명령어**: `bun run test:node`
- **상태**: 구현됨
- **테스트 위치**: `packages/hwpjs/__test__/`
- **테스트 범위**:
  - 기본 HWP 파일 파싱
  - 다양한 HWP 파일 형식 지원 확인
  - 에러 핸들링 검증
- **CI/CD**: GitHub Actions에서 자동 실행

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

## 빌드 및 배포

### 크로스 플랫폼 빌드 설정

- **목표**: 리눅스를 제외한 크로스 플랫폼 빌드 지원 (Windows, macOS)
- **상태**: 구현됨
- **지원 플랫폼**:
  - Windows (x64, x86, arm64)
  - macOS (x64, arm64)
- **빌드 스크립트**:
  - `build:node:windows-x64`: Windows x64 빌드 (`--cross-compile` 플래그 사용)
  - `build:node:windows-x86`: Windows x86 빌드 (`--cross-compile` 플래그 사용)
  - `build:node:windows-arm64`: Windows ARM64 빌드 (`--cross-compile` 플래그 사용)
  - `build:node:macos-x64`: macOS x64 빌드 (네이티브 빌드)
  - `build:node:macos-arm64`: macOS ARM64 빌드 (네이티브 빌드)
- **크로스 컴파일 도구**:
  - Windows: `cargo-xwin` (자동 감지)
  - macOS: 네이티브 빌드 (Mac에서만 가능)
- **구현 위치**: `packages/hwpjs/package.json` (빌드 스크립트)

### Node.js 및 WASM 빌드 설정

- **목표**: Node.js와 Web 환경을 위한 빌드 설정
- **상태**: 구현됨
- **빌드 타겟**:
  - Node.js: NAPI-RS를 통한 네이티브 모듈 빌드
  - Web: WASM 빌드 (`wasm32-wasip1-threads`)
- **빌드 스크립트**:
  - `build:node`: 모든 Node.js 플랫폼 빌드 (Windows, macOS)
  - `build:wasm`: WASM 빌드
  - `build`: 전체 빌드 (Node.js + WASM + React Native)
- **구현 위치**: `packages/hwpjs/package.json` (빌드 스크립트)
- **NAPI 타겟 설정**: `packages/hwpjs/package.json`의 `napi.targets` 필드

### Web WASM 빌드

- **목표**: 웹 브라우저 환경에서 직접 사용 가능한 WASM 빌드 제공
- **기능**: Node.js/React Native 외에 웹 브라우저에서도 HWP 파싱 지원
- **상태**: 계획됨
- **우선순위**: 중간
- **구현 방식**: [NAPI-RS WebAssembly 지원](https://napi.rs/docs/concepts/webassembly) 사용
- **타겟**: `wasm32-wasip1-threads` (NAPI-RS 기본 지원 타겟)
- **구현 위치**:
  - 빌드 설정: `packages/hwpjs/package.json` (napi 설정에 wasm32 타겟 추가)
  - 빌드 설정: `packages/hwpjs/Cargo.toml` (wasm32 타겟 지원 확인)
  - 패키지 설정: `cpu: ["wasm32"]` 필드 추가 필요
- **필요 작업**:
  1. `packages/hwpjs/package.json`의 `napi.targets`에 `wasm32-wasip1-threads` 추가
  2. WASM 전용 패키지에 `cpu: ["wasm32"]` 필드 추가
  3. C/C++ 의존성 확인 및 WASI SDK 설정 (`WASI_SDK_PATH` 환경 변수)
  4. 서버 설정 문서화 (SharedArrayBuffer를 위한 COOP/COEP 헤더)
- **고려사항**:
  - SharedArrayBuffer 사용을 위한 서버 헤더 설정 필요:
    - `Cross-Origin-Embedder-Policy: require-corp`
    - `Cross-Origin-Opener-Policy: same-origin`
  - 파일 시스템 접근 제한 (브라우저 환경)
  - 메모리 제약사항
  - 번들 크기 최적화 (약 308.7KB 런타임 JavaScript 코드 포함)
- **참고 문서**: https://napi.rs/docs/concepts/webassembly

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
