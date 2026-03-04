# 개발 가이드

이 문서는 `@ohah/hwpjs` 패키지를 개발하고 빌드하는 방법을 설명합니다.

## 요구사항

- Rust (최신 버전)
- Node.js 12.22.0+ (N-API 지원)
- Bun (빌드 스크립트 실행용)

## 개발 환경 설정

```bash
# 저장소 클론
git clone https://github.com/ohah/hwpjs.git
cd hwpjs

# 의존성 설치
bun install
```

## 빌드

### 모든 플랫폼 빌드

```bash
# 모든 플랫폼 빌드
bun run build
```

이 명령은 다음을 빌드합니다:
- Node.js 네이티브 모듈 (Windows, macOS, Linux)
- WebAssembly 모듈
- React Native 모듈 (iOS, Android)

### 특정 플랫폼만 빌드

```bash
# Node.js 특정 플랫폼
bun run build:node:macos-arm64
bun run build:node:macos-x64
bun run build:node:windows-x64
bun run build:node:windows-x86
bun run build:node:windows-arm64
bun run build:node:linux-x64

# WebAssembly
bun run build:web:wasm

# React Native
bun run build:react-native
```

### 맥에서 Windows / Linux 크로스 빌드

맥(macOS)에서 Windows·Linux용 Node 네이티브 모듈을 빌드하려면 아래 도구를 설치한 뒤 위 플랫폼별 스크립트를 사용하면 됩니다.

- **Windows용 (맥 → win32)**  
  `build:node:windows-*`는 `--cross-compile`을 사용하며, **cargo-xwin**이 있으면 자동으로 사용합니다.
  ```bash
  cargo install cargo-xwin
  rustup target add x86_64-pc-windows-msvc i686-pc-windows-msvc aarch64-pc-windows-msvc
  cd packages/hwpjs && bun run build:node:windows-x64   # 또는 windows-x86, windows-arm64
  ```

