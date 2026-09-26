# HWPX 구역 쪽 설정 원값

`src/hwpx/page_geometry.zig`는 패키지가 선택한 2011 namespace의 section XML 트리에서 `hp:secPr`의 **직접** `hp:pagePr` 자식마다 쪽 설정을 읽습니다. 선택 순서대로 `section_ordinal`·`element_index`를 남기므로 한 section에 둘 이상 있어도 마지막 값으로 덮지 않습니다. `Document.inspectKnown`의 `page_geometry`와 `readXmlTrees().inspectPageGeometry()`가 동일 구현을 사용합니다.

해석 대상은 `pagePr@landscape` (`WIDELY`/`NARROWLY`), `@width`, `@height`, `@gutterType` (`LEFT_ONLY`/`LEFT_RIGHT`/`TOP_BOTTOM`) 및 직접 `hp:margin`의 `header`, `footer`, `gutter`, `left`, `right`, `top`, `bottom`입니다. 숫자 어휘와 u32 한도는 공통 `xml_values.unsigned32`가 소유합니다. 이름/enum 값은 고정 리비전 [한컴 OWPML 모델의 pagePr](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Para/pagePr.cpp), [margin](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Para/pmargin.cpp)과 [공통 네 변](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Core/marginAtt.h), [enum 목록](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/enumdef.h)을 기준으로 했습니다. 공개 모델의 생성자 기본값은 파일에 빠진 속성의 원값이 아니므로 주입하지 않습니다.

모든 속성·margin 자체의 부재는 `null`로 구분합니다. 두 번째 직접 `margin`은 `duplicate_margins`에 세며 첫 항목의 값을 유지합니다. 각 항목의 값은 검사하지만, 중복을 정상 schema라고 판정하지 않습니다. 낯선 enum·범위 밖 숫자·속성 바이트 한도 초과는 오류입니다. `max_pages`는 모든 section을 합친 쪽 설정 수의 상한입니다. 보고서는 원본 XML 트리와 독립적으로 소유되며 `deinit`해야 합니다.

이 보고서는 용지 치수·여백의 **원값 관측**입니다. `secPr` 자체의 문서 내 위치·조건부 선택, 다중 `pagePr`의 효력 순서, 상속·기본값, 실제 가로/세로 회전, 인쇄 가능한 영역, 레이아웃, 편집·저장은 검증하지 않습니다. 2011 이외 namespace는 기존 프로필 정책대로 미지원입니다. 검사 성공을 전체 HWPX 스키마 적합성으로 읽지 않습니다.

합성 테스트는 복수 구역 설정·속성 참조 해독·부재·중복·외부/중첩 태그·숫자/enum 오류·정확한 예산·모든 할당 실패 지점의 정리를 확인합니다. 추적된 `example`, `noori`, `page` HWPX의 독립 Python `zipfile`/`ElementTree` 조사값(방향·치수·여백)과 `inspectKnown` 결과도 대조합니다. `tools/hwpx-page-geometry-oracle.py`는 로컬 두 corpus의 section XML을 읽기 전용으로 조사하고, 별도 Zig known survey 8개 shard가 항목 수·방향·제본 방식·치수와 여백 일곱 필드의 합을 대조합니다. 이름으로 추린 section XML의 독립 목록이므로 OPF 완전성 검사와는 별개입니다. 통과하더라도 의미/레이아웃 동치는 아닙니다.

2026-09-25 검증: oracle 자체 반례, Debug·ReleaseSafe·ReleaseFast의 쪽 설정 필터 각 6개 테스트, 추적 실파일의 `inspectKnown` 대조, ReleaseFast 오류 경로 할당 회계가 통과했습니다. 선택 corpus 8개 shard는 각각 별도 ReleaseFast 프로세스로 통과했고, 총 484개 파일 중 476개 문서가 선행 검사에 진입했습니다(거부 ZIP 6개, 암호화 2개). 대상 section 544개에서 `pagePr` 555개·직접 margin 555개이며, 두 조사 모두 빠진 쪽 설정 section/필드와 중복 margin을 관측하지 않았습니다. `WIDELY` 544개·`NARROWLY` 11개, `LEFT_RIGHT` 23개·`LEFT_ONLY` 532개로 집계했습니다. `TOP_BOTTOM` 양성 실파일은 없으므로 합성 테스트만 뒷받침합니다. 일부 section에 설정이 여러 개인 것은 보존하며 효력 순서를 추정하지 않습니다.

같은 작업 상태의 `zig build test --summary all`은 Debug 2,390/2,390 테스트와 빌드 5/5 단계를 통과했습니다. `zig build -Doptimize=ReleaseSafe`와 `zig build audit -Doptimize=ReleaseSafe --summary all`도 종료 코드 0으로 성공했습니다. 이는 기존 프로젝트 회귀가 깨지지 않았다는 증거이지 HWP/HWPX 전체 문서 검증 완료의 증거는 아닙니다.

적대적 검토에서 한쪽 여백만 대조하면 나머지 여섯 필드의 오파싱을 놓치는 문제를 발견해 일곱 필드 합으로 확장했습니다. enum 주변 XML 공백도 숫자 어휘와 다르게 거부하던 점을 합성 반례로 고쳤습니다. 부재/0 구분, 다른 namespace·중첩 위치, 전역 상한, 후속 단계 오류 뒤 소유 보고서 정리, ReleaseFast에서의 명시적 할당 회계도 검사했습니다. 총합 대조는 개별 문서의 서로 상쇄되는 오류를 배제하지 못하므로 추적 실파일의 전 필드 값 대조를 별도로 유지합니다.

2026-09-27 현재 소스의 쪽 설정 집중 테스트와 추적 실파일 연결 테스트를 Debug·ReleaseSafe·ReleaseFast에서 다시 통과했습니다. 독립 ZIP/XML 조사에서는 484개 후보 중 ZIP 거부 6개·해독되지 않은 XML 2개, section 544개·`pagePr`/직접 margin 각 555개, `WIDELY` 544개·`LEFT_RIGHT` 23개로 위 기록과 일치했습니다. 조사기의 Python `int()`가 허용하던 잘못된 숫자 어휘·u32 초과를 명시적으로 거부하고, 뒤 section 손상 시 앞 section만 집계하지 않도록 파일별 원자적 집계로 바꿨습니다. 자체 반례는 일반·`-O` 양쪽에서 통과했고 `-O`에 고장 난 관측 함수를 주입하면 실패했습니다. 직전 묶음의 제품 코드 불변 상태에서 통과한 known 8개 shard를 재사용했으며 이번 묶음에서 다시 실행하지 않았습니다. 당시 전체 테스트/audit 개수도 현재 전체 테스트 수로 읽지 않습니다.
