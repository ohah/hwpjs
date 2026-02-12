# 린트 규칙

## 코드 스타일

- **Rust**: `rustfmt`(포맷팅), `clippy`(린팅)
- **JavaScript/TypeScript**: `oxlint`(린트), `oxfmt`(Prettier 호환 포맷터)
- 모든 코드는 저장 시 자동 포맷팅 적용

## 명령어

- **린트 검사**: `bun run lint`
- **포맷 적용**: `bun run format`

## 기술 스택 참고

- Rust: `crates/hwp-core` — rustfmt, clippy
- JS/TS: `packages/hwpjs` 등 — oxlint, oxfmt
