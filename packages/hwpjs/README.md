# `@napi-rs/package-template`

![https://github.com/napi-rs/package-template/actions](https://github.com/napi-rs/package-template/workflows/CI/badge.svg)

> Template project for writing node packages with napi-rs.

# Usage

1. Click **Use this template**.
2. **Clone** your project.
3. Run `yarn install` to install dependencies.
4. Run `yarn napi rename -n [@your-scope/package-name] -b [binary-name]` command under the project folder to rename your package.

## Install this test package

```bash
yarn add @napi-rs/package-template
```

## Ability

### Build

After `yarn build/npm run build` command, you can see `package-template.[darwin|win32|linux].node` file in project root. This is the native addon built from [lib.rs](./src/lib.rs).

### Test

With [ava](https://github.com/avajs/ava), run `yarn test/npm run test` to testing native addon. You can also switch to another testing framework if you want.

### CI

With GitHub Actions, each commit and pull request will be built and tested automatically in [`node@20`, `@node22`] x [`macOS`, `Linux`, `Windows`] matrix. You will never be afraid of the native addon broken in these platforms.

### Release

Release native package is very difficult in old days. Native packages may ask developers who use it to install `build toolchain` like `gcc/llvm`, `node-gyp` or something more.

With `GitHub actions`, we can easily prebuild a `binary` for major platforms. And with `N-API`, we should never be afraid of **ABI Compatible**.

The other problem is how to deliver prebuild `binary` to users. Downloading it in `postinstall` script is a common way that most packages do it right now. The problem with this solution is it introduced many other packages to download binary that has not been used by `runtime codes`. The other problem is some users may not easily download the binary from `GitHub/CDN` if they are behind a private network (But in most cases, they have a private NPM mirror).

In this package, we choose a better way to solve this problem. We release different `npm packages` for different platforms. And add it to `optionalDependencies` before releasing the `Major` package to npm.

`NPM` will choose which native package should download from `registry` automatically. You can see [npm](./npm) dir for details. And you can also run `yarn add @napi-rs/package-template` to see how it works.

## Develop requirements

- Install the latest `Rust`
- Install `Node.js@10+` which fully supported `Node-API`
- Install `yarn@1.x`

## Test in local

- yarn
- yarn build
- yarn test

And you will see:

```bash
$ ava --verbose

  ✔ sync function from native code
  ✔ sleep function from native code (201ms)
  ─

  2 tests passed
✨  Done in 1.12s.
```

## Release package

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

### GitHub Actions를 통한 자동 배포

GitHub Actions를 사용하는 경우:

```bash
npm version [<newversion> | major | minor | patch | premajor | preminor | prepatch | prerelease [--preid=<prerelease-id>] | from-git]

git push
```

GitHub Actions가 자동으로 빌드 및 배포를 수행합니다.

> **참고**: Pre-release 버전(rc, beta, alpha)은 `--tag next` 옵션이 필요합니다.
