# Commit changes following project rules

When creating or suggesting git commits, follow these rules. Full details in `AGENTS.md` and [커밋 규칙](commit-rules.md).

## Message format

```
<type>(<scope>): <subject>

<body>

<footer>
```

- **Type** (required): `feat` | `fix` | `refactor` | `test` | `docs` | `chore` | `style`
- **Scope** (optional): `core` | `node` | `react-native` | `docs` | `scripts` | `config`
- **Subject** (required): imperative, lowercase start, ≤50 chars, no trailing period
- **Body** (optional): wrap at 72 chars; explain what and why
- **Footer** (optional): breaking changes, issue refs

## Principles

1. Single purpose per commit
2. Split unrelated changes into separate commits
3. Each commit should be independently meaningful
4. Prefer small, logical units

## Pre-commit (required)

Run format and lint so the project’s tooling is satisfied before committing.

**TypeScript/JavaScript**: Run `bun run format`; run `bun run lint`; stage any changed files; then commit.

**Rust**: Run `bun run format:rust:check` (fix with `bun run format:rust` if needed); run `cargo clippy --all-targets --all-features -- -D warnings` and fix all warnings. If `crates/hwp-core` or Rust tests were touched, run `bun run test:rust` or `bun run test:rust:snapshot` and ensure they pass; then commit.

## Post-commit (required)

After committing: write a summary to an MD file (e.g. `branch-summary.md`). The file must include:

1. **Title** (e.g. branch name or commit subject)
2. **Work content**: what was done — goals, changes, and outcomes in prose (PR-style). If tests were added or updated, mention that (e.g. "Tests were added for …" or "Test coverage includes …").

**Do not commit this MD file** (add to `.gitignore` or leave unstaged).

## Examples

```
feat(core): add insta for snapshot testing

- Add insta 1.43.2 as dev-dependency
- Enable snapshot testing for JSON output validation
```

```
refactor(core): reorganize modules to match HWP file structure

- Move FileHeader, DocInfo, BodyText, BinData under document/ module
- Organize modules to match HWP spec Table 2 structure
```
