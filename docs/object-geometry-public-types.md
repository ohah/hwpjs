# 개체 크기·위치 공개 타입 경계

공개 geometry DTO는 packages/core/src/commands/object-geometry-dto.ts가 소유한다. Core commands/object-geometry.ts의 공개 타입 재수출은 같은 패키지 안의 선언으로 연결한다. 저장소 JS facade의 object-geometry-edit.d.mts는 이 DTO를 type-only import/reexport하여 별도 정의를 만들지 않는다. 수치·readonly·binding·source SHA·owner·frame의 값 형태는 이전과 같다.

이 이동은 실행 권한을 만들지 않는다. ObjectGeometryTarget의 고유 symbol과 Core WeakMap 소유권, 현재 editor/state/token/session/history revision/expected owner 검증, wire 검증·복제, Runtime 및 Native 오류 우선순위는 변경하지 않는다. create-editor와 index의 실행 코드를 수정할 필요가 없다.

fd6cf3e 기준 공식 public --js-only 빌드의 원실패는 types/core/src/commands/object-geometry.d.ts가 ../../../../js/object-geometry-edit.mjs를 따라 dist/types 바깥 js/object-geometry-edit.d.mts로 이탈한 것이다. TypePathEscape guard를 유지한 채 타입만 옮겼고 같은 빌더의 정상 종료를 확인했다. 새 object-geometry-dto.d.ts는 공개 선언 도달 그래프 안에 남는다.

실제 공개 package exports consumer는 웹/일반 환경과 별도 플랫폼 환경으로 구분한다. 테스트 fixture는 packages/core/tests/types/object-geometry-public-types-consumer.ts 및 object-geometry-public-native-types-consumer.ts이다. 설치된 공개 패키지의 exports만 사용하고 source alias나 대체 DTO를 쓰지 않는다. 두 환경은 strict 및 skipLibCheck=false이며, 웹 DOM과 별도 플랫폼 전역 선언을 같은 프로그램에 섞지 않는다. 공개 8개 타입 루트를 두 환경에 걸쳐 확인한다.

각 fixture의 음성 5건은 불투명 target 위조, 수치 문자열, frame readonly 쓰기, 허용 밖 selector kind, binding serial 수치다. @ts-expect-error를 제거한 대조 프로그램은 정확히 이 5개 오류를 내야 한다. 공개 패키지의 정상 빌드가 먼저 있어야 하며 Native 실행이나 npm 게시는 필요하지 않다. 시험 입력은 실제 명령 실행용 프로그램이 아니라 noEmit 타입 consumer다.

별도 증거 패킷에 원실패와 정확한 이탈 edge, 공개 선언 전체 그래프, 일반/별도 플랫폼 emit 입력·출력, consumer 양성·음성, 원실패 단계와 수정 단계의 실행 JS/CSS 바이트 동치, source 전후 핀을 보존한다. 타입·정상 JS 빌드의 통과를 Native·브라우저·배포 성공으로 해석하지 않는다.
