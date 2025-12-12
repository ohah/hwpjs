# HWPJS 프로젝트 - AI 에이전트 가이드

## 프로젝트 개요

HWPJS는 한글과컴퓨터의 한/글 문서 파일(.hwp)을 읽고 파싱하는 라이브러리입니다. 
이 프로젝트는 Rust로 핵심 로직을 구현하고, React Native와 Node.js 환경에서 사용할 수 있도록 래퍼를 제공합니다.

### HWP 파일 스펙 문서

**중요**: `.hwp` 파일을 읽고 파싱할 때는 반드시 다음 문서들을 참조해야 합니다:

- **한글 문서 파일 형식 5.0 명세서**: `docs/docs/spec/hwp-5.0.md`
  - 한글과컴퓨터에서 공개한 한/글 문서 파일 형식 5.0의 공식 스펙 문서입니다.
  - HWP 파일의 구조, 데이터 레코드, 스토리지 정보 등 모든 구현은 이 문서를 기준으로 해야 합니다.
  - 문서 사이트의 "명세서" 메뉴에서도 확인할 수 있습니다.

- **기타 형식 문서**:
  - **HWP 3.0 / HWPML 형식**: `docs/docs/spec/hwp-3.0-hwpml.md` (내용 준비 중)
  - **배포용 문서 형식**: `docs/docs/spec/distribution.md` (내용 준비 중)
  - **수식 형식**: `docs/docs/spec/formula.md` (내용 준비 중)
  - **차트 형식**: `docs/docs/spec/chart.md` (내용 준비 중)

모든 명세서는 `docs/docs/spec/` 디렉토리에 있으며, 문서 사이트의 "명세서" 메뉴에서 확인할 수 있습니다.

## 프로젝트 구조

```
hwpjs/
├── crates/
│   └── hwp-core/          # 공유 Rust 라이브러리 (핵심 HWP 파싱 로직 + 뷰어 기능)
│       ├── src/
│       │   ├── document/  # 문서 파싱 모듈
│       │   └── viewer/     # 문서 변환/뷰어 모듈 (마크다운, PDF(지원 예정) 등)
│       └── tests/
│           ├── fixtures/  # 테스트용 HWP 파일들
│           └── snapshots/ # 스냅샷 테스트 결과 파일들
├── packages/
│   └── hwpjs/             # 멀티 플랫폼 패키지 (Node.js, Web, React Native)
│       ├── src/           # NAPI-RS 바인딩 코드 (Node.js/Web용)
│       │   └── lib.rs     # NAPI-RS 바인딩 진입점
│       ├── src-cli/       # CLI 도구 소스 코드
│       │   ├── index.ts   # CLI 진입점
│       │   └── commands/  # CLI 명령어 (to-json, to-markdown, info, extract-images, batch)
│       ├── src-reactnative/ # React Native 바인딩 코드
│       │   ├── index.ts   # React Native 모듈 진입점
│       │   └── NativeReactNative.ts # 네이티브 모듈 타입 정의
│       ├── crates/lib/    # React Native용 Rust FFI 코드
│       │   └── src/       # FFI 구현 (ffi.rs, generated.rs, hwpjs_impl.rs, lib.rs)
│       ├── cpp/           # C++ 바인딩 코드 (Craby용)
│       ├── android/       # Android 네이티브 코드
│       ├── ios/           # iOS 네이티브 코드
│       ├── bin/           # CLI 실행 파일 (hwpjs.js)
│       ├── dist/          # 빌드 결과물
│       └── npm/           # 플랫폼별 바이너리 패키지
├── examples/              # 사용 예제 코드
│   ├── node/              # Node.js 예제
│   ├── web/               # Web 예제
│   ├── react-native/      # React Native 예제
│   └── cli/               # CLI 사용 예제
├── docs/                  # 문서 사이트 (Rspress)
└── legacy/                # 기존 JavaScript 구현
```

## 기술 스택

### 런타임/빌드
- **Bun**: 워크스페이스 관리 및 패키지 매니저
- **Rust**: 핵심 로직 구현 언어

### Rust 관련
- **공유 라이브러리**: `crates/hwp-core` - 환경 독립적인 HWP 파싱 로직
- **React Native**: Craby - TypeScript에서 Rust로의 바인딩
- **Node.js**: NAPI-RS - Node.js 네이티브 모듈 생성
- **린트/포맷**: 
  - `rustfmt`: 코드 포맷팅
  - `clippy`: 린팅

### JavaScript/TypeScript 관련
- **린트**: oxlint - 빠른 JavaScript/TypeScript 린터
- **포맷터**: oxfmt - Prettier 호환 포맷터
- **테스트 (Node)**: Bun
- **배포 (Node)**: tsdown

### 문서
- **Rspress**: 문서 사이트 생성

### 테스트
- **React Native**: Maestro (E2E 테스트)
- **Node.js**: Bun (유닛 테스트)
- **Rust**: cargo test

### 환경 관리
- **mise**: 버전 관리 도구
  - Rust: stable (LTS)
  - Bun: latest (LTS)
  - Node.js: 24.11.1 (LTS)

## 아키텍처 설계

### 공유 라이브러리 (`crates/hwp-core`)
- HWP 파일 파싱의 핵심 로직을 담당
- 파일 읽기를 트레이트로 추상화하여 환경별 구현 가능
- 환경 독립적인 비즈니스 로직만 포함
- 파싱된 문서 구조체(`HwpDocument`) 제공
- 문서 변환/뷰어 기능 포함 (`viewer/` 모듈)
  - 현재 지원 형식: 마크다운 (Markdown)
  - 향후 지원 예정: PDF 등
  - 파싱(`document/`)과 변환(`viewer/`)의 관심사 분리

