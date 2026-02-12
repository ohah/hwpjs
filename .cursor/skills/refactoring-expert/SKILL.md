---
name: refactoring-expert
description: Applies safe, incremental refactoring with tests and project conventions. Use when refactoring code, improving structure, reducing duplication, or when the user asks for refactoring, cleanup, or code quality improvements.
---

# 리팩토링 전문가

기능 변경 없이 구조·가독성·유지보수성을 개선하는 리팩토링을 수행한다. 프로젝트 규칙은 루트의 `AGENTS.md`를 따른다.

## 원칙

1. **동작은 유지**: 리팩토링 후 동작이 바뀌지 않도록 한다. 테스트·스냅샷으로 검증한다.
2. **작은 단위**: 한 번에 한 종류의 변경(함수 추출, 모듈 분리, 이름 변경 등)을 적용하고, 필요하면 커밋 후 다음 단계로 진행한다.
3. **테스트 선행**: 가능하면 먼저 해당 영역 테스트가 있음을 확인하거나, 리팩토링 범위에 맞는 테스트를 추가한 뒤 진행한다.
4. **프로젝트 규칙 준수**: Rust는 `rustfmt`/`clippy`, JS/TS는 `oxlint`/`oxfmt`. 커밋 규칙·모듈 구조·함수 파라미터 설계 가이드라인(AGENTS.md)을 따른다.

## 워크플로우

1. **범위 파악**: 변경할 파일·모듈·함수와 의존 관계를 확인한다.
2. **테스트 확인**: `bun run test:rust` / `bun run test:node` 등으로 기존 테스트가 통과하는지 확인한다. 스냅샷이 있으면 `bun run test:rust:snapshot` 등으로 검증한다.
3. **리팩토링 적용**: 한 단계씩 적용하고, 각 단계 후 빌드·테스트·린트를 실행한다.
4. **검증**: 전체 테스트·스냅샷 검토(`bun run test:rust:snapshot:review` 등)로 회귀가 없는지 확인한다.
5. **정리**: 포맷·린트 적용(`bun run format`, `bun run lint`) 후 커밋 시 AGENTS.md의 커밋 규칙을 따른다.

## HWPJS 프로젝트 특이사항

- **hwp-core**: 모듈 구조는 HWP 스펙(표 2) 및 `document/` vs `viewer/` 관심사 분리와 맞춘다. 파라미터는 AGENTS.md의 "함수 파라미터 설계 가이드라인"(전체 구조체 전달 vs 구조체로 묶기)을 참고한다.
- **Rust**: `types.rs`의 HWP 자료형·도메인 타입을 유지한다. 리팩토링 시에도 스펙 문서와 1:1 매핑을 해치지 않는다.
- **테스트**: Rust는 스냅샷 테스트 필수. 변경 후 `cargo insta review`로 스냅샷 변경을 검토·승인한다.
- **뷰어**: `viewer/core/` 공통 로직과 `Renderer` 트레이트를 해치지 않도록 리팩토링한다.

## 금지 사항

- 동작 변경을 동반하는 “리팩토링” 금지. 동작 변경이 필요하면 별도 작업으로 분리한다.
- 테스트 없이 대량 일괄 변경 금지. 작은 단위로 나누고 매 단계 검증한다.
- AGENTS.md에 정의된 모듈 구조·스펙 매핑·커밋 규칙을 무시한 변경 금지.

## 출력 형식

리팩토링 제안·수행 시 다음을 명시한다:

- **목표**: 무엇을 개선하는지(중복 제거, 이름 명확화, 모듈 분리 등).
- **변경 요약**: 파일/함수 단위로 무엇을 어떻게 바꿀지.
- **검증 방법**: 어떤 테스트·명령으로 확인할지.
- (선택) **추가 제안**: 같은 영역에서 이어서 할 만한 리팩토링이 있으면 간단히 나열.
