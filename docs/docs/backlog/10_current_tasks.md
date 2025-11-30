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
- **버전**: 0.1.0-rc.2부터 지원 예정
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

### 배포 패키지 용량 최적화

- **현재 상태**: npm 패키지 크기가 약 200MB로 매우 큼
  - 주요 원인: React Native용 `.a` 정적 라이브러리 파일들이 여러 아키텍처에 대해 포함됨
  - Android: `arm64-v8a`, `armeabi-v7a`, `x86`, `x86_64` (4개 아키텍처)
  - iOS: `ios-arm64`, `ios-arm64_x86_64-simulator` (2개 아키텍처)
- **목표**: 패키지 크기를 100MB 이하로 줄이기
- **최적화 방법**:
  1. **Rust 빌드 최적화**:
     - `packages/hwpjs/crates/lib/Cargo.toml`에 `[profile.release]` 추가
       - `lto = true` (Link Time Optimization)
       - `strip = "symbols"` (디버그 심볼 제거)
       - `codegen-units = 1` (단일 코드 생성 단위)
       - `opt-level = "z"` (최대 크기 최적화)
       - `panic = "abort"` (unwind보다 작음, 약 5-10% 추가 감소)
     - `crates/hwp-core/Cargo.toml`에도 동일한 최적화 적용
  2. **빌드 산출물 제외 강화**:
     - `package.json`의 `files` 필드에 추가 제외 항목:
       - `!android/build/**`
       - `!android/.gradle/**`
       - `!android/.idea/**`
       - `!ios/build/**`
       - `!ios/Pods/**`
       - `!ios/*.xcworkspace`
       - `!**/*.log`
  3. **Android CMake 빌드 최적화**:
     - `packages/hwpjs/android/build.gradle`의 release 빌드에 최적화 플래그 추가:
       - `cppFlags "-O3 -flto -ffunction-sections -fdata-sections"`
  4. **선택적 아키텍처 제외** (트레이드오프):
     - Android `x86`, `x86_64` 제외 시 약 30-50% 용량 감소 가능
     - 하지만 에뮬레이터 사용 불가능해짐
     - 대안: postinstall 스크립트로 GitHub Releases에서 선택적 다운로드
- **예상 효과**:
  - Rust 빌드 최적화: 약 30-50% 크기 감소
  - 빌드 산출물 제외: 약 5-10% 추가 감소
  - 총 예상: 100-150MB 수준으로 감소 가능
- **영향 범위**:
  - `packages/hwpjs/crates/lib/Cargo.toml`
  - `crates/hwp-core/Cargo.toml`
  - `packages/hwpjs/package.json` (files 필드)
  - `packages/hwpjs/android/build.gradle`
- **참고사항**:
  - `.a` 파일 크기는 최종 앱 번들 크기에 직접적으로 영향을 줌
  - React Native 앱 빌드 시 `.a` 파일이 앱 번들에 포함됨
  - 따라서 패키지 크기 최적화는 앱 번들 크기 최적화로도 이어짐
- **우선순위**: 높음
- **상태**: 계획됨

### Craby 심링크(symlink) 기능 추가

- **현재 상태**: `packages/hwpjs/target` 디렉토리가 별도로 생성되어 빌드 아티팩트가 중복 저장됨
- **변경 필요**: Craby 빌드 시 `target` 디렉토리를 workspace 루트의 `target`으로 심링크하도록 옵션 추가
- **목적**: 
  - 빌드 아티팩트 중복 저장 방지
  - 디스크 공간 절약
  - 빌드 캐시 공유로 빌드 시간 단축
- **구현 방법**:
  - `craby.toml`에 `target_symlink` 옵션 추가
  - 옵션 값: `true` (기본값: `false`)
  - 빌드 전에 자동으로 심링크 생성
- **설정 예시**:
  ```toml
  [project]
  name = "hwpjs"
  source_dir = "src-reactnative"
  target_symlink = true  # workspace 루트의 target으로 심링크
  
  [android]
  package_name = "rs.craby.hwpjs"
  
  [ios]
  ```
- **영향 범위**:
  - Craby 빌드 시스템 수정 필요
  - `packages/hwpjs/scripts/create-target-link.ts` 스크립트를 Craby에 통합
  - Windows 환경에서 관리자 권한 필요 시 경고 메시지 표시
- **고려사항**:
  - Windows에서는 `mklink /D` 명령어 사용 (관리자 권한 필요)
  - macOS/Linux에서는 `ln -s` 사용
  - 기존 `target` 디렉토리가 존재하는 경우 처리 방법 결정 필요
  - 심링크 생성 실패 시 일반 디렉토리로 폴백
- **우선순위**: 중간
- **상태**: 계획됨

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

### Craby에 객체 배열(Object[]) 지원 추가