#### 모듈 구조

`crates/hwp-core/src/` 디렉토리는 HWP 파일 구조에 맞춰 다음과 같이 구성됩니다:

```
src/
├── document/                 # HWP 문서 구조 (표 2: 전체 구조)
│   ├── mod.rs               # HwpDocument 통합 구조체
│   ├── constants.rs         # 문서 관련 상수
│   ├── fileheader/          # FileHeader 스트림 (파일 인식 정보)
│   │   ├── mod.rs           # 구조체 정의 및 파싱 로직
│   │   ├── constants.rs     # 플래그 상수 (document_flags, license_flags)
│   │   └── serialize.rs     # JSON 직렬화 함수
│   ├── docinfo/             # DocInfo 스트림 (문서 정보)
│   │   ├── mod.rs           # DocInfo 통합 구조체
│   │   ├── doc_data.rs      # 문서 데이터
│   │   ├── document_properties.rs
│   │   ├── char_shape.rs    # 문자 모양
│   │   ├── para_shape.rs    # 문단 모양
│   │   ├── style.rs         # 스타일
│   │   ├── tab_def.rs       # 탭 정의
│   │   ├── border_fill.rs   # 테두리/배경
│   │   ├── bullet.rs        # 글머리표
│   │   ├── numbering.rs     # 번호
│   │   ├── face_name.rs     # 글꼴 이름
│   │   ├── bin_data.rs      # 바이너리 데이터
│   │   ├── memo_shape.rs    # 메모 모양
│   │   ├── track_change.rs  # 변경 추적
│   │   └── ...              # 기타 DocInfo 관련 모듈
│   ├── bodytext/            # BodyText 스토리지 (본문)
│   │   ├── mod.rs           # BodyText 통합 구조체
│   │   ├── para_header.rs   # 문단 헤더
│   │   ├── line_seg.rs      # 줄 단위
│   │   ├── char_shape.rs    # 문자 모양
│   │   ├── range_tag.rs     # 범위 태그
│   │   ├── table.rs         # 표
│   │   ├── shape_component.rs # 도형 컴포넌트
│   │   ├── shape_component_picture.rs # 그림
│   │   ├── shape_component_container.rs # 컨테이너
│   │   ├── ctrl_header.rs   # 컨트롤 헤더
│   │   └── ...              # 기타 BodyText 관련 모듈
│   ├── bindata/             # BinData 스토리지 (바이너리 데이터)
│   │   └── mod.rs
│   ├── preview_image.rs     # 미리보기 이미지
│   ├── preview_text.rs      # 미리보기 텍스트
│   ├── scripts/             # 스크립트
│   │   ├── mod.rs
│   │   ├── script.rs
│   │   └── script_version.rs
│   └── xml_template.rs      # XML 템플릿
├── viewer/                   # 문서 변환/뷰어 모듈
│   ├── mod.rs               # 뷰어 모듈 진입점
│   ├── core/                # 공통 뷰어 로직 (모든 뷰어에서 공유)
│   │   ├── mod.rs           # Core 모듈 진입점
│   │   ├── renderer.rs      # Renderer trait 정의
│   │   ├── bodytext.rs      # 공통 본문 처리 로직
│   │   ├── paragraph.rs     # 공통 문단 처리 로직
│   │   └── table.rs         # 공통 테이블 처리 로직 (예정)
│   ├── markdown/            # 마크다운 변환
│   │   ├── mod.rs           # 마크다운 변환 진입점
│   │   ├── renderer.rs      # MarkdownRenderer 구현
│   │   ├── common.rs        # 공통 유틸리티
│   │   ├── utils.rs         # 유틸리티 함수 (개요 번호 추적 등)
│   │   ├── collect.rs       # 텍스트/이미지 수집 함수
│   │   ├── document/        # 문서 레벨 변환
│   │   │   ├── mod.rs
│   │   │   ├── docinfo.rs
│   │   │   ├── fileheader.rs
│   │   │   └── bodytext/    # 본문 텍스트 변환
│   │   │       ├── mod.rs
│   │   │       ├── paragraph.rs
│   │   │       ├── para_text.rs
│   │   │       ├── table.rs
│   │   │       ├── list_header.rs
│   │   │       ├── shape_component.rs
│   │   │       └── shape_component_picture.rs
│   │   └── ctrl_header/     # 컨트롤 헤더 변환
│   │       ├── mod.rs
│   │       ├── table.rs
│   │       ├── footnote.rs
│   │       ├── endnote.rs
│   │       ├── header.rs
│   │       ├── footer.rs
│   │       ├── page_number.rs
│   │       ├── shape_object.rs
│   │       └── column_def.rs
│   ├── html/                # HTML 변환
│   │   ├── mod.rs           # HTML 변환 진입점
│   │   ├── renderer.rs      # HtmlRenderer 구현
│   │   ├── common.rs        # 공통 유틸리티 (이미지 처리 등)
│   │   ├── utils.rs         # 유틸리티 함수 (개요 번호 추적 등)
│   │   ├── document/        # 문서 레벨 변환
│   │   │   ├── mod.rs
│   │   │   ├── docinfo.rs
│   │   │   ├── fileheader.rs
│   │   │   └── bodytext/    # 본문 텍스트 변환
│   │   │       ├── mod.rs
│   │   │       ├── paragraph.rs
│   │   │       ├── para_text.rs
│   │   │       ├── table.rs
│   │   │       ├── list_header.rs
│   │   │       ├── shape_component.rs
│   │   │       └── shape_component_picture.rs
│   │   └── ctrl_header/     # 컨트롤 헤더 변환
│   │       ├── mod.rs
│   │       ├── table.rs
│   │       ├── footnote.rs
│   │       ├── endnote.rs
│   │       ├── header.rs
│   │       ├── footer.rs
│   │       ├── page_number.rs
│   │       ├── shape_object.rs
│   │       └── column_def.rs
│   ├── canvas/              # Canvas 변환 (예정)
│   │   ├── mod.rs           # Canvas 변환 진입점
│   │   ├── renderer.rs      # CanvasRenderer 구현
│   │   ├── common.rs        # 공통 유틸리티
│   │   ├── utils.rs         # 유틸리티 함수
│   │   ├── document/        # 문서 레벨 변환
│   │   │   ├── mod.rs
│   │   │   ├── docinfo.rs
│   │   │   ├── fileheader.rs
│   │   │   └── bodytext/    # 본문 텍스트 변환
│   │   │       ├── mod.rs
│   │   │       ├── paragraph.rs
│   │   │       ├── para_text.rs
│   │   │       ├── table.rs
│   │   │       ├── list_header.rs
│   │   │       ├── shape_component.rs
│   │   │       └── shape_component_picture.rs
│   │   └── ctrl_header/     # 컨트롤 헤더 변환
│   │       ├── mod.rs
│   │       ├── table.rs
│   │       ├── footnote.rs
│   │       ├── endnote.rs
│   │       ├── header.rs
│   │       ├── footer.rs
│   │       ├── page_number.rs
│   │       ├── shape_object.rs
│   │       └── column_def.rs
│   └── pdf/                 # PDF 변환 (예정)
│       ├── mod.rs           # PDF 변환 진입점
│       ├── renderer.rs      # PdfRenderer 구현
│       ├── common.rs        # 공통 유틸리티
│       ├── utils.rs         # 유틸리티 함수
│       ├── document/        # 문서 레벨 변환
│       │   ├── mod.rs
│       │   ├── docinfo.rs
│       │   ├── fileheader.rs
│       │   └── bodytext/    # 본문 텍스트 변환
│       │       ├── mod.rs
│       │       ├── paragraph.rs
│       │       ├── para_text.rs
│       │       ├── table.rs
│       │       ├── list_header.rs
│       │       ├── shape_component.rs
│       │       └── shape_component_picture.rs
│       └── ctrl_header/     # 컨트롤 헤더 변환
│           ├── mod.rs
│           ├── table.rs
│           ├── footnote.rs
│           ├── endnote.rs
│           ├── header.rs
│           ├── footer.rs
│           ├── page_number.rs
│           ├── shape_object.rs
│           └── column_def.rs
├── types.rs                  # HWP 자료형 정의 (표 1: 자료형)
├── cfb.rs                    # CFB (Compound File Binary) 파싱
│                             # - read_stream(): 루트 레벨 스트림 접근
│                             # - read_nested_stream(): 중첩 스토리지 접근 (폴백 지원)
├── decompress.rs             # zlib 압축 해제
└── lib.rs                    # 라이브러리 진입점 및 HwpParser
```

