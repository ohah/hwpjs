# Rust → legacy/rust 이동 (2026-09-05)

## 보존 범위

Rust `crates/`, Node/RN `packages/`, `examples/`, Cargo/Bun manifest·lockfile, `documents/`, `docs/`, `scripts/`, `docker/`, `e2e/`, `benchmarks/`, 언어별 설정과 이전 안내 문서를 함께 이동했습니다. 설치된 node_modules와 로컬 Android 빌드 디렉터리도 옮겼습니다.

기존 JS `legacy/` 파일과 루트 `reference/`, 개인 에이전트 설정은 유지합니다. 이동 직후 추적 파일 및 비무시 신규 파일 1,652개의 경로 정규화 내용 해시가 이동 전과 같음을 확인했습니다. 이후 레거시에서 수행한 보완은 다음과 같습니다.

- `legacy/rust/benchmarks/cfb-c-spike/build.sh`: 루트 reference 경로 보정. LGPL 실험은 채택 대상이 아닙니다.
- 해당 실험 README의 실행 위치·reference 경로 보정 및 제외 정책 표시.
- `ARCHIVE.md` 보관 안내 추가, 원본 MIT `LICENSE` 사본 추가.

## 이전 구현 실행

```sh
cd legacy/rust
cargo metadata --no-deps --format-version 1
cargo test -p hwp-core
bun run dev:web
```

이전 내부 상대 경로는 함께 이동해서 유지됩니다. 레거시 README·설계 문서는 Rust 디렉터리를 프로젝트 루트로 해석해야 합니다. 오래된 절대 경로·외부 도구 설정은 별도 조정이 필요할 수 있습니다. 삭제돼 있던 lint 설정 등 기존 미완료 변경은 복원하지 않았습니다.

## CI

- 기존 `.github/workflows/ci.yml`의 JS/Rust 검사·테스트는 `legacy/rust/.github/workflows/ci.yml`로 이동했습니다.
- 기존 `docs.yml`의 Rspress GitHub Pages 배포도 같은 위치로 이동했습니다.
- GitHub Actions는 루트 `.github/workflows/`를 사용하므로 위 워크플로는 새 커밋 반영 후 자동 실행되지 않습니다. 파일은 삭제하지 않았습니다.
- 현재 루트에는 활성 CI를 두지 않았습니다. Zig 검증 명령은 README에 명시했습니다.
- 원격 브랜치 보호의 필수 검사, 이미 실행 중인 작업, 이미 배포된 Pages 설정은 변경하지 않았습니다. 이전 검사명이 필수라면 저장소 설정에서 후속 조정해야 합니다.

## 현재 제공 범위

Zig 0.16 빌드, 경계 검사 바이트 리더, WASM ABI 버전 함수만 제공합니다. HWP/HWPX 파싱·편집·저장은 미구현입니다. 기존 Rust 기능을 신규 Zig 기능으로 표시하지 않습니다.
