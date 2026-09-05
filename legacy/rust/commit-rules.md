# 커밋 규칙

**중요**: 모든 커밋은 단일 목적에 집중하고, 논리적으로 분리되어야 합니다.

## 커밋 메시지 형식

```
<type>(<scope>): <subject>

<body>

<footer>
```

## Type (필수)

- `feat`: 새로운 기능 추가
- `fix`: 버그 수정
- `refactor`: 코드 리팩토링 (기능 변경 없음)
- `test`: 테스트 추가/수정
- `docs`: 문서 업데이트
- `chore`: 빌드 설정, 의존성 업데이트 등
- `style`: 코드 포맷팅, 세미콜론 누락 등 (기능 변경 없음)

## Scope (선택)

- `core`: hwp-core 관련
- `node`: Node.js 바인딩 관련
- `react-native`: React Native 바인딩 관련
- `docs`: 문서 관련
- `documents`: 문서 사이트(Rspress, `documents/`) 관련

## Subject (필수)

- 50자 이내로 간결하게 작성
- 명령형으로 작성 (과거형 X)
- 첫 글자는 대문자로 시작하지 않음
- 마지막에 마침표(.) 사용하지 않음

## Body (선택)

- 72자마다 줄바꿈
- 무엇을, 왜 변경했는지 설명
- 어떻게 변경했는지는 코드로 보이므로 생략 가능

## Footer (선택)

- Breaking changes, Issue 번호 등

## 커밋 예시

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

## Pre-commit (필수)

커밋 전에 포맷·린트를 통과시키고, Rust(hwp-core) 변경 시 테스트·스냅샷이 통과해야 한다.

- **Rust**: `bun run format:rust:check` (실패 시 `bun run format:rust`), `cargo clippy --all-targets --all-features -- -D warnings` 실행. `crates/hwp-core` 또는 Rust 테스트를 건드렸다면 `bun run test:rust` 또는 `bun run test:rust:snapshot` 실행 후 통과 확인 후 커밋.
- **TypeScript/JavaScript**: `bun run format`, `bun run lint` 실행 후 커밋.

## 커밋 원칙

1. **단일 목적**: 하나의 커밋은 하나의 목적만 가져야 함
2. **논리적 분리**: 관련 없는 변경사항은 별도 커밋으로 분리
3. **독립적 의미**: 각 커밋은 독립적으로 의미가 있어야 함
4. **되돌리기 용이**: 특정 기능만 되돌릴 수 있도록 구성
5. **작은 단위**: 가능한 작은 단위로 커밋 (하지만 너무 작지 않게)

## 커밋 순서 예시

1. 의존성 추가
2. 타입 정의
3. 기능 구현
4. 리팩토링
5. 테스트 추가
6. 문서 업데이트

이 순서로 커밋하면 히스토리가 명확하고 이해하기 쉬워집니다.
