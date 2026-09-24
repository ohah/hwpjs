# HWPX 표 셀 크기·여백 원값 검사

`src/hwpx/table_cell_fields.zig`는 [표 격자 구조](hwpx-table-geometry.md)가 선택한 직접 `hp:tc`에서 `hp:cellSz`, `hp:cellMargin` 및 셀의 `hasMargin`을 관측합니다. 표·행·셀 선택은 격자 검사에만 두고, 두 검사기가 공유하는 직접 자식 선택과 원문 속성값 정규화는 `table_xml_fields.zig`가 소유합니다. 공통 XML 트리·속성 토큰과 `xml_values.zig`의 정수/Boolean 어휘를 재사용합니다. `Document.inspectKnown(...).table_geometry.cell_fields`에서 결과를 얻습니다.

근거는 한컴 공개 모델 고정 커밋의 [tc](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Para/tc.cpp), [cellSz](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Para/cellSz.cpp), [cellMargin](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Para/cellMargin.cpp), [공통 margin 속성](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Core/marginAtt.cpp)입니다. 공개 C++ 모델의 여백 멤버는 `UINT`지만 실제 표본에는 음수 문자열과 32비트 상위 비트가 켜진 양수 문자열이 모두 있습니다. 구현은 음수 `i32` 범위와 양수 `u32` 범위를 **서로 다른 원값으로** 허용하며 둘을 2의 보수로 강제 변환하지 않습니다. 원본 XML은 소유 트리에 그대로 남습니다.

크기 두 필드는 부재·0·`u32` 원값 합계를, 여백 네 필드는 부재·0·음수 표기·상위 비트 표기·정수 원값 합계를 각각 기록합니다. 두 자식 요소의 부재와 중복도 별도 진단이며, 하나가 없거나 중복돼도 살아 있는 쪽의 값은 검사합니다. `hasMargin`은 부재/false/true를 구분하고, 여백 요소의 존재와 일치한다고 가정하지 않습니다. 크기·여백 `0`, 음수 여백, `hasMargin=false`와 여백 요소의 동시 존재를 즉시 오류로 승격하지 않습니다. 지원 범위 밖 정수 어휘·값과 잘못된 Boolean은 오류입니다. XML 정규화 후 속성값 길이는 기존 표 검사 옵션의 `max_attribute_bytes`를 사용합니다.

2026-09-24 로컬 HWPX corpus에서 허용된 476개 문서의 544개 section·106,998개 셀 모두 크기/여백 요소와 요구 속성을 가졌습니다. `hasMargin=true`는 15,605개, false는 91,393개였고 false인 셀에도 여백 요소가 전부 있었습니다. `cellSz/@height=0`은 282개입니다. 음수 문자열은 right/top/bottom에 각 6개, `0x80000000` 이상의 양수 문자열은 left/right/top/bottom에 각각 14,126/13,914/14,297/14,274개입니다. 따라서 공개 모델의 `UINT`만을 근거로 음수를 거부하거나 플래그로 여백 요소를 생략해서는 표본을 그대로 읽을 수 없습니다. 이 숫자는 표본의 관측치이지 모든 HWPX 버전의 허용 범위를 증명하지 않습니다.

크기와 여백의 물리 단위·렌더링 크기·패딩 적용, 행 높이와 표 선언 크기의 관계, `hasMargin`의 화면상 의미, 셀 내부 `subList`, 테두리·채우기·편집·저장은 이 검사 범위가 아닙니다. 보고서의 성공은 이러한 의미 검증 완료를 뜻하지 않습니다.

## 검증

`zig test src/root.zig --test-filter 'HWPX table cell fields'`에서 음수/상위 비트 보존, 엔티티 정규화, 네임스페이스가 다른 속성, 부재·중복, 잘못된 정수/Boolean, 길이 한도 및 모든 할당 실패를 확인합니다. `python3 tools/hwpx-table-oracle.py --self-test`는 독립 조사기의 반례를, 인자 없는 실행은 ZIP/ElementTree 실파일 분포를 셉니다. `HWPX known document inspections shard N`을 N=0..7 각각 별도 ReleaseFast 프로세스로 실행해 원값 합계와 부재·0·음수·상위 비트 분포를 `src/hwpx_corpus_expectations.zig`와 대조합니다. 로컬 `reference/rhwp`가 없으면 이 실파일 검사는 재현되지 않습니다.

2026-09-24 재검증: 독립 Python 조사기 자체 반례와 476개 실파일 집계, Zig ReleaseFast 분할 0..7, `zig build test --summary all`(2,292/2,292), `zig build -Doptimize=ReleaseSafe --summary all`, `zig build audit -Doptimize=ReleaseSafe --summary all`, ReleaseSafe/ReleaseFast 표 셀 필드 단독 시험(각 6/6), `zig fmt --check build.zig src`, `git diff --check`가 통과했습니다. 적대적 재검토에서는 직접 자식·무접두 속성만 선택하는지, `hasMargin`과 여백 요소를 혼동하지 않는지, 크기·여백 부재에 기본값을 발명하지 않는지, 음수와 상위 비트 양수를 합치지 않는지, 중복 중 살아 있는 필드를 잃지 않는지, 제한 초과·할당 실패 경로를 확인했습니다. 이 통과는 표 셀 원값 검사 범위의 증거이며 전체 파서 완성도나 레이아웃 일치를 보증하지 않습니다.