**구조 원칙**:
- HWP 파일 구조(스펙 문서 표 2)와 1:1 매핑
- 각 스트림/스토리지는 독립적인 모듈로 분리
- 상수, 직렬화 등은 별도 파일로 분리하여 가독성 향상
- 스펙 문서의 구조를 그대로 반영하여 유지보수성 향상
- **CFB 경로 처리는 CfbParser에 중앙화**: 중첩 스토리지 접근 로직을 CfbParser에 집중하여 재사용성과 유지보수성 향상

### 환경별 래퍼

#### `packages/hwpjs`
- 멀티 플랫폼 패키지 (Node.js, Web, React Native 모두 지원)
- **Node.js/Web**: NAPI-RS를 사용하여 네이티브 모듈 생성
  - `hwp-core`를 의존성으로 사용
  - Node.js 환경의 파일 읽기 구현
  - Bun을 사용한 유닛 테스트
  - tsdown을 사용한 배포
- **React Native**: Craby를 사용하여 React Native 바인딩
  - `hwp-core`를 의존성으로 사용
  - React Native 환경의 파일 읽기 구현
  - Maestro를 사용한 E2E 테스트

## 워크스페이스 설정

### Bun 워크스페이스
- `packages/*` 디렉토리를 워크스페이스로 관리
- 각 패키지는 독립적으로 빌드 및 배포 가능

### Cargo 워크스페이스
- `crates/*` 및 `packages/*/Cargo.toml`을 워크스페이스 멤버로 포함
- NAPI-RS는 Cargo 워크스페이스에서 정상 작동
- 공유 의존성을 효율적으로 관리

## 개발 가이드라인

### 코드 스타일
- Rust: `rustfmt` 및 `clippy` 사용
- JavaScript/TypeScript: `oxlint` 및 `oxfmt` 사용
- 모든 코드는 저장 시 자동 포맷팅

### HWP 자료형 타입 정의 (hwp-core 개발 필수)

**중요**: `crates/hwp-core`에서 HWP 파일을 파싱할 때는 반드시 스펙 문서의 자료형을 별도 타입으로 정의해야 합니다.

#### 원칙
- HWP 5.0 스펙 문서의 "표 1: 자료형"에 정의된 모든 자료형을 `crates/hwp-core/src/types.rs`에 명시적으로 정의
- 스펙 문서와 코드의 1:1 매핑을 유지하여 유지보수성 향상
- 스펙 문서의 용어를 그대로 사용 (예: `DWORD`, `HWPUNIT`, `COLORREF`)

