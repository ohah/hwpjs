# 데모 그림 신규 삽입

기준은 exact `616f3e3ae629bb6389036416611643c47d490a40`이다. 사용 순서는 [공개 데모 안내](../apps/docs/docs/guide/demo.md#새-그림-삽입), typed API와 기본 저장은 [편집 API](../apps/docs/docs/api/editor.md#그림-신규-삽입), Native 소유권은 [열린 문서 그림 계약](live-picture-insertion.md)이 소유한다. 기존 그림 교체 CLI와 신규 삽입을 구분한다.

## 파일과 크기

PNG/JPEG 최대8MiB만 받는다. UI는 시그니처와 브라우저 bitmap decode를 확인하고 decoder를 닫으며, Native는 별도로 구조·크기·CRC 등을 검사한다. 두 검증은 같은 보장이 아니다. 확장자·MIME만으로 통과시키지 않는다.

UI의 최초 크기는96px/inch 기준으로 원본 픽셀을 HWPUNIT에 대응시키고, 확대 없이150×150mm 안에 비율을 맞춘 값이다.150mm는 최초 제안의 한도이며 수동 입력의 최대값은 아니다. 용지 폭 자동 적합·EXIF 해상도 적용·인쇄 기하 보장은 아니다. 수동 mm는 소수 둘째 자리까지 받으며, 실제 명령은1~2147483647 정수 HWPUNIT이다. 미편집 크기는 표시 mm의 반올림으로 다시 변환하지 않는다.

## 커서와 이력

파일을 읽기 전에 기존 Surface의 settled/IME/current caret lease를 캡처한다. 문서나 커서가 바뀌면 다시 선택해야 한다. HWP5는 현재 SelectionTarget과 기존 display→source 변환을 사용한다. HWPX는 Native body owner query를 거치며 원래 anchor text/unit를 유지한다. 빈 본문의 구역·단 접두부를 제거하지 않는다.

한 번의 `INSERT_IMAGE_COMMAND`로 전달하고 UI가 별도 checkpoint를 만들지 않는다. Core/Native가 성공한 한 거래를 undo/redo한다. 결과 불명·`committed-refresh-required`는 자동 재삽입하지 않는다. 저장 후 새로 연 문서에 이전 세션의 undo 이력이 이어진다는 의미는 아니다.

## HWP5 저장과 geometry

exact616f의 공개 `editor.save()`는 `allowStaleLayout:false`가 기본이다. Worker와 `document-save.mjs`도 이를 그대로 전달한다. 삽입 뒤 `LayoutReflowRequired`가 나면 기본 저장은 실패한 것이다. 데모의 **줄 배치가 달라질 수 있는 HWP 저장 허용**은 문서별 명시 동의이며 문서 교체 때 해제된다. 빈 baseline 생성에 이 옵션을 사용하지 않는다. 그림이 포함된 편집 문서의 엄격 조판 저장을 텍스트 전용 strict 측정 저장의 범위로 합치지 않는다.

그림에 요청한 HWPUNIT 폭·높이와 본문 앵커는 저장 레코드의 기하 계약이다. 화면에서 계산한 줄·쪽 배치와 한글에서 다시 조판한 위치가 같다는 보장은 아니다. 저장 허용은 geometry 갱신이 아니다. 공개 Core의 `geometryGuard(save)`는 거부 시 geometry를 무효화하므로 SDK 호스트는 이전 geometry 관측·lease를 그대로 재사용하지 않고 최신 관측을 확인한다. `SaveResult.staleSnapshot`은 상태 복구 여부이고 조판 신선도를 대신하지 않는다. `layoutRequiresReflow`를 별도로 확인한다.

## 확인한 증거와 남은 단계

- UI/Core 연결의49개 단위 검사는 실제 파일 저장의 증거가 아니다.
- exact c558 Native는 새 그림8+기존H5차트5+registrar3,16/16 PASS다. PNG 메모리 저장·fresh Session 재열기·undo/redo와 기본 저장 거부를 포함한다.
- f217 공식 ReleaseSmall의 실제SHA는 `c4762035e49c79f8911a10f867ce992a7f8262d8d4168893c628f12eb19c44da`다. 기존565개 함수 서명을 보존하고 이미지4개만 추가한569개 ABI를 확인했다. c558 Native 결과를 f217의 exact 재실행으로 부르지 않는다.
- exact616f 공식 SDK continuation은 공개 패키지·갤러리 빌드와 정상 패키지 import를 통과했다. 이 결과만으로 이미지 세션 저장·GUI 실행까지 확대하지 않는다. Main이 관리하는 실제 이미지 SDK 명령 결과와 브라우저 결과는 각각의 정확 receipt로 판정한다.
- Arch 브라우저 계약은 편집된 H5에만 명시 stale 저장을 허용하고 baseline에는 허용하지 않는다. 이 문서는 브라우저 성공·공개 배포·공식 한글 수용을 주장하지 않는다.

## 빈 예제 제안

exact616f의 승인 gallery120개와 catalog를 메타데이터로 대조했다. 빈 그림 삽입 예제로 명시되고 producer에 바인딩된 H5/HX 항목은 없다. 기존 `page.*`나 차트 예제의 이름만으로 빈 문서·보호 없음·대상 적합을 추정하지 않았다. 승인된 `page.hwp/hwpx`는 각각43문단/텍스트8단위, `pagedefs.hwp/hwpx`는 각각2문단/텍스트45단위, own H5 차트 예제는1문단/텍스트47단위로 독립 raw 검사에서 빈 문서가 아니었다. 이 검사는5개 후보에 한정하며 나머지 모든 갤러리 파일의 적합성을 판정한 것은 아니다. 현재 사용자는 **파일 → 새문서**에서 시작할 수 있다.

`tools/pages-demo/image-insertion-fixture-plan.json`의 후속 생산 후보에서 own 빈 문서2개를 만들었다. 정상616f/c476 SDK의 `createDocument()`와 기본 `save()`를 사용했고 stale 허용은0이다. 형식별 반복 생성과 fresh SDK 세션 재열기·기본 저장의 바이트가 일치하며 독립 CFB/ZIP/XML 검사와 실제 CLI info/markdown 읽기4개가 통과했다. producer와 휴대 가능한 receipt를 함께 제공한다.

- HWP5:3584바이트, SHA256 `3924fe5f437ffaa76f6696770cb4ae5fc19ffe485fb324bb21abc29b1f2cc689`,5.0.3.0/flags0/본문1개/가시 텍스트0/이미지0. 선행 구역·단 컨트롤과 마지막 CR은 유지한다.
- HWPX:6671바이트, SHA256 `8b74ee3b9a26ab112276241a39779f21de3b26ce8ec20ceb8093a443e41ff1ee`,ZIP7부품/본문1개/텍스트0/이미지·외부 관계0.

격리 후보의 public catalog/policy/manifest/source map에 두 항목을 추가했다. 기존120항목과 runtime/engine/worker는 유지한다. 공개 등록 후보이며 배포·새 갤러리 빌드·브라우저 성공은 아직 아니다. 재생산은 `tools/pages-demo/produce-image-insertion-blanks.mjs`에 명시 SDK root/binding/source receipt/새 private output을 전달한다. 이 producer는 실제 파일을 공개 경로에 쓰지 않으며 기본 저장과 재현성·fresh reopen이 전부 통과한 뒤 exclusive 파일을 만든다.
