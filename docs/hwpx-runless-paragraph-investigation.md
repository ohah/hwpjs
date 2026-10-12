# Run 없는 문단의 입력 경로 조사

## 현재 실측

2026-10-13 후보 SHA256 `a6b30bb986825a08e720035019b5a66e9d6bbf0f735df612255ee3fa5922372f`로 다음 읽기 전용 조사를 실행했습니다.

```sh
node tools/reference-hwpx-prefix-query-audit.mjs --wasm=zig-out/verification/section-metadata-source-affinity/bin/hwpjs.wasm --root=reference/rhwp/samples/hwpx/opengov
```

21파일 모두 조회, 파일 읽기 실패0, 문단2614개 중 plain1642·anchored123·field846·거부3입니다. 종료코드1은 남은 거부를 나타내며 실제 편집·저장·브라우저·조판 지원 완료가 아닙니다. 거부는 36386761의28번, 36388711의1번, 36389301의26번 문단이며 모두 최종 조회 오류 UnsupportedFieldLabelRange입니다.

## 36386761의28번 문단 원인

독립 Python ZIP/XML 읽기로 section0의28개 문단을 대조했습니다. 대상은 hp:p 아래에 linesegarray만 있고 hp:run과 hp:t가 없습니다. 따라서 단순히 빈 t나 빈 run이 있는 기존 입력 경로와 다릅니다. text_sites.collect는 t·빈 run·검증된 metadata-only run에만 사이트를 만들고, paragraph_site_owner.resolve는 사이트가 없는 문단에 MissingTextSite를 반환합니다. 최종 필드 경로의 오류 이름만으로 문서에 필드가 있다고 해석하면 안 됩니다.

대상 문단의 styleIDRef는0이며 header.xml의 style0은 charPrIDRef2를 참조합니다. 직전 문단의 빈 run은 charPrIDRef10입니다. 임의0 또는 직전10을 사용하면 원문 스타일의2와 달라집니다. 이 문단의 정확한 글자 모양 선택에는 기존 스타일 참조 읽기와 새 run 생성의 계약이 필요합니다.

## 구현 경계

현재 이 문단의 입력 지원은 미완료입니다. 안전한 구현은 문단 원문 소유권·명시적 스타일 참조 검증·namespace에 맞는 run/t 생성·기존 lineseg 캐시 무효화·실패 원자성을 함께 처리해야 합니다. 읽기 때 원본 ZIP을 자동 수정하거나 모든 MissingTextSite를 허용하는 방식은 사용하지 않습니다. 자기 닫힌 문단, 주석/PI, 외래 자식, 미지 스타일, 중첩 소유권도 별도 반례로 다뤄야 합니다. 전체 XML/ZIP 독립 비교·입력/서식/undo/redo/재열기와 실제 Canvas 검증 전에는 지원 완료로 계수하지 않습니다.

## 스타일 참조 연결의 로컬 구현

`src/hwpx/paragraph_style_character.zig`는 기존 header_tree와 header_resources.Table을 재사용해 명시적 스타일 ID의 charPrIDRef를 조회합니다. head/refList/styles의 직접 style만 인정하고, ID를 배열 인덱스로 취급하지 않습니다. 참조 누락·글자 모양 누락·중복 스타일·외래 namespace·잘못된 중첩은 거부합니다. 기존 xml_values의 정수 파서와 트리 attributeValue/디코더를 재사용하며 원본이나 테이블을 수정하지 않습니다.

`zig test src/paragraph_style_character_regression_test.zig -O ReleaseSafe --test-filter 'paragraph style character'`의1개 회귀는6개 구조/참조 사례와 조회의 전체 실패 할당을 검사합니다. 추가 파일 및 root 등록의 fmt 검사를 통과했습니다. 입력 거래 연결과 실제 run 생성은 아직 없고, 이 native 변경은 최신 전체 검증을 기다리는 로컬 변경입니다. 문서 커밋만으로 native 구현이 원격에 배포됐다고 해석하지 않습니다.