#### 구현 방법
1. **기본 타입**: `type` 별칭으로 정의
   ```rust
   pub type BYTE = u8;
   pub type WORD = u16;
   pub type DWORD = u32;
   pub type WCHAR = u16;
   pub type UINT8 = u8;
   pub type UINT16 = u16;
   pub type UINT32 = u32;
   pub type INT8 = i8;
   pub type INT16 = i16;
   pub type INT32 = i32;
   ```

2. **도메인 특화 타입**: 구조체로 정의하고 유용한 메서드 추가
   ```rust
   // HWPUNIT: 1/7200인치 단위
   #[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
   pub struct HWPUNIT(pub u32);
   
   impl HWPUNIT {
       pub fn to_inches(self) -> f64 { self.0 as f64 / 7200.0 }
       pub fn from_inches(inches: f64) -> Self { Self((inches * 7200.0) as u32) }
   }
   
   // COLORREF: RGB 값 (0x00bbggrr)
   #[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
   pub struct COLORREF(pub u32);
   
   impl COLORREF {
       pub fn rgb(r: u8, g: u8, b: u8) -> Self { ... }
       pub fn r(self) -> u8 { ... }
       pub fn g(self) -> u8 { ... }
       pub fn b(self) -> u8 { ... }
   }
   ```

3. **사용 예시**
   ```rust
   // ❌ 잘못된 방법: Rust 기본 타입 직접 사용
   pub struct FileHeader {
       pub version: u32,        // 스펙 문서와 불일치
       pub attributes: u32,     // DWORD인지 UINT32인지 불명확
   }
   
   // ✅ 올바른 방법: 스펙 문서의 자료형 사용
   pub struct FileHeader {
       pub version: DWORD,       // 스펙 문서와 1:1 매핑
       pub attributes: DWORD,   // 명확한 의미
   }
   ```

#### 장점
- **유지보수성**: 스펙 문서 변경 시 타입 정의만 수정하면 컴파일러가 영향 범위 자동 감지
- **가독성**: 타입 이름만 봐도 스펙 문서의 의미를 바로 파악 가능
- **타입 안전성**: 도메인 특화 타입으로 실수 방지 (예: `HWPUNIT`와 일반 `u32` 혼용 방지)
- **스펙 문서 일치**: 코드 리뷰 시 스펙 문서 참조가 쉬움

#### 참고
- 모든 타입 정의는 `crates/hwp-core/src/types.rs`에 위치
- `Serialize`/`Deserialize` 트레이트를 구현하여 JSON 직렬화 지원
- 도메인 특화 타입(`HWPUNIT`, `COLORREF` 등)은 유용한 변환 메서드 제공

### 테스트

#### Rust 테스트 (필수)

**중요**: `crates/hwp-core` 개발 시에는 반드시 다음을 수행해야 합니다:

1. **단위 테스트 작성**: 모든 기능에 대한 단위 테스트를 먼저 작성 (TDD 방식)
2. **스냅샷 테스트 작성**: JSON 출력 결과를 검증하기 위한 스냅샷 테스트 작성
3. **테스트 실행**: `bun run test:rust` 또는 `bun run test:rust-core`로 모든 테스트 통과 확인
4. **스냅샷 검토**: `bun run test:rust:snapshot:review`로 스냅샷 변경사항 검토 및 승인

**스냅샷 테스트 원칙**:
- JSON 출력 결과는 반드시 스냅샷으로 저장하여 검증
- 스냅샷 파일은 `crates/hwp-core/tests/snapshots/` 디렉토리에 저장
- 스냅샷 변경 시 `cargo insta review`로 변경사항을 검토하고 승인
- 스냅샷 파일은 git에 커밋하여 버전 관리

**테스트 파일 위치**:
- 테스트용 HWP 파일: `crates/hwp-core/tests/fixtures/` 디렉토리에 저장
- 테스트 코드에서 `common::find_fixture_file()` 함수를 사용하여 fixtures 파일 접근
- `common::find_fixtures_dir()` 함수로 fixtures 디렉토리 경로 확인 가능

**HTML 뷰어 테스트 규칙**:

HTML 뷰어 구현 및 디버깅 시 다음 규칙을 준수해야 합니다:

1. **원본 스냅샷 기준**: `crates/hwp-core/tests/fixtures/` 디렉토리의 `.html` 파일이 원본 스냅샷이며, 이것이 작업 결과물의 기준입니다.
   - 원본 HTML 파일은 `<link rel="stylesheet" type="text/css" href="*.css">` 태그로 외부 CSS 파일을 참조합니다.
   - 원본 HTML의 각 요소에는 이미 `style` 속성으로 인라인 스타일이 적용되어 있습니다.
   - 구현 시에는 원본의 `<link>` 태그를 `<style>` 태그로 대체하고, 각 요소의 `style` 속성은 원본과 동일하게 유지합니다.

2. **JSON 데이터 참조 필수**: HTML 출력을 검증할 때는 반드시 JSON 데이터를 참고해야 합니다.
   - JSON 스냅샷 파일: `crates/hwp-core/tests/snapshots/*.json`
   - HTML 구현은 JSON 데이터 구조와 일치해야 함
   - JSON의 모든 필드와 값이 HTML에 올바르게 반영되어야 함

3. **스펙 문서 및 JSON 기반 추론**: 모든 값은 스펙 문서와 JSON 데이터를 참조하여 추론해야 합니다.
   - **절대 임의의 상수나 값을 집어넣지 않음**: 하드코딩된 값, 추측한 값, 임의의 상수 사용 금지
   - 모든 값은 다음 중 하나에서 유도되어야 함:
     - HWP 스펙 문서 (`docs/docs/spec/hwp-5.0.md` 등)
     - JSON 스냅샷 데이터 (`crates/hwp-core/tests/snapshots/*.json`)
     - 원본 HTML 스냅샷 (`crates/hwp-core/tests/fixtures/*.html`)
   - 불확실한 값이 있으면 스펙 문서를 먼저 확인하고, JSON 데이터를 검증하여 사용

