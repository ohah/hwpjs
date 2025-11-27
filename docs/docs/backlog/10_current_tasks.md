# 현재 작업

현재 진행 중이거나 곧 시작할 작업 항목들입니다.


## Maestro E2E 테스트 셋팅

### 목표
Maestro를 사용하여 React Native 앱의 E2E 테스트를 설정하고 실행합니다.

### 작업 항목

- [ ] Maestro 설치 및 설정
  - Maestro CLI 설치
  - Maestro 설정 파일 생성
  - 테스트 디렉토리 구조 생성

- [ ] E2E 테스트 시나리오 작성
  - 앱 실행 시나리오
  - HWP 파일 로드 시나리오
  - 파싱 결과 확인 시나리오
  - 에러 처리 시나리오

- [ ] Android 타겟으로 E2E 테스트 실행
  - Android 에뮬레이터에서 테스트 실행
  - 테스트 결과 확인 및 디버깅
  - CI/CD 파이프라인에 통합

## 참고사항

- Maestro 설정은 프로젝트 루트의 `.maestro/` 디렉토리에 배치되어 있습니다.
- `package.json`의 `test:mobile:e2e` 스크립트는 루트의 `.maestro` 디렉토리를 참조합니다.
- 실제 React Native 예제는 `examples/react-native/`에 위치합니다.
