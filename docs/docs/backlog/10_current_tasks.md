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

### 이미지 렌더링 크기 정보 추가

- **현재 상태**: `toMarkdown`과 `extract_images` 함수가 이미지 데이터만 반환하고, 실제 HWP 문서에서 렌더링되는 크기 정보는 포함하지 않음
- **변경 필요**: 이미지의 실제 렌더링 크기 정보를 반환하도록 개선
  - HWP 문서에서 이미지가 표시되는 실제 크기 (너비, 높이)
  - HWPUNIT 단위로 저장된 크기 정보를 픽셀 또는 밀리미터로 변환
- **영향 범위**:
  - `ImageData` 구조체에 `width`, `height` 필드 추가 (옵션)
  - Rust: `crates/hwp-core/src/document/bodytext/shape_component_picture.rs`에서 크기 정보 추출
  - NAPI 바인딩: `packages/hwpjs/src/lib.rs`의 `ImageData` 구조체
  - TypeScript 타입 정의: `packages/hwpjs/dist/index.d.ts`
- **구현 방법**:
  - `ShapeComponentPicture`에서 `border_rectangle_x`, `border_rectangle_y`의 크기 정보 추출
  - HWPUNIT을 픽셀 또는 밀리미터로 변환 (DPI 정보 필요할 수 있음)
  - `ImageData`에 `width?: number`, `height?: number` 필드 추가 (옵션)
  - 크기 정보가 없는 경우 `undefined` 반환
- **고려사항**:
  - HWP 문서의 DPI 설정에 따라 실제 픽셀 크기가 달라질 수 있음
  - 기본 DPI 값 (예: 96 DPI 또는 72 DPI) 사용 여부 결정 필요
  - 이미지 원본 크기와 렌더링 크기가 다를 수 있음
  - `border_rectangle_x`와 `border_rectangle_y`의 차이로 인한 크기 계산 방법 결정 필요
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

### React Native API 함수명 통일

- **현재 상태**: React Native는 `ReactNative.hwp_parser()` 형태로 사용되며, Node.js/Web과 다른 API 구조를 가짐
- **변경 필요**: React Native도 Node.js/Web과 동일한 함수명으로 통일
  - `ReactNative.hwp_parser()` → `toJson()`
  - `toMarkdown()`, `fileHeader()` 함수 추가
- **영향 범위**:
  - React Native 바인딩: `packages/hwpjs/crates/lib/src/react_native_impl.rs`
  - TypeScript 타입 정의: `packages/hwpjs/dist/react-native/index.d.mts`
  - 예제 코드: `examples/react-native/src/App.tsx`
  - 문서: `docs/docs/guide/installation.mdx`, `docs/docs/guide/examples.md`
- **구현 방법**:
  - `react_native_impl.rs`에 `toJson`, `toMarkdown`, `fileHeader` 함수 추가
  - `ReactNative` 네임스페이스 제거하고 직접 export
  - 기존 `hwp_parser` 함수는 deprecated 처리하거나 제거
- **고려사항**:
  - 기존 코드와의 호환성을 위해 마이그레이션 가이드 제공 필요
  - Craby의 타입 지원이 완료된 후 진행하는 것이 좋음
- **우선순위**: 높음
- **상태**: 계획됨

### 각 환경별 E2E 테스트 구축

- **현재 상태**: E2E 테스트가 부분적으로만 구현되어 있음
- **변경 필요**: Node.js, Web, React Native 각 환경에 대한 E2E 테스트 구축
- **구현 범위**:
  - **Node.js E2E 테스트**:
    - 실제 HWP 파일을 읽어서 파싱하는 테스트
    - `toJson()`, `toMarkdown()`, `fileHeader()` 함수 테스트
    - 다양한 HWP 파일 형식에 대한 테스트
  - **Web E2E 테스트**:
    - 브라우저 환경에서 WASM 빌드 동작 확인
    - `toJson()`, `toMarkdown()`, `fileHeader()` 함수 테스트
  - **React Native E2E 테스트**:
    - iOS/Android 실제 디바이스/에뮬레이터에서 테스트
    - Maestro 사용한 E2E 테스트
    - `toJson()`, `toMarkdown()`, `fileHeader()` 함수 테스트
- **테스트 도구**:
  - Node.js: Vitest
  - Web: Vitest
  - React Native: Maestro
- **영향 범위**:
  - 테스트 스크립트 추가: `package.json`
  - CI/CD 파이프라인 업데이트: `.github/workflows/`
  - 테스트 파일: `tests/e2e/` 또는 각 예제 프로젝트 내
- **우선순위**: 중간
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