4. **구현 목표**: `<link>` 태그를 `<style>` 태그로 변경하는 것을 제외하고, 나머지는 완전히 동일하게 구현해야 합니다.
   - HTML 구조, 태그, 클래스명, 속성 등은 원본 HTML과 완전 일치
   - 원본의 `<link>` 태그는 `<style>` 태그로 대체되므로 이 부분만 구조적으로 다름
   - 각 요소의 `style` 속성은 원본과 완전히 동일해야 함
   - 텍스트 내용, 이미지, 테이블 구조, 요소 배치 등은 원본과 동일해야 함

5. **스냅샷 비교**:
   - HTML 스냅샷 파일: `crates/hwp-core/tests/snapshots/*.html.snap`
   - HTML 변경 시 `cargo insta review`로 변경사항 검토
   - JSON 스냅샷과 대조하여 누락된 요소나 잘못된 변환 확인
   - 원본 HTML(fixtures)과 비교하여 구조적 일치 여부 확인 (`<link>` → `<style>` 변경 제외)

**테스트 명령어**:
- Rust 테스트: `bun run test:rust`
- Rust 코어 테스트: `bun run test:rust-core`
- Rust 스냅샷 테스트: `bun run test:rust:snapshot`
- Rust 스냅샷 검토: `bun run test:rust:snapshot:review`

#### 기타 테스트
- Node.js 테스트: `bun run test:node`
- E2E 테스트: `bun run test:e2e`

### 빌드
- 전체 빌드: `bun run build`
- 개별 패키지 빌드는 각 패키지 디렉토리에서 실행

### 린트 및 포맷
- 린트 검사: `bun run lint`
- 포맷 적용: `bun run format`

### 커밋 규칙

**중요**: 모든 커밋은 단일 목적에 집중하고, 논리적으로 분리되어야 합니다.

#### 커밋 메시지 형식

```
<type>(<scope>): <subject>

<body>

<footer>
```

#### Type (필수)

- `feat`: 새로운 기능 추가
- `fix`: 버그 수정
- `refactor`: 코드 리팩토링 (기능 변경 없음)
- `test`: 테스트 추가/수정
- `docs`: 문서 업데이트
- `chore`: 빌드 설정, 의존성 업데이트 등
- `style`: 코드 포맷팅, 세미콜론 누락 등 (기능 변경 없음)

#### Scope (선택)

- `core`: hwp-core 관련
- `node`: Node.js 바인딩 관련
- `react-native`: React Native 바인딩 관련
- `docs`: 문서 관련

#### Subject (필수)

- 50자 이내로 간결하게 작성
- 명령형으로 작성 (과거형 X)
- 첫 글자는 대문자로 시작하지 않음
- 마지막에 마침표(.) 사용하지 않음

#### Body (선택)

- 72자마다 줄바꿈
- 무엇을, 왜 변경했는지 설명
- 어떻게 변경했는지는 코드로 보이므로 생략 가능

#### Footer (선택)

- Breaking changes, Issue 번호 등

#### 커밋 예시

```
feat(core): add insta for snapshot testing

- Add insta 1.43.2 as dev-dependency
- Enable snapshot testing for JSON output validation
```

```
fix(core): use ZlibDecoder instead of DeflateDecoder for zlib format

- Replace DeflateDecoder with ZlibDecoder to properly handle zlib format (RFC 1950)
- ZlibDecoder supports zlib headers and checksums, which HWP files use
```

```
refactor(core): reorganize modules to match HWP file structure

- Move FileHeader, DocInfo, BodyText, BinData under document/ module
- Organize modules to match HWP spec Table 2 structure
```

#### 커밋 원칙

1. **단일 목적**: 하나의 커밋은 하나의 목적만 가져야 함
2. **논리적 분리**: 관련 없는 변경사항은 별도 커밋으로 분리
3. **독립적 의미**: 각 커밋은 독립적으로 의미가 있어야 함
4. **되돌리기 용이**: 특정 기능만 되돌릴 수 있도록 구성
5. **작은 단위**: 가능한 작은 단위로 커밋 (하지만 너무 작지 않게)

#### 커밋 순서 예시

1. 의존성 추가
2. 타입 정의
3. 기능 구현
4. 리팩토링
5. 테스트 추가
6. 문서 업데이트

이 순서로 커밋하면 히스토리가 명확하고 이해하기 쉬워집니다.

## 패키지별 상세

### `crates/hwp-core`
- **역할**: HWP 파일 파싱 핵심 로직 및 문서 변환/뷰어 기능
- **의존성**: 없음 (순수 Rust 라이브러리)
- **인터페이스**: 파일 읽기를 위한 트레이트 정의
- **자료형 정의**: `src/types.rs`에 HWP 5.0 스펙 문서의 모든 자료형을 명시적으로 정의
  - 스펙 문서의 "표 1: 자료형"과 1:1 매핑
  - 기본 타입은 `type` 별칭으로, 도메인 특화 타입은 구조체로 정의
