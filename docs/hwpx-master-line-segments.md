# HWPX 마스터페이지 문단 줄 조각

`Document.inspectMasterPageLineSegments`와 `inspectKnown().master_page_line_segments`는 OPF가 선언한 정규 `Contents/masterpageN.xml` 중 루트의 직접 `hp:subList`에 속한 모든 후손 `hp:p`를 순회합니다. 각 문단의 직접 `hp:linesegarray`, 각 배열의 직접 `hp:lineseg`만 원값 검사 대상으로 선택합니다. 다른 namespace의 동명 요소와 직접 `subList` 바깥 요소는 포함하지 않습니다. 파트 선택·암호화 거부는 [마스터페이지 파트](hwpx-master-pages.md)가 소유합니다.

아홉 숫자 필드의 이름·순서·signed/unsigned 32-bit 어휘 판정, 원값 합계·부재·0·음수·상위 비트 진단은 [section 문단 줄 조각](hwpx-line-segments.md)의 `line_segments.noteArrayTag`와 `noteSegmentTag`를 그대로 사용합니다. 마스터페이지 스캐너는 XML 선택·직접 자식 구조·파트/합계 바이트 한도만 소유하며 필드 규칙을 복제하지 않습니다. `lineseg`의 조판/좌표 의미, 빈 배열의 기본값, 페이지 적용 순서는 해석하지 않습니다.

독립 `tools/hwpx-manifest-xml-oracle.py`의 ZIP/ElementTree 조사(2026-09-25 로컬 허용 HWPX 476개)에서 마스터페이지 61개, 직접 subList 61개, 후손 문단 394개, 직접 배열 394개, 직접 줄 조각 418개를 관측했습니다. 이 표본에는 빈 배열·미등록 직접 속성/자식이 없고 아홉 필드가 모두 존재했습니다. `spacing` 음수는 39개이며 나머지 signed 필드의 음수·상위 비트는 0개입니다. 값 합계와 8개 shard 분포는 `src/hwpx_corpus_expectations.zig`에 고정하고 제품 보고서와 대조합니다. 이는 선택한 표본의 관측이지 모든 버전의 필수성이나 레이아웃 정확성의 증명이 아닙니다.

합성 ZIP은 foreign `subList`·배열·줄 조각 제외, 중첩 문단, 빈 배열, 미등록 속성/직접 자식, unsigned 상위 비트와 signed 음수·부재, 손상 숫자·정확한 예산·OOM을 검사합니다. 독립 조사기 반례는 `python3 tools/hwpx-manifest-xml-oracle.py --self-test`, 실제 corpus는 인자 없이 실행합니다. 제품 검사는 `zig test src/root.zig --test-filter 'HWPX master line segments'`와 `zig test src/hwpx_known_survey.zig -O ReleaseFast --test-filter 'HWPX known document inspections shard N'`의 N=0..7입니다. 검사 통과는 마스터페이지 문단/표/그림 전체 의미, 편집·저장·무손실 왕복을 보증하지 않습니다.

적대적 검토에서는 section과 마스터페이지의 숫자 판정이 따로 갈라질 위험을 공통 `noteArrayTag`·`noteSegmentTag`로 제거했습니다. 마스터페이지 스캐너의 빈 배열 종료 시점, namespace 선언과 미등록 속성의 분류, 루트 직접 `subList` 밖의 동명 요소, 한 파트/여러 파트의 정확한 XML 바이트 한도, 성공·오류 경로의 할당 해제를 각각 반례로 확인했습니다. 여러 파트의 문단 합계에서 32비트 `usize` 오버플로가 발생하지 않도록 checked addition을 사용합니다. 이 검토는 원값·직접 자식 범위에 한정되며 줄 캐시나 페이지 배치의 의미를 검증하지 않습니다.

검증 결과: 독립 조사기 `--self-test`와 476개 corpus 집계, 제품 ReleaseFast known survey shard 0~7이 모두 통과했습니다. 전용 합성 테스트는 Debug·ReleaseSafe·ReleaseFast에서 각각 4/4(`root.test_0` 포함 5/5) 통과했고, 공유 필드 코드를 사용하는 기존 section 테스트도 ReleaseSafe·ReleaseFast에서 각각 5/5(`root.test_0` 포함 6/6) 통과했습니다. 최종 소스의 전체 Debug `zig build test --summary all`은 2,332/2,332 통과했습니다. `zig build -Doptimize=ReleaseSafe --summary all`, `zig fmt --check build.zig src`, `git diff --check`도 종료 코드 0입니다. 이 결과를 전체 HWPX 문서 유효성이나 편집·저장 지원률로 읽지 않습니다.