- **Linux용 (맥 → linux)**  
  `build:node:linux-x64`는 `--use-cross`를 사용하며, **Colima**(또는 Docker/Podman)와 **cross**가 필요합니다. macOS(Intel·Apple Silicon 모두)에서는 Colima를 권장합니다(Docker Desktop 없이 Docker 호환 환경 제공). Apple Silicon에서도 Colima로 동일하게 사용 가능합니다.
  ```bash
  # 1) Colima + Docker CLI 설치 (macOS 권장, Apple Silicon 포함)
  brew install colima docker
  colima start   # VM 시작 후 docker 명령 사용 가능

  # 2) cross 설치
  cargo install cross

  # 3) Apple Silicon (M1/M2/M3)인 경우: cross가 Linux 툴체인을 쓰기 위해 타겟·툴체인 등록 필요
  rustup target add x86_64-unknown-linux-gnu
  rustup toolchain add stable-x86_64-unknown-linux-gnu --profile minimal --force-non-host

  # 4) Linux x64 빌드 (Apple Silicon에서는 플랫폼 지정 권장)
  cd packages/hwpjs
  CROSS_BUILD_OPTS="--platform linux/amd64" bun run build:node:linux-x64
  ```
  결과물: `dist/hwpjs.linux-x64-gnu.node`  
  자세한 설치·설정은 문서 사이트의 [개발 가이드 - Linux x64 크로스 빌드](https://ohah.github.io/hwpjs/guide/development#linux-x64-크로스-빌드-macos)를 참고하세요.

### 릴리스 빌드

```bash
# 모든 플랫폼 빌드 및 아티팩트 준비
bun run build:release
```

이 명령은 다음을 수행합니다:
- 모든 플랫폼 빌드
- 플랫폼별 npm 패키지 준비
- 아티팩트 생성

## 테스트

```bash
# 테스트 실행
bun test
```

## 배포

### CI/자동 배포 (GitHub Actions)

- **워크플로**: 루트 `.github/workflows/ci.yml`  
  - `main` 브랜치/PR 푸시: 린트, 플랫폼별 빌드(Windows/macOS/Linux/WASM), 바인딩 테스트
  - **태그 푸시**: 위 단계 통과 후 npm 자동 배포
- **npm 자동 배포 조건**: 태그를 푸시하면 빌드·테스트 후 `NPM_TOKEN`으로 npm publish 실행  
  - 버전에 `rc`/`beta`/`alpha`가 있으면 `--tag next`, 아니면 `latest`
- **필요 시크릿**: 저장소 Settings → Secrets and variables → Actions에 `NPM_TOKEN` 등록 (npm 배포용)

### 사전 준비 (로컬 배포 시)

1. **NPM 인증 설정**
   - `.npmrc` 파일에 토큰 설정 또는 `NPM_OHAH_TOKEN` 환경변수 설정
   - 또는 `npm login` 실행

2. **GitHub CLI 설치** (GitHub Release 생성을 위해)
   ```bash
   brew install gh
   gh auth login
   ```

### 배포 프로세스

#### 1. 빌드 및 준비

```bash
# 모든 플랫폼 빌드 및 아티팩트 준비
bun run build:release
```

#### 2. GitHub Release 생성

```bash
# 현재 버전으로 GitHub Release 생성 및 아티팩트 업로드
bun run release

# 또는 특정 버전 지정
bash scripts/releash.sh 0.1.0-rc.2
```

이 스크립트는 다음을 수행합니다:
- 태그 생성 및 푸시
- GitHub Release 생성
- 플랫폼별 아티팩트 압축 및 업로드 (node-*.zip, react-native-*.zip, dist.zip)

#### 3. npm 배포

```bash
# Pre-release 버전 배포 (자동으로 --tag next 사용)
bun run publish:npm:next

# 또는 정식 릴리스 배포
bun run publish:npm:latest

# 또는 태그 자동 결정 (rc/beta/alpha면 next, 아니면 latest)
bun run publish:npm
```

이 스크립트는 다음을 수행합니다:
- 플랫폼별 패키지들 배포 (`npm/*/` 폴더의 각 패키지)
- 메인 패키지 배포 (`@ohah/hwpjs`)

### 로컬 배포 실행 순서

**실행 위치**: 아래 명령은 모두 **`packages/hwpjs` 디렉터리**에서 실행합니다.

```bash
cd packages/hwpjs
```

| 순서 | 명령 | 설명 |
|------|------|------|
| 0 | (선택) 버전 수정 | 아래 **버전 수정 대상 파일** 참고. 수정 후 커밋 |
| 1 | `bun run build:release` | Windows/macOS/Linux/WASM 전 플랫폼 빌드, `npm/` 디렉터리·아티팩트 준비 (실패한 플랫폼은 건너뜀) |
| 2 | `bun run release` | 현재 버전으로 Git 태그 생성·푸시, GitHub Release 생성, `npm/*.zip`·`dist.zip` 등 업로드 (내부: `scripts/releash.sh`) |
| 3 | `bun run publish:npm:next` 또는 `bun run publish:npm:latest` | npm 배포 (내부: `scripts/publish.sh`). rc/beta/alpha면 `next`, 아니면 `latest` 태그 사용 |

**버전 수정 대상 파일** (순서 0):

버전을 변경할 때는 다음 파일들을 **모두** 수정해야 합니다:

| 파일 | 수정 항목 |
|------|-----------|
| `packages/hwpjs/package.json` | `version` 필드 + `optionalDependencies`의 플랫폼별 패키지 버전 7개 |
| `packages/hwpjs/npm/darwin-arm64/package.json` | `version` 필드 |
| `packages/hwpjs/npm/darwin-x64/package.json` | `version` 필드 |
| `packages/hwpjs/npm/linux-x64-gnu/package.json` | `version` 필드 |
| `packages/hwpjs/npm/win32-x64-msvc/package.json` | `version` 필드 |
| `packages/hwpjs/npm/win32-ia32-msvc/package.json` | `version` 필드 |
| `packages/hwpjs/npm/win32-arm64-msvc/package.json` | `version` 필드 |
| `packages/hwpjs/npm/wasm32-wasi/package.json` | `version` 필드 |

> `dist/index.js`의 버전 체크 코드는 `build:release` 시 napi-rs가 자동 재생성하므로 수동 수정 불필요.

**한 줄 요약** (pre-release 예시):

```bash
cd packages/hwpjs
bun run build:release && bun run release && bun run publish:npm:next
```

**주의**:
- `build:release`는 **packages/hwpjs** 기준으로 동작하며, Linux 빌드는 Colima+Docker+cross가 필요합니다 (실패 시 `|| true`로 나머지 플랫폼만 진행).
- `release`는 **GitHub CLI(`gh`)**와 `gh auth login`이 필요하며, 태그 푸시로 인해 **CI에서도 npm 배포**가 돌 수 있습니다. CI를 쓰려면 저장소에 `NPM_TOKEN` 시크릿을 등록해 두세요.
- npm 배포는 **NPM_TOKEN** 또는 `npm login`으로 인증된 상태에서 실행합니다.

### 전체 배포 예시

```bash
# 1. 빌드
bun run build:release

# 2. GitHub Release 생성
bun run release

# 3. npm 배포
bun run publish:npm:next  # Pre-release인 경우
# 또는
bun run publish:npm:latest  # 정식 릴리스인 경우
```
