# 커밋 규칙

- `<type>(<scope>): <subject>` 형식을 사용합니다.
- 한 커밋에는 한 목적만 담고, 사용자 변경을 임의로 포함하지 않습니다.
- scope 예: `cfb`, `hwp5`, `hwpx`, `wasm`, `docs`, `legacy`.
- Zig 변경은 포맷 검사, `zig build test`, `zig build -Doptimize=ReleaseSafe`를 확인합니다.
- 레거시 코드를 수정하는 경우 `legacy/rust/commit-rules.md`의 해당 언어 검증도 적용합니다.
- 커밋·푸시와 배포 승인 절차는 [필수 프로젝트 규칙](docs/project-rules.md)을 따릅니다.