- **현재 상태**: Craby가 객체 배열을 지원하지 않음. 예: `Array<ImageData>` 형태의 타입을 인식하지 못함
- **문제 상황**: 
  - `ToMarkdownResult` 인터페이스에서 `images: ImageData[]` 형태를 사용할 수 없음
  - 중첩된 타입 참조(`ToMarkdownResult` 내부의 `ImageData[]`)를 인식하지 못함
  - 에러: `ERROR [as_rs_type] Unsupported type annotation: Ref(RefTypeAnnotation { ref_id: ReferenceId(0), name: "ImageData" })`
- **임시 해결책**: 
  - `ToMarkdownResult`에서 `images` 필드를 제거하고 마크다운만 반환
- **변경 필요**: Craby에 객체 배열 타입 지원 추가
- **목적**: React Native 바인딩에서 복잡한 객체 구조를 반환할 수 있도록 개선
- **영향 범위**:
  - Craby 라이브러리 자체 수정 필요
  - React Native 바인딩: `to_markdown` 함수의 반환 타입 수정 가능
- **우선순위**: 중간
- **상태**: 계획됨


### Example 예시 및 E2E 환경 설정

- **현재 상태**: 예제 코드가 기본적인 수준이며, E2E 테스트 환경이 완전히 구축되지 않음
- **변경 필요**: 
  - 각 플랫폼별 예제 코드 보완 및 개선
  - E2E 테스트 환경 설정 및 테스트 케이스 작성
- **구현 범위**:
  - **예제 코드 개선**:
    - `examples/node/`: 다양한 사용 시나리오 예제 추가
    - `examples/web/`: 인터랙티브 데모 기능 강화
    - `examples/react-native/`: 실제 앱에서 사용할 수 있는 완성도 높은 예제
    - 각 예제에 에러 처리, 로딩 상태, 다양한 옵션 사용 예시 포함
  - **E2E 테스트 환경 설정**:
    - **Node.js E2E 테스트**:
      - Vitest 설정 및 테스트 스크립트 작성
      - 실제 HWP 파일을 읽어서 파싱하는 테스트
      - `toJson()`, `toMarkdown()`, `fileHeader()` 함수 테스트
      - 다양한 HWP 파일 형식에 대한 테스트
    - **Web E2E 테스트**:
      - Playwright 또는 Puppeteer 설정
      - 브라우저 환경에서 WASM 빌드 동작 확인
      - 파일 업로드 및 변환 결과 확인 테스트
      - `toJson()`, `toMarkdown()`, `fileHeader()` 함수 테스트
    - **React Native E2E 테스트**:
      - Maestro 설정 및 테스트 플로우 작성
      - iOS/Android 실제 디바이스/에뮬레이터에서 테스트
      - 파일 읽기 및 파싱 결과 확인 테스트
      - `toJson()`, `toMarkdown()`, `fileHeader()` 함수 테스트
- **테스트 도구**:
  - Node.js: Vitest
  - Web: Playwright 또는 Puppeteer
  - React Native: Maestro
- **영향 범위**:
  - 예제 코드: `examples/` 디렉토리
  - 테스트 스크립트 추가: `package.json`
  - CI/CD 파이프라인 업데이트: `.github/workflows/`
  - 테스트 파일: `tests/e2e/` 또는 각 예제 프로젝트 내
  - 문서: `docs/docs/guide/examples.md` 업데이트
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


## 명세서 문서화 작업 예정

### 차트 형식 명세서 작성

- **파일**: `docs/docs/spec/chart.md`
- **현재 상태**: 내용 준비 중
- **작업 내용**: HWP 파일 형식의 차트 개체에 대한 명세서 작성
- **참고**: HWP 5.0 명세서의 "4.3.9.6. 차트 개체" 섹션 참조
- **우선순위**: 중간
- **상태**: 작업 예정

### 배포용 문서 형식 명세서 작성

- **파일**: `docs/docs/spec/distribution.md`
- **현재 상태**: 내용 준비 중
- **작업 내용**: HWP 파일 형식의 배포용 문서 데이터에 대한 명세서 작성
- **참고**: HWP 5.0 명세서의 "4.2.13. 배포용 문서 데이터" 섹션 참조
- **우선순위**: 중간
- **상태**: 작업 예정

### 수식 형식 명세서 작성

- **파일**: `docs/docs/spec/formula.md`
- **현재 상태**: 내용 준비 중
- **작업 내용**: HWP 파일 형식의 수식 개체에 대한 명세서 작성
- **참고**: HWP 5.0 명세서의 "4.3.9.3. 한글 수식 개체" 섹션 참조
- **우선순위**: 중간
- **상태**: 작업 예정

### HWP 3.0 / HWPML 형식 명세서 작성

- **파일**: `docs/docs/spec/hwp-3.0-hwpml.md`
- **현재 상태**: 내용 준비 중
- **작업 내용**: HWP 3.0 및 HWPML 형식에 대한 명세서 작성
- **참고**: HWP 5.0 명세서의 "본 문서에 대하여" 섹션에서 언급
- **우선순위**: 낮음
- **상태**: 작업 예정

## 버전 관리

- **0.1.0-rc.1**: 초기 배포 시작
