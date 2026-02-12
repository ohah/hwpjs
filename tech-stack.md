# 기술 스택

## 런타임/빌드

- **Bun**: 워크스페이스 관리 및 패키지 매니저
- **Rust**: 핵심 로직 구현 언어

## Rust 관련

- **공유 라이브러리**: `crates/hwp-core` - 환경 독립적인 HWP 파싱 로직
- **React Native**: Craby - TypeScript에서 Rust로의 바인딩
- **Node.js**: NAPI-RS - Node.js 네이티브 모듈 생성
- **린트/포맷**:
  - `rustfmt`: 코드 포맷팅
  - `clippy`: 린팅

## JavaScript/TypeScript 관련

- **린트**: oxlint - 빠른 JavaScript/TypeScript 린터
- **포맷터**: oxfmt - Prettier 호환 포맷터
- **테스트 (Node)**: Bun
- **배포 (Node)**: tsdown

## 문서

- **Rspress**: 문서 사이트 생성

## 테스트

- **React Native**: Maestro (E2E 테스트)
- **Node.js**: Bun (유닛 테스트)
- **Rust**: cargo test

## 환경 관리

- **mise**: 버전 관리 도구
  - Rust: stable (LTS)
  - Bun: latest (LTS)
  - Node.js: 24.11.1 (LTS)
