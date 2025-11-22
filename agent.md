# HWPJS 프로젝트 - AI 에이전트 가이드

## 프로젝트 개요

HWPJS는 한글과컴퓨터의 한/글 문서 파일(.hwp)을 읽고 파싱하는 라이브러리입니다. 
이 프로젝트는 Rust로 핵심 로직을 구현하고, React Native와 Node.js 환경에서 사용할 수 있도록 래퍼를 제공합니다.

### HWP 파일 스펙 문서

**중요**: `.hwp` 파일을 읽고 파싱할 때는 반드시 `hwp/document.md` 파일을 참조해야 합니다.
이 파일은 한글과컴퓨터에서 공개한 한/글 문서 파일 형식 5.0의 공식 스펙 문서입니다.
HWP 파일의 구조, 데이터 레코드, 스토리지 정보 등 모든 구현은 이 문서를 기준으로 해야 합니다.

## 프로젝트 구조

```
hwpjs/
├── crates/
│   └── hwp-core/          # 공유 Rust 라이브러리 (핵심 HWP 파싱 로직)
├── packages/
│   ├── react-native/      # React Native용 래퍼 (Craby 사용)
│   └── node/              # Node.js용 래퍼 (NAPI-RS 사용)
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
- **테스트 (Node)**: Vitest
- **배포 (Node)**: tsdown

### 문서
- **Rspress**: 문서 사이트 생성

### 테스트
- **React Native**: Maestro (E2E 테스트)
- **Node.js**: Vitest (유닛 테스트)
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

### 테스트
- Rust 테스트: `bun run test:rust`
- Node.js 테스트: `bun run test:node`
- E2E 테스트: `bun run test:e2e`

### 빌드
- 전체 빌드: `bun run build`
- 개별 패키지 빌드는 각 패키지 디렉토리에서 실행

### 린트 및 포맷
- 린트 검사: `bun run lint`
- 포맷 적용: `bun run format`

## 패키지별 상세

### `crates/hwp-core`
- **역할**: HWP 파일 파싱 핵심 로직
- **의존성**: 없음 (순수 Rust 라이브러리)
- **인터페이스**: 파일 읽기를 위한 트레이트 정의

### `packages/react-native`
- **역할**: React Native 환경에서 HWP 파일 읽기
- **의존성**: `hwp-core`
- **도구**: Craby
- **테스트**: Maestro

### `packages/node`
- **역할**: Node.js 환경에서 HWP 파일 읽기
- **의존성**: `hwp-core`
- **도구**: NAPI-RS
- **테스트**: Vitest
- **배포**: tsdown

### `examples/`
- **역할**: 각 환경별 사용 예제
- **내용**: 기본적인 사용법 예제 코드

### `docs/`
- **역할**: 프로젝트 문서 사이트
- **도구**: Rspress
- **위치**: packages 밖 (루트 레벨)

## 주의사항

1. 모든 패키지는 초기 설정 단계이며 "Hello World" 수준의 코드만 포함
2. 실제 Rust 구현은 이후 단계에서 진행
3. Craby와 NAPI-RS 프로젝트 초기화는 각각의 CLI 도구로 진행 예정
4. 파일 읽기 로직은 환경별로 다르게 구현되지만, 핵심 파싱 로직은 공유