- **모듈 구조**:
  - **파싱 모듈** (`document/`): HWP 파일 구조(스펙 문서 표 2)에 맞춰 구성
    - `document/fileheader/`: FileHeader 스트림 파싱
    - `document/docinfo/`: DocInfo 스트림 파싱
    - `document/bodytext/`: BodyText 스토리지 파싱
    - `document/bindata/`: BinData 스토리지 파싱
    - 각 모듈은 상수, 직렬화 등을 별도 파일로 분리하여 가독성 향상
  - **뷰어 모듈** (`viewer/`): 문서 변환/뷰어 기능
    - **공통 로직** (`viewer/core/`): 모든 뷰어에서 공유하는 파싱 및 처리 로직
      - `Renderer` trait: 각 뷰어가 구현해야 하는 인터페이스
      - `process_bodytext`: 공통 본문 처리 로직
      - `process_paragraph`: 공통 문단 처리 로직
    - **현재 지원 형식**:
      - `viewer/markdown/`: 마크다운 변환 (완료)
      - `viewer/html/`: HTML 변환 (완료)
    - **향후 지원 예정**:
      - `viewer/canvas/`: Canvas 변환 (이미지/Canvas API 출력)
      - `viewer/pdf/`: PDF 변환 (PDF 문서 생성)
- **설계 원칙**:
  - 파싱(`document/`)과 변환(`viewer/`)의 관심사 분리
  - 각 형식별 변환 로직을 독립적인 모듈로 구성
  - 확장 가능한 구조로 다양한 출력 형식 지원
  - **CFB 경로 처리 모듈화**: 중첩 스토리지 접근은 `CfbParser::read_nested_stream()`을 사용하여 경로 형식 변경 시 한 곳만 수정하도록 설계
  - **BodyText 파싱 통합**: `HwpParser::parse()`에서 DocumentProperties의 `area_count`를 사용하여 BodyText 섹션을 자동으로 파싱
- **테스트**: 
  - **필수**: 모든 기능에 대한 단위 테스트 작성 (TDD 방식)
  - **필수**: JSON 출력 결과를 검증하는 스냅샷 테스트 작성
  - 테스트용 HWP 파일: `tests/fixtures/` 디렉토리에 저장
  - 스냅샷 파일은 `tests/snapshots/` 디렉토리에 저장
  - 스냅샷 변경 시 `cargo insta review`로 검토 및 승인
  - 테스트 코드에서 `common::find_fixture_file()` 함수를 사용하여 fixtures 파일 접근

### `packages/hwpjs`
- **역할**: 멀티 플랫폼 패키지 (Node.js, Web, React Native 모두 지원)
- **의존성**: `hwp-core`
- **도구**: 
  - NAPI-RS: Node.js/Web용 네이티브 모듈 빌드
  - Craby: React Native 바인딩
- **코드 위치**:
  - **NAPI-RS 코드**: 
    - `src/lib.rs`: NAPI-RS 바인딩 코드 (Node.js/Web용)
    - `build.rs`: NAPI-RS 빌드 스크립트
    - `npm/`: 플랫폼별 빌드 결과물 (`.node` 파일들)
  - **CLI 코드**:
    - `src-cli/`: CLI 도구 소스 코드
      - `index.ts`: CLI 진입점 (Commander.js 사용)
      - `commands/`: CLI 명령어 구현
        - `to-json.ts`: HWP를 JSON으로 변환
        - `to-markdown.ts`: HWP를 Markdown으로 변환 (이미지 파일 저장 지원)
        - `info.ts`: HWP 파일 정보 출력
        - `extract-images.ts`: 이미지 추출
        - `batch.ts`: 배치 처리
    - `bin/hwpjs.js`: CLI 실행 파일
    - `dist/cli/`: 빌드된 CLI 코드 (TypeScript 컴파일 결과)
  - **Craby 코드**:
    - `src-reactnative/`: TypeScript 바인딩 코드
      - `index.ts`: React Native 모듈 진입점
      - `NativeReactNative.ts`: 네이티브 모듈 타입 정의
    - `crates/lib/`: Rust FFI 코드
      - `src/ffi.rs`: CXX 브릿지 FFI 정의
      - `src/generated.rs`: Crabygen으로 생성된 코드
      - `src/hwpjs_impl.rs`: React Native 구현 로직
      - `src/lib.rs`: 라이브러리 진입점
    - `cpp/`: C++ 바인딩 코드
      - `CxxHwpjsModule.cpp/hpp`: C++ 모듈 구현
      - `bridging-generated.hpp`: CXX 브릿지 생성 코드
    - `android/`, `ios/`: 플랫폼별 네이티브 코드
- **CLI 명령어**:
  - `to-json`: HWP 파일을 JSON으로 변환
  - `to-markdown`: HWP 파일을 Markdown으로 변환 (이미지 파일 저장 옵션 지원)
  - `info`: HWP 파일의 기본 정보 출력
  - `extract-images`: HWP 파일에서 이미지 추출
  - `batch`: 여러 HWP 파일을 배치 처리
- **테스트**: 
  - Node.js: Bun
  - React Native: Maestro (E2E)
- **배포**: tsdown

### `examples/`
- **역할**: 각 환경별 사용 예제
- **내용**: 기본적인 사용법 예제 코드
  - `node/`: Node.js 프로그래밍 예제
  - `web/`: 웹 브라우저 사용 예제
  - `react-native/`: React Native 앱 예제
  - `cli/`: CLI 도구 사용 예제

### `docs/`
- **역할**: 프로젝트 문서 사이트
- **도구**: Rspress
- **위치**: packages 밖 (루트 레벨)
- **메뉴 구조**:
  - 가이드: 사용 가이드 및 예제
  - API: API 레퍼런스
  - 명세서: HWP 파일 형식 명세서
    - HWP 3.0 / HWPML 형식
    - HWP 5.0 형식
    - 배포용 문서 형식
    - 수식 형식
    - 차트 형식

## 주의사항

1. **hwp-core**: 핵심 HWP 파싱 로직이 구현되어 있으며, HWP 5.0 형식의 주요 기능을 지원합니다.
2. **packages/hwpjs**: 멀티 플랫폼 패키지로 Node.js, Web, React Native 환경을 모두 지원합니다.
   - NAPI-RS를 통한 Node.js/Web 바인딩
   - Craby를 통한 React Native 바인딩
