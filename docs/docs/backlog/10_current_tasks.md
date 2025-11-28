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
