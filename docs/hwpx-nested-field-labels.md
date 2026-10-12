# 중첩 필드 라벨의 소유 관계

## 실제 원본과 현재 제한

80168 규제분석 원본3807번에는 CLICK_HERE1575661790 안에1575661791이 있고,86712의1261번에는1505851852 안에1505851853이 있습니다. 이름이 같아도 ID는 별개이고 종료 순서는 내부→외부입니다. 첫 문서는 첫 텍스트가 두 필드 모두 안에 있으며, 둘째 문서는 외부의 앞 텍스트·내부 내용·외부의 뒤 텍스트가 존재합니다. 따라서 이름을 합치거나 임의의 첫 필드를 고르는 방식으로 입력 소유자를 정하지 않습니다.

제품과 이전 metadata-text-sites 후보는 중첩 범위를 거부하며 두 문단의 라벨 목록은 비어 있습니다. 아래 새 로컬 후보의 명시적 source 라벨 입력과 구분합니다. 기존 끝 마커 누락의 별도 원인과도 혼동하지 않습니다.

## 로컬 준비 모듈

field_nested_ownership은 텍스트 길이나 이름 대신 검증된 원문 content 범위로 same/disjoint/ancestor/descendant를 판정합니다. 같은 마커의 다른 end/범위, 역전 범위, 교차/동일 경계의 별개 마커는 거부합니다. 정상 source containment와 UTF-16 라벨 좌표는 별개이며, 이 모듈만으로 편집 범위나 마커 소유권을 승인하지 않습니다.

dirtyOwners는 선택 필드와 모든 조상의 element ID를 사전 할당합니다. 알려진 텍스트 필드 HYPERLINK/CLICK_HERE만 허용하고 계산·unknown 조상과 unexpected/subList 자식을 거부합니다. 로컬 후속 연결에서 Prepared가 dirty 대상과 자손 보호 span을 소유하고 deinit합니다. setter는 입력 전에 전체 dirty 용량을 확보하며, 성공 후에만 본인/조상 메타데이터를 함께 게시합니다. source getter와 setter는 같은 준비 정책을 사용합니다. 구조 모델의 validateLinked는 기존 strict를 유지합니다.

자손 marker의 검증된 원문 메타데이터 subtree만 그대로 보존하며 임의 XML 자식을 허용하지 않습니다. 바깥 필드 명령은 자손 내용·경계 삽입을 field_outside_range로 거부하고 독점 텍스트만 수정합니다. 중첩 begin들은 동일한 가장 가까운 subList 또는 root 소유자여야 하고 각 end도 해당 소유 범위 안이어야 합니다. root 필드가 다른 subList의 내부 필드를 감싸는 반례는 양방향으로 거부합니다.

## 실측과 다음 연결 조건

`zig test src/nested_field_reference_probe.zig -O ReleaseSafe --test-filter 'actual regulatory nested' --test-filter 'nested field source ownership'`는2/2 통과했습니다. 실제 원본 두 쌍의 엄격한 포함 관계, 내부 편집의 dirty 대상 각각2개/외부1개, max_owners=1 거부, 모든 helper 할당 실패, 조상 종류를 FORMULA로 바꾼 독립 보고서 반례의 거부를 확인했습니다. 보고서 반례는 복사본이며 실제 파일을 수정하지 않습니다. fmt/diff 공백도 확인했습니다. 이 진입점은 준비 모듈 검사이며 실제 라벨 입력·저장·이력·전체 native/public 검증이 아닙니다.

## 입력 연결 후 검증

중첩 라벨의 Canvas 입력 대상 선택을 위한 후속 readonly API/Worker 연결과 검증은 [범위 대상 조회](hwpx-field-range-target.md)가 소유합니다. 코어의 입력 보호와 marker/dirty 계약은 이 문서를 계속 따릅니다.

`zig test src/nested_field_regression_test.zig -O ReleaseSafe --test-filter 'nested source label edits' --test-filter 'nested field scope' --test-filter 'nested field source ownership'`는3/3 exit0입니다. 합성 문단의 getter 두 대상·바깥 명령의 내부 덮어쓰기/경계 입력 거부·동일 문자열 교체 no-op/dirty 불변·내부 입력의 두 dirty 갱신·모든 트랜잭션 할당 실패의 텍스트/메타데이터 원자성·저장/재열기·undo 원문/redo 수정본을 검사했습니다. 정규 root에 Session 검사도 등록했지만 이전 전체 바이너리에 자동 포함됐다고 주장하지 않습니다.

앞선 nested-field-labels 후보 SHA256 `fddbbcbdfd5391d7c9c6d2faebc9e2fba1f74cd98a86a43f32a8c8deaf98a0e6`는 실제 두 내부 필드와86712 외부 독점 prefix 세 입력이 통과했습니다. 추가 scope 보호 이후 nested-field-scope 후보 SHA256 `570ac93c15f40fed726db2fe82ecf538f38b10286a23f9dab244ca43d2c2e7c5`는 ReleaseSafe build6/6 exit0입니다. `HWPJS_TEST_WASM=/absolute/nested-field-scope/bin/hwpjs.wasm node --test tests/hwpx/nested-field-reference.test.mjs tests/hwpx/metadata-only-run-reference.test.mjs tests/hwpx/field-exterior-inline-reference.test.mjs`는3/3 exit0으로 세 중첩 입력과 앞선 여섯 문단의 독립 저장/이력 회귀를 확인했습니다.

`hwpx-nested-field-edit-oracle.py`는 대상 ID를 명시하고 해당 원본 문단의 시작/종료 stack으로 입력 텍스트의 직접 소유자와 조상 dirty를 독립 계산한 뒤 전체 XML/비대상 ZIP을 비교합니다. 다른 목록의 누락 마커도 전체 원문에 남아 비교하며 삭제/수정하지 않습니다. normal/-O self-test는 정상1개와 잘못된 기대값·잘못된 ID·비대상 payload 변경·조상 dirty 누락·본인 dirty 누락·종료 ID 변경·외부 텍스트 변경의7개 반례를 통과했습니다. 범위는 명시적 문단 내부 plain t prefix이며 다문단/인라인 중간 입력의 범용 검사가 아닙니다.

코어/Session 회귀/실제 API 회귀는 아직 로컬이고 제품 WASM도 승격하지 않았습니다. 진행 중인 metadata-text-sites 전체 검사는 새 중첩 연결 이전 source입니다. 최신 전체 native/public·구조 모델·다문단·Worker/Canvas·실제 브라우저는 남아 있습니다. UI의 겹친 라벨 자동 선택도 아직 해결하지 않았으며 임의의 첫 target을 고르지 않습니다. 명시적 ID 입력의 성공을 전체 자동 편집 완료로 읽지 않습니다.