3. **파일 읽기**: 환경별로 파일 읽기 로직이 다르게 구현되지만, 핵심 파싱 로직은 `hwp-core`에서 공유됩니다.
4. **문서 변환**: 현재 마크다운과 HTML 변환을 지원하며, 향후 Canvas와 PDF 형식 지원 예정입니다.
   - **현재 지원**: Markdown, HTML
   - **향후 지원**: Canvas (이미지/Canvas API), PDF
   - **공통 구조**: 모든 뷰어는 `viewer/core/`의 공통 로직을 사용하고 `Renderer` trait을 구현

## 로드맵 및 백로그

프로젝트의 전략적 계획과 구체적인 작업 항목은 다음 디렉토리에서 관리됩니다:

- **로드맵**: `docs/docs/roadmap/` - 전략적 계획 및 장기 목표
  - 단기 계획: HWP 5.0 파서 구현, 마크다운 뷰어, 수식 및 차트 지원
  - 장기 계획: PDF/이미지 뷰어, HWPX 형식 구현
- **백로그**: `docs/docs/backlog/` - 구체적인 작업 항목
  - 백로그 개요: `docs/docs/backlog/00_overview.md` (AI가 읽어야 할 주요 파일)
  - 현재 작업: `docs/docs/backlog/10_current_tasks.md`

로드맵과 백로그는 Rspress 문서 사이트에도 포함되어 공개됩니다.

## packages/hwpjs 구조와 원리

`packages/hwpjs`는 Node.js, Web, React Native 환경을 모두 지원하는 멀티 플랫폼 패키지입니다.

### 이중 빌드 시스템

패키지는 두 가지 빌드 시스템을 사용하여 다양한 환경을 지원합니다:

1. **NAPI-RS**: Node.js/Web용 네이티브 모듈 빌드
   - `bun run build:node`
   - 플랫폼별 `.node` 바이너리 생성
   - Node.js N-API를 통한 네이티브 바인딩

2. **Craby**: React Native용 네이티브 모듈 빌드
   - `craby build`
   - iOS/Android 네이티브 모듈 생성
   - Rust -> C++ 바인딩을 통한 React Native 통합

3. **tsdown**: TypeScript 번들링
   - `tsdown` 명령으로 ESM/CJS 형식으로 변환
   - React Native용 별도 번들 생성 (`dist/react-native/`)

### 환경별 exports 분기

`package.json`의 `exports` 필드를 사용하여 환경별로 다른 진입점을 제공합니다:

```json
{
  "exports": {
    ".": {
      "react-native": {
        "types": "./dist/react-native/index.d.mts",
        "default": "./dist/react-native/index.mjs"
      },
      "browser": {
        "types": "./dist/index.d.ts",
        "default": "./dist/browser.js"
      },
      "node": {
        "types": "./dist/index.d.ts",
        "default": "./dist/index.js"
      },
      "default": "./dist/browser.js",
      "types": "./dist/index.d.ts"
    },
    "./package.json": "./package.json"
  }
}
```

- **react-native**: React Native 환경에서 자동으로 `dist/react-native/` 경로 사용
- **browser**: 브라우저 환경에서 `dist/browser.js` 사용 (WASM 빌드)
- **node**: Node.js 환경에서 `dist/index.js` 사용 (네이티브 모듈)
- **default**: 기본값으로 `dist/browser.js` 사용
- **./package.json**: 패키지 메타데이터 접근용 export

### 플랫폼별 바이너리 패키징

NAPI-RS는 `napi prepublish` 명령을 통해 플랫폼별 바이너리를 별도 npm 패키지로 분리합니다:

- 각 플랫폼별로 `@ohah/hwpjs-{platform}-{arch}` 형식의 패키지 생성
- 메인 패키지의 `optionalDependencies`에 포함
- npm이 자동으로 적절한 플랫폼 패키지를 선택하여 설치

지원 플랫폼:
- Windows (x64, ia32, arm64)
- macOS (x64, arm64, universal)
- Linux (x64, arm64, arm, 다양한 libc 변형)
- Android (arm64, arm-eabi)

### 빌드 프로세스

전체 빌드 프로세스는 다음과 같습니다:

1. **NAPI 빌드**: `napi build --platform --release --package hwpjs`
   - Rust 코드를 플랫폼별 네이티브 바이너리로 컴파일
   - `.node` 파일 생성

2. **Craby 빌드**: `craby build`
   - React Native용 네이티브 모듈 빌드
   - iOS/Android 라이브러리 생성

3. **TypeScript 번들링**: `tsdown`
   - TypeScript 소스를 ESM/CJS로 변환
   - React Native용 별도 번들 생성

## 뷰어 아키텍처 및 확장 계획

### 뷰어 모듈 구조

`crates/hwp-core/src/viewer/` 디렉토리는 다음과 같이 구성됩니다:

#### 공통 Core 모듈 (`viewer/core/`)

모든 뷰어에서 공유하는 파싱 및 처리 로직을 제공합니다:

- **`renderer.rs`**: `Renderer` trait 정의
  - 각 뷰어가 구현해야 하는 인터페이스
  - 텍스트 스타일링, 구조 요소, 문서 구조, 특수 요소 렌더링 메서드 정의
- **`bodytext.rs`**: 공통 본문 처리 로직
  - `process_bodytext`: 본문을 파싱하여 `DocumentParts`로 분리
  - 머리말, 본문, 꼬리말, 각주, 미주 처리
  - 개요 번호 추적기 관리
