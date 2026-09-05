# 아키텍처 설계

## 공유 라이브러리 (`crates/hwp-core`)

- HWP 파일 파싱의 핵심 로직을 담당
- 파일 읽기를 트레이트로 추상화하여 환경별 구현 가능
- 환경 독립적인 비즈니스 로직만 포함
- 파싱된 문서 구조체(`HwpDocument`) 제공
- 문서 변환/뷰어 기능 포함 (`viewer/` 모듈)
  - 현재 지원 형식: 마크다운 (Markdown), HTML
  - 향후 지원 예정: Canvas, PDF 등
  - 파싱(`document/`)과 변환(`viewer/`)의 관심사 분리

모듈 구조 상세: [folder-structure.md](folder-structure.md)

패키지 상세: [packages-hwpjs.md](packages-hwpjs.md)

## 워크스페이스 설정

- **Bun 워크스페이스**: `packages/*` 디렉토리를 워크스페이스로 관리. 각 패키지는 독립적으로 빌드 및 배포 가능.
- **Cargo 워크스페이스**: `crates/*` 및 `packages/*/Cargo.toml`을 워크스페이스 멤버로 포함. NAPI-RS는 Cargo 워크스페이스에서 정상 작동.
