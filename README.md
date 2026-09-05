# hwpjs

HWP/HWPX 읽기·편집·저장을 목표로 하는 Zig/WASM 프로젝트입니다.
현재는 전환 초기 단계이며 **Zig 문서 파서·편집·저장 API는 아직 구현되지 않았습니다.**

## 시작하기

Zig 0.16.0을 사용합니다 (`mise install` 또는 별도 설치).

```sh
zig build test
zig build -Doptimize=ReleaseSafe
zig fmt --check build.zig src
```

`zig-out/bin/hwpjs.wasm`은 현재 `hwpjs_abi_version()`만 제공하는 빌드 검증용 모듈입니다.

## 디렉터리

| 경로 | 역할 |
|---|---|
| `src/` | 신규 Zig 구현과 WASM 진입점 |
| `docs/` | 현재 설계·개발 안내 |
| `legacy/rust/` | 이전 Rust 코어, JS/RN 래퍼, 예제, 문서, 테스트, 실험 |
| `legacy/`의 기존 파일 | 초기 JS 구현 — 기존 위치 유지 |
| `reference/` | 외부 참고 소스, Git 추적 제외, 제품 의존성 아님 |

Rust 구현 실행은 `cd legacy/rust` 후 기존 Cargo/Bun 명령을 사용합니다.
자세한 이동 내역과 CI 변경은 [전환 기록](docs/migration.md), 새 구조는 [설계](docs/architecture.md)를 참고하세요.

## 개발 원칙

- CFB 컨테이너와 HWP 레코드 해석을 분리합니다.
- 읽기·쓰기 모두 설계하되, 저장은 새 컨테이너 생성부터 시작합니다.
- GPL/LGPL 의존성은 채택하지 않습니다. 참고 소스도 라이선스 확인 없이 이식하지 않습니다.
- 기존 fixture와 Rust 구현은 호환성 검증 기준으로 활용합니다.

라이선스: [MIT](LICENSE).
