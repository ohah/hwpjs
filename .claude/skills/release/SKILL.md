---
name: release
description: hwpjs 배포 플로우. 버전 범프, 빌드, 커밋, PR 생성, npm 배포, GitHub 릴리즈까지 전체 과정을 수행한다.
disable-model-invocation: true
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Agent
argument-hint: [version (예: 0.1.0-rc.10)]
---

# hwpjs 배포 플로우

`$ARGUMENTS` 버전으로 배포를 진행한다.

## 1. 버전 업데이트

아래 파일들의 버전을 `$ARGUMENTS`로 변경한다:

- `packages/hwpjs/package.json`
  - `version` 필드
  - `optionalDependencies`의 모든 `@ohah/hwpjs-*` 패키지 버전
- `packages/hwpjs/npm/*/package.json` (7개 플랫폼 패키지)
  - darwin-arm64, darwin-x64, linux-x64-gnu, wasm32-wasi, win32-arm64-msvc, win32-ia32-msvc, win32-x64-msvc
- `bun.lock` 내 `@ohah/hwpjs` 관련 버전

## 2. 릴리스 빌드

```bash
cd packages/hwpjs && bun run build:release
```

이 명령은 다음을 수행한다:
- 모든 플랫폼 네이티브 바이너리 빌드 (`build:node:all`)
- WASM 파일 리네임 (`postbuild:node:all`)
- npm 디렉토리 생성 (`prepare:artifacts`)
- 빌드 아티팩트를 npm 디렉토리로 복사 (`artifacts`)
- prepublish dry-run (`prepublishOnly`)

## 3. 빌드 검증

빌드 완료 후 아래 아티팩트가 존재하는지 확인한다:

- `packages/hwpjs/dist/hwpjs.*.node` (6개 플랫폼)
- `packages/hwpjs/dist/hwpjs.wasm32-wasi.wasm`
- `packages/hwpjs/dist/index.js`
- `packages/hwpjs/npm/*/hwpjs.*.node` (6개)
- `packages/hwpjs/npm/wasm32-wasi/hwpjs.wasm32-wasi.wasm`
- `packages/hwpjs/dist/react-native/` (index.cjs, index.mjs)

## 4. 커밋 및 PR

1. main 브랜치에서 `chore/bump-version-{suffix}` 브랜치 생성 (예: `chore/bump-version-rc10`)
2. 변경된 모든 파일을 커밋: `chore: bump version to $ARGUMENTS`
3. 리모트에 push 후 PR 생성
4. PR 본문 형식:

```markdown
## Summary
- 모든 npm 패키지 버전을 `{이전버전}` → `$ARGUMENTS`로 업데이트
- 로컬 빌드(`build:release`) 실행하여 빌드 아티팩트 포함

## 변경 파일
- `packages/hwpjs/package.json` (version + optionalDependencies)
- `packages/hwpjs/npm/*/package.json` (각 플랫폼 패키지 버전)
- `packages/hwpjs/dist/` (빌드 바이너리)
- `packages/hwpjs/npm/*/hwpjs.*.node` (플랫폼별 네이티브 바이너리)
```

## 5. 머지 후 릴리즈

PR이 머지된 후 진행한다:
1. main 브랜치 최신화: `git checkout main && git pull origin main --rebase`
2. 이전 버전과 비교하여 커밋 목록 확인: `git log --oneline {이전태그}..HEAD`
3. GitHub 릴리즈 생성 (`gh release create`)
   - 태그: `@ohah/hwpjs@$ARGUMENTS`
   - 릴리즈 노트에 Features / Bug Fixes / Chores 카테고리로 분류

## 6. npm 배포

```bash
cd packages/hwpjs && bash scripts/publish.sh --tag latest
```

배포 후 확인:
```bash
npm view @ohah/hwpjs dist-tags
npx @ohah/hwpjs@latest --version
```

## 사용자 확인 포인트

각 단계 사이에 반드시 사용자에게 확인을 받고 다음 단계로 넘어간다:

1. **버전 업데이트 후** → 변경된 파일 목록을 보여주고 빌드 진행 여부 확인
2. **빌드 완료 후** → 아티팩트 검증 결과를 보여주고 커밋/PR 진행 여부 확인
3. **PR 생성 후** → PR 링크를 공유하고 멈춤. 머지는 사용자가 직접 수행
4. **머지 확인 후** → 사용자가 머지했다고 알려주면 릴리즈 노트 초안을 보여주고 확인
5. **릴리즈 생성 후** → npm 배포 진행 여부와 태그(latest/next) 확인
6. **배포 완료 후** → `npm view` 및 `npx --version` 결과를 보여주고 최종 확인

절대 사용자 확인 없이 다음 단계로 자동 진행하지 않는다.

## 주의사항

- 배포(`publish`)는 사용자가 명시적으로 요청한 경우에만 수행한다
- PR 머지는 리베이스 머지를 사용한다
- pre-release 버전(rc, beta, alpha)도 사용자가 `--tag latest`를 요청하면 latest로 배포한다
