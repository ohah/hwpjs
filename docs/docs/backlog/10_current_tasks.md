# 현재 작업

현재 진행 중이거나 곧 시작할 작업 항목들입니다.

## React Native Android 환경 셋팅 및 테스트

### 목표
React Native 환경에서 Android 플랫폼에서 HWP 파일을 읽고 파싱할 수 있도록 환경을 구축하고 테스트합니다.

### 작업 항목

- [ ] Android 빌드 환경 확인
  - Android Studio 설치 및 설정
  - Android SDK 및 NDK 설정 확인
  - Gradle 빌드 설정 검증

- [ ] Android 에뮬레이터/디바이스 연결 테스트
  - Android 에뮬레이터 실행 및 연결 확인
  - 실제 디바이스 연결 테스트
  - ADB 연결 상태 확인

- [ ] Android에서 HWP 파일 읽기 테스트
  - `react-native-fs`를 사용한 파일 읽기
  - 번들에 포함된 HWP 파일 접근 테스트
  - 파일 경로 및 권한 확인

- [ ] Android 네이티브 모듈 빌드 및 테스트
  - Craby 빌드가 Android에서 정상 작동하는지 확인
  - 네이티브 바인딩 로드 테스트
  - HWP 파서 함수 호출 테스트

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
