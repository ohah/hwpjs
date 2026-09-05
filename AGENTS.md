# hwpjs 에이전트 가이드

- 한국어로 결과와 검증 범위를 명확히 설명합니다.
- 세션 시작 시 `SOUL.md`, `USER.md`를 읽습니다.
- 현재 구현은 루트 `src/`의 Zig 0.16.0 코드입니다. `legacy/rust/`는 이전 구현이며 기본 수정 대상이 아닙니다.
- 구조·미구현 범위는 `docs/architecture.md`, 이동 기록은 `docs/migration.md`를 참고합니다.
- HWP 구현·검증 전 `legacy/rust/documents/docs/spec/hwp-5.0.md`와 `legacy/rust/.claude/skills/hwp-spec/`의 해당 파트를 읽습니다. 레거시 설계 문서는 현행 Zig 구현 설명이 아닙니다.
- 검증: `zig fmt --check build.zig src`, `zig build test`, `zig build -Doptimize=ReleaseSafe`.
- CFB 읽기·쓰기, HWP5, HWPX, 문서 모델, WASM ABI를 책임별로 분리합니다. 미지원 필드를 지원한다고 표시하지 않습니다.
- GPL/LGPL 의존성은 제외합니다. `reference/`의 존재는 제품 채택을 뜻하지 않습니다.
- 기존 사용자 변경을 보존합니다. 레거시 이동은 내용 수정·삭제 권한을 뜻하지 않습니다.
- 사용자 지시에 따라 작업 검증 후 `main`에 직접 커밋·푸시합니다. 별도 브랜치·PR은 만들지 않습니다. 스냅샷 자동 승인은 하지 않으며 현재 하트비트는 중지 상태입니다.
