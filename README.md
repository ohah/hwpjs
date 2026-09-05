# hwpjs

HWP/HWPX 읽기·편집·저장을 목표로 하는 Zig/WASM 프로젝트입니다.
현재 CFB v3/v4 읽기·명세 검증·스트림 편집 후 새 컨테이너 저장을 지원합니다. **HWP/HWPX 본문 의미 해석·본문 편집·저장은 아직 구현되지 않았습니다.**

HWP5 FileHeader·압축 스트림·레코드 경계 읽기와 DocInfo 문서 속성·ID 매핑·BinData·글꼴·탭 정의·문단 번호·글머리표·스타일 해석, BinData/글꼴 개수 검증은 Zig 코어에 구현했습니다.
지원 범위와 적대적 검증 5회 기록은 [HWP5 기반 구현](docs/hwp5-foundation.md)을 참고하세요.
아직 제품 JS/WASM 공개 API에 HWP 문서 파싱 기능을 추가한 단계는 아닙니다.

본 제품은 한글과컴퓨터의 글 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다.

## 시작하기

Zig 0.16.0을 사용합니다 (`mise install` 또는 별도 설치).

```sh
zig build test
zig build -Doptimize=ReleaseSafe
zig build compare -Doptimize=ReleaseSafe
zig fmt --check build.zig src
```

`zig-out/bin/hwpjs.wasm`은 외부 import 없이 CFB 읽기·쓰기를 제공합니다. JS 비교 검증에는 Node 24를 사용합니다.
Zig/JS API와 자원 제한·검증 범위는 [CFB 읽기·쓰기](docs/cfb-reader.md)를 참고하세요.

## 디렉터리

| 경로 | 역할 |
|---|---|
| `src/` | 신규 Zig 구현과 WASM 진입점 |
| `js/` | 브라우저/Node 읽기·쓰기 API, 메모리·엔트리·편집 모델 변환 어댑터 |
| `tests/cfb/` | 레거시 JS 비교와 브라우저 검증 |
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

라이선스: [MIT](LICENSE). 검색 호환 코드와 레거시 참고 구현의 [제3자 고지](THIRD_PARTY_NOTICES.md)도 확인하세요.
