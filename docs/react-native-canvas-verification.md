# React Native Canvas 검증 범위

이 문서는 React Native Canvas 소스의 검증 범위를 설명합니다. npm 발행이나 Android 지원이 완료됐다는 뜻은 아닙니다.

## iOS 연결

공개 진입점은 `@ohah/hwpjs/react-native/canvas`입니다. 내부 RN workspace는 private입니다. UIKit/CoreGraphics와 JSI를 사용하며 WebView로 대체하지 않습니다. Native archive는 자동 생성되거나 npm 패키지에 포함되지 않습니다. 소비자는 같은 소스·헤더·target·flag의 실제 archive와 receipt를 준비해야 합니다.

기존 C ABI 19개 선언을 유지하고 NativeContext V2 이력 설정·통계 함수 2개를 추가합니다. C ABI 버전은 1이고 descriptor의 `hwpjs.native-history/2`로 이력 기능을 협상합니다. 구 엔진에는 기본 경로를 유지하되 명시한 V2 옵션은 지원하지 않는 것으로 거부합니다. snapshot/render/history flag는 서로 구분합니다.

동결된 별도 archive와 실제 packed consumer로 iOS Simulator 한 기기에서 HWP5/HWPX 각각 Native 명령 100회, undo 100회, redo 100회, 저장·재열기를 확인했습니다. 100회의 OS 키보드 입력을 검증한 것은 아닙니다. HWP5 기본 저장은 `LayoutReflowRequired`로 거부하고 명시 `allowStaleLayout`으로 미갱신 조판 저장을 선택했습니다. 독립 CFB 전체 section 레코드 및 HWPX 전체 section XML·ZIP 메타데이터 대조를 수행했습니다.

이미지 자원 관리는 문서 identity와 편집 revision을 분리합니다. 채택한 frame이 이미지를 강하게 소유하고, 같은 key 교체의 늦은 decode와 release는 ticket으로 구분합니다. 실제 Simulator의 정상 missing 오류 0회와 고의 missing packet 1회 거부를 분리했습니다. 이전 pending placeholder 캡처는 실제 그림 출력 근거에서 제외하고 후속 로고 캡처를 별도로 검사했습니다.

## 남은 범위

소스 검증은 같은 입력에서 실행한 결과에만 적용합니다. 포맷·주석의 토큰 비교, 전체 Native 검사와 ReleaseSafe 빌드, archive·CPP·Simulator 실행은 서로 다른 검증입니다. 기존 실기 receipt를 다른 소스 세대에 재발급하지 않으며, 이력 공통 최적화의 후속 성공도 상속하지 않습니다.

Android JNI·Native Canvas·JSI 연결, iOS 실기기·IME·전체 Unicode 및 전체 조판 동치는 완료되지 않았습니다. Android 진입은 현재 명시적으로 거부합니다. Native archive 생산 도구가 있다고 Android archive가 제공되는 것은 아닙니다.
