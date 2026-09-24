# HWPX 표 셀의 직접 subList 검사

`src/hwpx/table_cell_sub_lists.zig`는 [표 격자 검사](hwpx-table-geometry.md)가 이미 선택한 직접 `hp:tc` 안에서 직접 자식인 `hp:subList`만 관측합니다. 외부 네임스페이스의 동명 요소, 다른 자식 아래의 중첩 `subList`, 중첩 표의 셀은 현재 셀의 목록으로 합치지 않습니다. 중첩 표는 별도 표/셀로 다시 검사됩니다. 한컴 공개 모델의 [tc 자식 매핑](https://github.com/hancom-io/hwpx-owpml-model/blob/1453388472c703a4b299a0834f425cdac16644b9/OWPML/Class/Para/tc.cpp)을 선택 근거로 삼습니다.

목록 속성은 기존 [ParaListType 공통 계약](hwpx-para-list.md)의 `para_list_attributes.readTree`가 소유합니다. 이 함수는 공통 XML 트리의 원본 시작 태그를 한 번 읽고, 마스터페이지 경로의 `read`와 동일한 필드·정수·Boolean·열거값 판정을 사용합니다. 이름 공간이 없는 알려진 속성만 수용하며, 접두 속성과 미지 속성은 따로 셉니다. 해독된 값은 일시적으로 소유했다가 집계 후 해제합니다. 부재와 빈 문자열, 미지 열거값을 기본값이나 오류로 합치지 않습니다.

보고서는 셀 수, `subList` 수, 직접 목록이 없는 셀·둘 이상인 셀, 직접 요소 자식이 없는 목록, 직접 `hp:p` 수와 다른 직접 요소 수를 분리합니다. `empty_sub_lists`는 요소 자식의 부재만 뜻하며 문자 데이터의 부재를 증명하지 않습니다. 11개 공통 속성 각각의 존재·빈 값, 미지 열거값·다른 속성, `textWidth`/`textHeight` 원값 합계, 두 Boolean의 true 수를 기록합니다. 두 목록 이상을 첫 목록으로 덮지 않으며 각각 검사합니다. 목록·직접 문단 개수는 별도 한도를 갖습니다. section 전체의 문단·run 메타 필드 검사는 기존 검사기가 계속 소유하고, 여기서는 중첩 문단을 직접 문단으로 잘못 세지 않습니다.

독립 ZIP/ElementTree 조사기의 2026-09-24 로컬 표본은 허용된 476개 문서·106,998개 셀에서 각 셀의 직접 `subList`가 하나씩이고 직접 문단은 합계 128,104개라고 관측했습니다. `id`는 59개 목록에서 없고 나머지 106,939개는 빈 문자열이며, `metatag`는 100개 목록에서 존재합니다. 나머지 9개 공통 속성은 모든 목록에 있었고, 이 표본에서는 `textWidth`·`textHeight` 합계와 Boolean true 수, 미지 열거값·다른 직접 요소 수가 0입니다. 이는 표본의 분포이지 포맷 전체의 필수·금지 규칙이 아닙니다.

`subList` 내부 문단 흐름·서식·다른 제어 요소, `linkListIDRef`와 `linkListNextIDRef`의 실제 대상, `metatag` 내용, 셀 레이아웃·편집·저장 의미는 아직 구현하지 않았습니다. 보고서의 성공은 셀 본문의 완전한 파싱을 뜻하지 않습니다.

`subList`와 다른 셀 직접 자식의 실제 순서·미등록 요소는 [행·셀 topology](hwpx-table-child-topology.md)가 별도 진단하며, 목록 본문의 의미 검사는 여전히 남아 있습니다.

## 검증

`zig test src/root.zig --test-filter 'HWPX cell subLists'`는 직접 자식·외부 네임스페이스·중첩 제외, 두 목록·요소 자식 부재, 부재/빈 속성·미지 열거값, 숫자/Boolean 오류, 정확한 한도 및 모든 할당 실패 위치를 검사합니다. `--test-filter 'HWPX ParaListType tree reader'`는 잘못된 요소·인덱스와 동일한 XML 태그에 대한 마스터페이지 스트리밍 경로/section 트리 경로의 원값·진단 일치를 확인합니다. `HWPX known inspections include table geometry`는 전체 문서 진입점과 실패 경로를 연결합니다. `python3 tools/hwpx-table-oracle.py --self-test`는 독립 조사기 반례를, 인자 없는 실행은 실파일 분포를 셉니다. `zig test src/hwpx_known_survey.zig -O ReleaseFast --test-filter 'HWPX known document inspections shard N'`을 N=0..7 각각 실행해 개수·직접 문단·`id` 부재·`metatag` 존재를 대조합니다. 실파일 검사는 로컬 `reference/rhwp` 표본이 없으면 재현되지 않습니다.

2026-09-24 최종 소스에서 독립 Python 조사기 자체 반례·476개 실파일 집계, ReleaseFast 실파일 분할 0..7, Debug 전체 2,302/2,302 테스트, `zig build -Doptimize=ReleaseSafe --summary all`, `zig build audit -Doptimize=ReleaseSafe --summary all`, 표 셀 목록과 ParaListType 트리 판정의 ReleaseFast/ReleaseSafe 단독 시험, `zig fmt --check build.zig src`, `git diff --check`가 통과했습니다. 적대적 점검은 외부 네임스페이스·중첩 목록의 오선택, 두 직접 목록의 첫 항목만 취하는 손실, 빠진 `id`의 빈 문자열 대체, 미래 열거값의 임의 거부, 스트리밍/트리 판정의 차이, 문자 데이터가 있는데 요소 자식이 없는 목록의 과잉 해석, 한도·할당 실패 경로를 반례로 확인했습니다. 이 결과는 표본과 위 경계의 검사 증거이지 셀 본문 의미·레이아웃·저장 완료의 증거가 아닙니다.