- **`paragraph.rs`**: 공통 문단 처리 로직
  - `process_paragraph`: 문단 레코드를 처리
  - 컨트롤 헤더, 테이블, 이미지 등 처리
- **`table.rs`**: 공통 테이블 처리 로직 (예정)

#### 뷰어별 모듈 구조

각 뷰어는 동일한 구조를 따릅니다:

```
viewer/{format}/
├── mod.rs              # 뷰어 진입점 (to_{format} 함수, {Format}Options)
├── renderer.rs         # {Format}Renderer 구현 (Renderer trait)
├── common.rs           # 공통 유틸리티 (이미지 처리 등)
├── utils.rs            # 유틸리티 함수 (개요 번호 추적 등)
├── document/           # 문서 레벨 변환
│   ├── mod.rs
│   ├── docinfo.rs      # 문서 정보 변환
│   ├── fileheader.rs   # 파일 헤더 변환
│   └── bodytext/       # 본문 텍스트 변환
│       ├── mod.rs
│       ├── paragraph.rs    # 문단 변환
│       ├── para_text.rs    # 텍스트 변환 (글자 모양 적용)
│       ├── table.rs        # 테이블 변환
│       ├── list_header.rs  # 목록 헤더 변환
│       ├── shape_component.rs           # 도형 컴포넌트 변환
│       └── shape_component_picture.rs   # 그림 변환
└── ctrl_header/        # 컨트롤 헤더 변환
    ├── mod.rs
    ├── table.rs        # 테이블 컨트롤
    ├── footnote.rs      # 각주 컨트롤
    ├── endnote.rs       # 미주 컨트롤
    ├── header.rs        # 머리말 컨트롤
    ├── footer.rs        # 꼬리말 컨트롤
    ├── page_number.rs   # 페이지 번호 컨트롤
    ├── shape_object.rs  # 도형 객체 컨트롤
    └── column_def.rs   # 단 정의 컨트롤
```

### 현재 구현된 뷰어

#### Markdown 뷰어 (`viewer/markdown/`)

- **상태**: 완료
- **출력 형식**: Markdown 텍스트
- **특징**:
  - 텍스트 기반 출력
  - 이미지는 파일로 저장하거나 base64 데이터 URI로 임베드
  - 테이블은 Markdown 테이블 형식으로 변환
  - 각주/미주는 `[^1]:` 형식으로 변환

#### HTML 뷰어 (`viewer/html/`)

- **상태**: 완료
- **출력 형식**: 완전한 HTML 문서 (`<html>`, `<head>`, `<body>` 포함)
- **특징**:
  - CSS 클래스 기반 스타일링 (접두사: `ohah-hwpjs-`)
  - CSS reset 포함
  - 폰트, 테두리/배경을 CSS 클래스로 매핑
  - 이미지는 base64 데이터 URI 또는 파일 참조
  - 테이블은 `<table>` 태그로 변환 (colspan, rowspan 지원)
  - 각주/미주는 `<div>` 컨테이너로 변환

### 향후 구현 예정 뷰어

#### Canvas 뷰어 (`viewer/canvas/`)

- **상태**: 예정
- **출력 형식**: Canvas API 명령 또는 이미지 파일 (PNG, JPEG 등)
- **용도**:
  - 웹 브라우저에서 Canvas로 렌더링
  - 이미지 파일로 내보내기
  - 프리뷰 생성
- **구조**:
  - `CanvasRenderer`: Canvas API 명령 생성
  - `CanvasOptions`: 해상도, 이미지 형식, 품질 등 설정
  - `to_canvas()`: Canvas 명령 시퀀스 반환
  - `to_image()`: 이미지 파일로 내보내기
- **의존성 예정**: 
  - Canvas API (웹 환경)
  - 이미지 인코딩 라이브러리 (PNG, JPEG 등)

#### PDF 뷰어 (`viewer/pdf/`)

- **상태**: 예정
- **출력 형식**: PDF 문서
- **용도**:
  - PDF 문서 생성
  - 인쇄용 문서 변환
  - 보관용 문서 변환
- **구조**:
  - `PdfRenderer`: PDF 문서 생성
  - `PdfOptions`: 페이지 크기, 여백, 폰트 임베딩 등 설정
  - `to_pdf()`: PDF 바이트 스트림 반환
- **의존성 예정**:
  - PDF 생성 라이브러리 (예: `printpdf`, `pdf-writer` 등)
  - 폰트 처리 라이브러리

### 뷰어 확장 가이드

새로운 뷰어를 추가할 때는 다음 단계를 따릅니다:

1. **폴더 구조 생성**: `viewer/{format}/` 디렉토리 생성
2. **Renderer 구현**: `viewer/{format}/renderer.rs`에서 `Renderer` trait 구현
3. **옵션 정의**: `{Format}Options` 구조체 정의
4. **진입점 함수**: `to_{format}()` 함수 구현
5. **문서 변환 모듈**: `document/` 하위 모듈 구현
6. **컨트롤 헤더 변환**: `ctrl_header/` 하위 모듈 구현
7. **유틸리티 함수**: `utils.rs`, `common.rs` 구현
8. **테스트 추가**: 스냅샷 테스트 및 단위 테스트 작성

### 공통 로직 활용

모든 뷰어는 `viewer/core/`의 공통 로직을 활용합니다:

- **`process_bodytext`**: 본문 파싱 및 분리
- **`process_paragraph`**: 문단 처리
- **개요 번호 추적**: 각 뷰어별 `OutlineNumberTracker` 사용
- **하이브리드 접근**: 복잡한 렌더링은 기존 뷰어 함수를 직접 호출

이를 통해 코드 중복을 최소화하고 일관된 동작을 보장합니다.
