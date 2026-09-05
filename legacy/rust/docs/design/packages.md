# 패키지별 상세

## `crates/hwp-core`

- **역할**: HWP 파일 파싱 핵심 로직 및 문서 변환/뷰어 기능
- **의존성**: 없음 (순수 Rust 라이브러리)
- **인터페이스**: 파일 읽기를 위한 트레이트 정의
- **자료형 정의**: `src/types.rs`에 HWP 5.0 스펙 문서의 모든 자료형을 명시적으로 정의 (스펙 "표 1: 자료형"과 1:1 매핑)
- **모듈 구조**:
  - **파싱 모듈** (`document/`): FileHeader, DocInfo, BodyText, BinData 등 — 스펙 문서 표 2에 맞춰 구성
  - **뷰어 모듈** (`viewer/`): 공통 로직 `viewer/core/`, Markdown/HTML 완료, Canvas/PDF 예정
- **설계 원칙**: 파싱과 변환 관심사 분리, CFB 경로 처리 모듈화, BodyText 파싱 통합
- **테스트**: 단위 테스트·스냅샷 테스트 필수. fixtures: `tests/fixtures/`, snapshots: `tests/snapshots/`, `common::find_fixture_file()` 사용

## `packages/hwpjs`

- **역할**: 멀티 플랫폼 패키지 (Node.js, Web, React Native)
- **도구**: NAPI-RS (Node/Web), Craby (React Native)
- **코드 위치**:
  - NAPI-RS: `src/lib.rs`, `build.rs`, `npm/`
  - CLI: `src-cli/`, `bin/hwpjs.js`, `dist/cli/`
  - Craby: `src-reactnative/`, `crates/lib/`, `cpp/`, `android/`, `ios/`
- **CLI 명령어**: to-json, to-markdown, info, extract-images, batch
- **테스트**: Node.js(Bun), React Native(Maestro). **배포**: tsdown

상세 빌드·exports·패키징: [packages-hwpjs.md](packages-hwpjs.md)

## `examples/`

- **역할**: 각 환경별 사용 예제
- **내용**: node/, web/, react-native/, cli/ — 기본 사용법 예제 코드

## `documents/`

- **역할**: 프로젝트 문서 사이트 (Rspress)
- **위치**: 루트 레벨
- **메뉴**: 가이드, API, 명세서(HWP 3.0/5.0, 배포용, 수식, 차트)
