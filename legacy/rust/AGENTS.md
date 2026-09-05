# HWPJS 프로젝트 - AI 에이전트 가이드

## OpenClaw 에이전트 (이 워크스페이스)

이 워크스페이스는 OpenClaw **hwpjs** 에이전트가 사용한다.

- **세션 시작 시**: `SOUL.md`, `USER.md` 읽기. 필요 시 `memory/YYYY-MM-DD.md`, `MEMORY.md` 참고.
- **하트비트 시**: `HEARTBEAT.md` 읽고, 적힌 순서대로만 실행 (리팩터 → 빌드 → 테스트/스냅샷 → 조건 충족 시 커밋/푸시).
- **언어**: 한국어. 담백·결과 위주.
- **도구**: 파일 읽기·수정, 명령 실행 적극 사용. 파괴적 명령은 사용자 확인 후.

---

## 프로젝트 요약

HWP(.hwp) 파일을 읽고 파싱하는 라이브러리. Rust 핵심 로직(`crates/hwp-core`) + Node.js/React Native 래퍼(`packages/hwpjs`).

**HWP 파싱 시 필수 참조**: `documents/docs/spec/hwp-5.0.md`, `.claude/skills/hwp-spec/` (구현·검증 시 해당 파트 번호의 .md 참조).

---

## 다음에 볼 문서 (Where to look next)

진입용 목차만 여기 두고, 상세는 아래 경로에서 필요할 때 참조한다.

| 목적 | 경로 |
|------|------|
| **스펙/레퍼런스** | `documents/docs/spec/` (특히 `hwp-5.0.md`), `.claude/skills/hwp-spec/` |
| **설계/아키텍처** | `docs/design/` — [architecture.md](docs/design/architecture.md), [folder-structure.md](docs/design/folder-structure.md), [viewer-architecture.md](docs/design/viewer-architecture.md), [packages.md](docs/design/packages.md), [packages-hwpjs.md](docs/design/packages-hwpjs.md) |
| **프로세스(커밋/린트/테스트)** | [commit-rules.md](commit-rules.md), [lint-rules.md](lint-rules.md), [docs/process/development-guidelines.md](docs/process/development-guidelines.md) |
| **기술 스택 요약** | 루트 `tech-stack.md` (있으면 참고). 상세는 `docs/design/` 및 documents 가이드. |

---

## 주의사항 (한 줄 요약)

- **hwp-core**: HWP 5.0 파싱·뷰어(Markdown/HTML). 스펙·테스트 규칙은 `docs/process/development-guidelines.md` 및 `documents/docs/spec/` 참조.
- **packages/hwpjs**: Node/Web/RN 멀티 플랫폼. NAPI-RS·Craby. 상세는 `docs/design/packages-hwpjs.md`.
