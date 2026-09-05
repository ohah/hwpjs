# packages/hwpjs 구조와 원리

`packages/hwpjs`는 Node.js, Web, React Native 환경을 모두 지원하는 멀티 플랫폼 패키지입니다.

## 이중 빌드 시스템

1. **NAPI-RS**: Node.js/Web용 — `bun run build:node`, 플랫폼별 `.node` 바이너리, Node N-API 바인딩
2. **Craby**: React Native용 — `craby build`, iOS/Android 네이티브 모듈, Rust → C++ 바인딩
3. **tsdown**: TypeScript 번들링 — ESM/CJS, React Native용 `dist/react-native/`

## 환경별 exports 분기

`package.json`의 `exports` 필드로 진입점 분기:

- **react-native**: `dist/react-native/`
- **browser**: `dist/browser.js` (WASM 빌드)
- **node**: `dist/index.js` (네이티브 모듈)
- **default**: `dist/browser.js`

## 플랫폼별 바이너리 패키징

- `napi prepublish`로 `@ohah/hwpjs-{platform}-{arch}` 패키지 생성
- 메인 패키지 `optionalDependencies`에 포함
- 지원: Windows(x64, ia32, arm64), macOS(x64, arm64, universal), Linux(다양), Android(arm64, arm-eabi)

## 빌드 프로세스

1. **NAPI 빌드**: `napi build --platform --release --package hwpjs` → `.node` 생성
2. **Craby 빌드**: `craby build` → iOS/Android 라이브러리
3. **TypeScript 번들링**: `tsdown` → ESM/CJS, React Native 번들
