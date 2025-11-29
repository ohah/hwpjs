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

## 개선 작업

### parseHwpToMarkdown 이미지 옵션 추가

- **현재 상태**: `parseHwpToMarkdown` 함수가 항상 이미지를 blob 형태(`ImageData` 배열)로 반환
- **변경 필요**: 이미지 처리 방식을 선택할 수 있는 옵션 추가
  - `image: 'base64'`: 마크다운에 base64 데이터 URI를 직접 포함 (예: `![이미지](data:image/jpeg;base64,...)`)
  - `image: 'blob'`: 현재처럼 이미지를 별도 `ImageData` 배열로 반환 (기본값)
- **영향 범위**:
  - NAPI 바인딩: `packages/hwpjs/src/lib.rs`의 `ParseHwpToMarkdownOptions` 구조체
  - Rust 코어: `crates/hwp-core/src/viewer/markdown/mod.rs`의 `MarkdownOptions` (필요시)
  - TypeScript 타입 정의: `packages/hwpjs/dist/index.d.ts`
- **구현 방법**:
  - `ParseHwpToMarkdownOptions`에 `image?: 'base64' | 'blob'` 필드 추가
  - `image: 'base64'`일 때: 마크다운 변환 시 base64 데이터 URI를 그대로 유지하고 `images` 배열은 비우거나 제외
  - `image: 'blob'`일 때: 현재 동작 유지 (기본값)
- **우선순위**: 중간
- **상태**: 계획됨

### 입력 타입 변경: Array<number> → Uint8Array

- **현재 상태**: 함수들이 `Array<number>` (또는 `number[]`)를 입력으로 받고 있음
- **변경 필요**: `Uint8Array`로 변경하여 타입 안정성 및 성능 개선
- **영향 범위**:
  - React Native 바인딩: `packages/hwpjs/crates/lib/src/react_native_impl.rs`
  - 예제 코드: `examples/web/src/App.tsx`, `examples/react-native/src/App.tsx`
- **우선순위**: 높음
- **상태**: 계획됨

### Craby에 Uint8Array 지원 추가

- **현재 상태**: Craby가 `Array<Number>`만 지원하고 있음
- **변경 필요**: Craby에 `Uint8Array` (또는 `Array<u8>`) 타입 지원 추가
- **목적**: React Native 바인딩에서 직접 `Uint8Array`를 받을 수 있도록 개선
- **영향 범위**:
  - Craby 라이브러리 자체 수정 필요
  - React Native 바인딩 코드 수정
- **우선순위**: 높음
- **상태**: 계획됨

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
