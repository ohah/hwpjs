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
  `build:node:linux-x64`는 `--use-cross`를 사용하며, **Docker**와 **cross**가 필요합니다.
  ```bash
  cargo install cross
  cd packages/hwpjs && bun run build:node:linux-x64
  ```

자세한 내용은 문서 사이트의 [개발 가이드](https://ohah.github.io/hwpjs/guide/development)를 참고하세요.

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

### 사전 준비

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
