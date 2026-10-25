# React Native — experimental

`@ohah/hwpjs/react-native`의 TypeScript provider/transport 기반과 실제 iOS/Android 에디터의 완성은 다릅니다. Native 코드·플랫폼별 아티팩트·실기기 E2E가 완료되지 않은 상태에서는 experimental로 취급합니다. 웹 Canvas 어댑터를 React Native View로 바로 렌더링할 수 있다고 안내하지 않습니다.

이 사이트는 RN 패키지 설치만으로 네이티브 편집기가 실행된다는 예제를 제공하지 않습니다. Native 호스트와 runtime, 입력·IME, 저장·파일 접근, 수명과 실패 처리를 플랫폼별로 연결하고 검증해야 합니다. 브라우저 Worker/WASM 예제를 기기 동작 증거로 재사용하지 마세요.

현재 바로 연결할 수 있는 브라우저 예제는 [Vanilla](./vanilla.md), [React](./react.md), [Svelte](./svelte.md)를 참고하세요.
