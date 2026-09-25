# HWPX 구역 쪽 테두리 리소스 참조

`src/hwpx/section_page_border_refs.zig`는 [구역 쪽 테두리 원값](hwpx-section-page-borders.md)의 `borderFillIDRef`를 기존 header 리소스 색인의 `borderFills/borderFill@id`와 연결하는 읽기 전용 진단입니다. `Document.inspectKnown().section_page_border_references`는 같은 원값 보고서와 `resources.table(.border_fill)`을 재사용하며 XML을 다시 파싱하지 않습니다. 직접 호출 시 `inspect(&border_report, header_border_table)`을 사용합니다. 진단은 전체 문서 거부나 실제 쪽 선택·렌더링 정책으로 승격하지 않습니다.

각 `pageBorderFill`에 대해 속성 부재, 대상 해결, 리소스 표 부재, 대상 ID 누락을 구분합니다. ID 0은 부재가 아니며 `zero`로 추가 집계한 뒤 **실제 리소스 표에서 조회**합니다. 따라서 `zero`는 다른 결과와 겹치는 보조 집계이고, `absent + resolved + absent_table + missing_target == borders`가 배타적인 분할입니다. 첫 미해결 ID·section 순번·요소 인덱스를 남깁니다. 이 정책은 공통 `id_references.resolveValue`를 사용하며, 0을 일률적으로 sentinel로 간주하지 않습니다. ID 원값은 [공통 unsigned32 검사](hwpx-section-page-borders.md)를 다시 확인하므로 원값 보고서를 임의로 조립해 전달해도 잘못된 숫자를 성공으로 바꾸지 않습니다.

독립 `tools/hwpx-section-page-border-oracle.py`는 ZIP의 header `refList/borderFills` ID 집합과 section 직접 `pageBorderFill`을 별도로 읽습니다. 2026-09-25 로컬 HWPX 코퍼스 476개 수용 문서의 1,615개 참조 중 1,585개가 해결됐고, ID 0인 30개는 모두 실제 header 대상이 없었습니다. 부재·리소스 표 부재·양수 대상 누락은 이 코퍼스에서 없었으며 합성 반례로만 검증합니다. 30개는 `reference/rhwp/samples/hwpx/issue2019_floating_form_74312.hwpx`의 10개 구역에 각각 3개씩 있으며, 리소스 색인에서도 0이 없음을 실파일 테스트로 확인합니다. 이는 그 문서를 전체적으로 무효라고 선언하거나 0의 모든 버전 의미를 확정하는 근거가 아닙니다.

검증은 독립 oracle 자체 반례, 합성 테이블의 ID 0 존재/부재와 표 부재, 첫 미해결 위치, 실파일 0 사례, 8개 ReleaseFast 코퍼스 shard의 문서별 결과 및 분포를 포함합니다. 원문 타입 `BOTH/EVEN/ODD`별 실제 적용 순서, borderFill 객체의 내부 서식 의미, 편집·저장·무손실 왕복은 이 계층 범위 밖입니다.

## 검증 기록과 적대적 재검토

2026-09-25 `zig test src/root.zig --test-filter 'HWPX page border references'`는 Debug·ReleaseSafe·ReleaseFast에서 각각 합성·실파일 테스트를 통과했습니다. 독립 oracle 자체 반례와 8개 shard의 ReleaseFast 대조에서 수용 HWPX 476개의 `resolved` 1,585·`missing_target` 30·`zero` 30·`absent` 0·`absent_table` 0을 재현했습니다. 전체 `zig build test --summary all`은 5/5 단계·2411/2411 테스트, `zig build audit -Doptimize=ReleaseSafe --summary all`은 40/40 단계·2450/2450 테스트, `zig build -Doptimize=ReleaseSafe --summary all`은 5/5 단계로 통과했습니다.

적대적 검토에서는 0이 실제 ID로 존재하는 합성 표에서는 해결됨, ID 0이 없는 표에서는 대상 누락, 표 자체가 없으면 표 부재가 되는 세 경로를 분리했습니다. 첫 미해결 ID가 0이어도 optional 값으로 보존되고 정확한 section·요소 위치를 가리키는지 확인했습니다. 실파일의 ID 0 30개를 무조건 sentinel로 삼지 않았고, 모든 양수 ID의 실제 표 해결을 독립 조사와 대조했습니다. 조사기 역시 손상 파일의 앞 section만 부분 집계하던 가능성을 막기 위해 파일별 원자적 집계로 바꾸고, 뒤 section 손상 반례로 검증했습니다. 이 진단은 문서 무효 판정이나 쪽별 `BOTH/EVEN/ODD` 적용 의미를 결정하지 않습니다.
