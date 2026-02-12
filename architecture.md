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

모듈 구조 상세: [폴더 구조](folder-structure.md)

## 환경별 래퍼

### `packages/hwpjs`

- 멀티 플랫폼 패키지 (Node.js, Web, React Native 모두 지원)
- **Node.js/Web**: NAPI-RS를 사용하여 네이티브 모듈 생성
  - `hwp-core`를 의존성으로 사용
  - Node.js 환경의 파일 읽기 구현
  - Bun을 사용한 유닛 테스트
  - tsdown을 사용한 배포
- **React Native**: Craby를 사용하여 React Native 바인딩
  - `hwp-core`를 의존성으로 사용
  - React Native 환경의 파일 읽기 구현
  - Maestro를 사용한 E2E 테스트
