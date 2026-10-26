# Native Canvas 진입점

공개 패키지 진입점은 `@ohah/hwpjs/react-native/canvas`입니다. 내부 `@hwpjs/react-native`는 private workspace이며 대응 진입점은 `/canvas`입니다. 기존 Context root API를 유지합니다. 새 Canvas pod는 별도 HwpCanvasContext 모듈만 등록하며 legacy Context 앱 모듈의 설치를 대신하지 않습니다. UIKit/CoreGraphics와 JSI를 사용하며 WebView로 대체하지 않습니다. 웹 데모 행렬에서 RN을 제외하는 것과 Native Canvas 지원 방향은 별개입니다.

`getNativeCanvasBinding()`은 iOS의 `HwpCanvasContext` 모듈과 설치된 JSI binding을 요구합니다. 그 binding을 `createNativeCanvasProvider(binding)`에 전달합니다. `NativeCanvasView`의 `onHost`에서 `installNativeTextPlatform(host)`와 `createNativeCanvasSurface(host)`를 호출하고 같은 provider의 editor에 `attachCanvas`합니다. 호출자는 session을 보관하고 화면 해제 때 `dispose()` 완료를 기다립니다. 두 번째 문서 모델이나 Native 문서를 만들지 않습니다.

Android binding 요청과 컴포넌트 사용은 `HwpJSCanvasIOSOnly`로 거부합니다. snapshot/2가 없으면 `NativeSnapshotUnavailable`, render-sources/3가 없으면 `NativeRenderSourcesUnavailable`입니다. ABI/projection도 검사하고 불일치한 port를 해제합니다. descriptor나 flag 이름만으로 실제 Native 실행을 증명하지 않습니다.

## 빌드 범위

기존 JS public producer는 JS 산출물만으로 Native 완료를 주장하지 않습니다. `--js-only`는 그 범위를 명시하고, `--verify-native-artifact`는 준비된 실제 artifact 파일 지문을 추가 검사합니다. 두 옵션은 함께 사용할 수 없습니다. 이 검사는 시뮬레이터·기기 실행을 대신하지 않습니다. 내부 RN의 일반 빌드는 `native-artifacts.json`이 필요하며 명시 `--js-only`만 JS 검증 경로를 허용합니다.

타입에는 실제 RN 의존성이 필요합니다. Native 선언은 ES2023/noDOM/strict/skipLibCheck:false로 별도 검사하고 웹과 공유한 선언 지문이 다르면 거부합니다. umbrella의 autolink 소스는 `dist/native/react-native`에 포함됩니다. `HwpjsNativeCanvas.podspec` 하나만 등록하며 Android autolink는 비활성입니다.

## 실제 Native artifact

패키지에 Native archive나 생성된 manifest를 자동 포함하지 않습니다. 실제 검증 archive와 새 source·package 세대는 구분하며, 과거 receipt를 새 세대로 재발급하거나 가짜 파일로 대체하지 않습니다. Native 소유자가 같은 source 세대의 archive/header/flag/ABI receipt를 준비해야 합니다. Pod 설치 시 `HWPJS_NATIVE_ARTIFACT_MANIFEST`에 그 절대 경로를 지정합니다. 미지정 시 패키지 옆 `native-artifacts.json`을 찾고, 없으면 `NativeArtifactsRequired`입니다.

receipt는 schemaVersion:1, profile:`hwpjs.native-canvas/1`, abiVersion:1, platform:`ios-simulator` 또는 `ios-device`, architecture:`arm64`를 명시합니다. source에는 revision(40자리 Git SHA)과 fingerprint(64자리 SHA256)가 필요합니다. files는 receipt 폴더 안의 상대 path와 실제 SHA256 목록입니다. archive.path는 그 목록에 있는 실제 `.a` 파일을 가리킵니다. headers에는 `hwp_native.h`와 `NativeCanvasAbi.h`의 목록 경로를 지정합니다. 두 헤더는 패키지의 파일과 정확히 같아야 합니다. bridgeFlags에는 snapshot/render flag와 V2 후보의 history flag의 0/1을 기록하며 Pod의 실제 요청값과 일치해야 합니다. 절대·이탈 경로, 중복 path, 지문 불일치는 거부합니다.

```sh
HWPJS_NATIVE_ARTIFACT_MANIFEST=/path/to/verified/native-artifacts.json \
HWPJS_NATIVE_SHARED_SNAPSHOT=1 HWPJS_NATIVE_RENDER_SOURCES=1 \
bundle exec pod install
```

이 receipt의 출처와 source 대응은 Native producer의 검증 책임입니다. JSON 필드나 파일 지문 검사만으로 실제 compile/link/runtime 완료를 단정하지 않습니다. flag 기본값은 OFF입니다. 플랫폼을 바꾸면 해당 아키텍처의 별도 archive와 검증이 필요합니다.

iOS Simulator에서 고정 Native archive를 사용하는 HWP5/HWPX의 첫 실제 Canvas paint, 입력·undo/redo·저장·재열기와 회전·dispose를 확인했습니다. HWP5의 기본 저장은 LayoutReflowRequired로 거부하며 호출자가 allowStaleLayout을 명시한 경우에만 미갱신 조판 저장을 선택합니다. 실기기·OS IME·Android·전체 조판·전체 Unicode 동치는 미검증입니다. 후속 공유 factory 변경은 기존 Simulator 실행 입력과 다르므로 새 JS 검증 근거로 구분합니다. Native V2 이력과 capability OFF는 서로 다른 동결 archive·CPP·Simulator 세대로 검증했습니다. 현재 HEAD 합성 후보의 재검증과는 구분합니다. [검증 범위](../../docs/react-native-canvas-verification.md)를 따릅니다. 현재 npm 발행 또는 서비스 배포 완료를 의미하지 않습니다.


## 문자 경계와 수명

Native의 NSString composed character sequences를 사용하고, 어댑터에서 CR/LF 사이 경계만 합칩니다. UTF-16 중간 경계·과다 행·sparse 응답은 거부합니다. 전역 Intl polyfill은 설치하지 않습니다. Native 의미 epoch가 없어 증분 flow cache는 비활성이며 웹 기본 Intl 경로와 분리합니다. renderer는 생성 시 포트를 소유하고 비동기 frame·timer에서 같은 포트를 사용합니다. 화면 해제 시 session.dispose() 완료를 기다립니다. Foundation과 웹의 16개 표본 일치는 전체 Unicode 버전 동치를 뜻하지 않습니다.
