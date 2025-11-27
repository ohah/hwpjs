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
│       └── src/
│           ├── document/  # 문서 파싱 모듈
│           └── viewer/     # 문서 변환/뷰어 모듈 (마크다운, PDF(지원 예정) 등)
├── packages/
│   ├── react-native/      # React Native용 래퍼 (Craby 사용)
│   └── hwpjs/             # Node.js용 래퍼 (NAPI-RS 사용)
├── examples/              # 사용 예제 코드
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
│   ├── fileheader/          # FileHeader 스트림 (파일 인식 정보)
│   │   ├── mod.rs           # 구조체 정의 및 파싱 로직
│   │   ├── constants.rs     # 플래그 상수 (document_flags, license_flags)
│   │   └── serialize.rs     # JSON 직렬화 함수
│   ├── docinfo/             # DocInfo 스트림 (문서 정보)
│   │   └── mod.rs
│   ├── bodytext/            # BodyText 스토리지 (본문)
│   │   └── mod.rs
│   └── bindata/             # BinData 스토리지 (바이너리 데이터)
│       └── mod.rs
├── viewer/                   # 문서 변환/뷰어 모듈
│   ├── mod.rs               # 뷰어 모듈 진입점
│   └── markdown.rs          # 마크다운 변환 로직
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

#### `packages/react-native`
- Craby를 사용하여 React Native 환경에서 사용 가능
- `hwp-core`를 의존성으로 사용
- React Native 환경의 파일 읽기 구현
- Maestro를 사용한 E2E 테스트

#### `packages/node`
- NAPI-RS를 사용하여 Node.js 네이티브 모듈 생성
- `hwp-core`를 의존성으로 사용
- Node.js 환경의 파일 읽기 구현
- Vitest를 사용한 유닛 테스트
- tsdown을 사용한 배포

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
- 스냅샷 파일은 `crates/hwp-core/src/snapshots/` 디렉토리에 저장
- 스냅샷 변경 시 `cargo insta review`로 변경사항을 검토하고 승인
- 스냅샷 파일은 git에 커밋하여 버전 관리

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
    - `viewer/markdown.rs`: 마크다운 변환 로직
    - 향후 `viewer/html.rs`, `viewer/pdf.rs` 등 추가 예정
- **설계 원칙**:
  - 파싱(`document/`)과 변환(`viewer/`)의 관심사 분리
  - 각 형식별 변환 로직을 독립적인 모듈로 구성
  - 확장 가능한 구조로 다양한 출력 형식 지원
  - **CFB 경로 처리 모듈화**: 중첩 스토리지 접근은 `CfbParser::read_nested_stream()`을 사용하여 경로 형식 변경 시 한 곳만 수정하도록 설계
  - **BodyText 파싱 통합**: `HwpParser::parse()`에서 DocumentProperties의 `area_count`를 사용하여 BodyText 섹션을 자동으로 파싱
- **테스트**: 
  - **필수**: 모든 기능에 대한 단위 테스트 작성 (TDD 방식)
  - **필수**: JSON 출력 결과를 검증하는 스냅샷 테스트 작성
  - 스냅샷 파일은 `src/snapshots/` 디렉토리에 저장
  - 스냅샷 변경 시 `cargo insta review`로 검토 및 승인

### `packages/react-native(지원 X)`
- **역할**: React Native 환경에서 HWP 파일 읽기
- **의존성**: `hwp-core`
- **도구**: Craby
- **테스트**: Maestro

### `packages/hwpjs`
- **역할**: Node.js 환경에서 HWP 파일 읽기
- **의존성**: `hwp-core`
- **도구**: NAPI-RS
- **테스트**: Bun
- **배포**: tsdown

### `examples/`
- **역할**: 각 환경별 사용 예제
- **내용**: 기본적인 사용법 예제 코드

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

1. hwp-core를 제외한 나머지는 초기설정 단계이며 "Hello World" 수준의 코드만 포함
2. 실제 Rust 구현은 이후 단계에서 진행
3. Craby와 NAPI-RS 프로젝트 초기화는 각각의 CLI 도구로 진행 예정
4. 파일 읽기 로직은 환경별로 다르게 구현되지만, 핵심 파싱 로직은 공유

## 로드맵 및 백로그

프로젝트의 전략적 계획과 구체적인 작업 항목은 다음 디렉토리에서 관리됩니다:

- **로드맵**: `docs/docs/roadmap/` - 전략적 계획 및 장기 목표
  - 단기 계획: HWP 5.0 파서 구현, 마크다운 뷰어, 수식 및 차트 지원
  - 장기 계획: PDF/이미지 뷰어, HWPX 형식 구현
- **백로그**: `docs/docs/backlog/` - 구체적인 작업 항목
  - 현재 작업: `docs/docs/backlog/10_current_tasks.md`
  - 백로그 개요: `docs/docs/backlog/00_overview.md`

로드맵과 백로그는 Rspress 문서 사이트에도 포함되어 공개됩니다.

## packages/hwpjs 배포 구조와 원리

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
      "import": {
        "types": "./dist/index.d.mts",
        "default": "./dist/index.mjs"
      },
      "require": {
        "types": "./dist/index.d.ts",
        "default": "./dist/index.js"
      },
      "browser": "./browser.js",
      "default": "./index.js"
    }
  }
}
```

- **react-native**: React Native 환경에서 자동으로 `dist/react-native/` 경로 사용
- **import**: ESM 환경에서 `dist/index.mjs` 사용
- **require**: CommonJS 환경에서 `dist/index.js` 사용
- **browser**: 브라우저 환경에서 `browser.js` 사용 (WASI 폴백)

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

### 배포 흐름

배포 전 `prepublishOnly` 훅에서 다음 작업을 수행합니다:

1. `napi prepublish -t npm`: 플랫폼별 패키지 준비
2. 각 플랫폼별 바이너리를 별도 디렉토리로 분리
3. npm 패키지 메타데이터 생성

배포 시:
- 메인 패키지 (`@ohah/hwpjs`)가 npm에 게시됨
- 플랫폼별 패키지들이 `optionalDependencies`로 참조됨
- 사용자가 설치할 때 npm이 자동으로 적절한 플랫폼 패키지를 선택

### 파일 구조

배포되는 파일은 `package.json`의 `files` 필드로 제어됩니다:

- `index.js`, `index.d.ts`: Node.js 진입점
- `dist/`: 번들된 TypeScript 파일
- `android/`, `ios/`: React Native 네이티브 모듈
- `cpp/`: C++ 바인딩 코드
- `*.podspec`: iOS CocoaPods 설정
