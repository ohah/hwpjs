# 메타데이터 전용 run의 텍스트 입력

## 원인과 소유 계약

issue1891의80168/86712 규제분석 원본5번 문단은 run 안에 ctrl/pageNum만 있고 hp:t가 없습니다. 기존 text_sites.collect는 자식 없는 run에만 빈 텍스트 사이트를 만들므로 두 문단의 일반 입력과 split 조회는 MissingTextSite로 거부됐습니다. 쪽번호를 텍스트로 해석하거나 표시 번호를 합성하는 문제가 아닙니다.

로컬 수정의 retained_run_metadata.runOnly는 정확한 paragraph namespace run의 직접 자식이 기존 supported 메타데이터 컨트롤뿐인지 판정합니다. 원문 사이의 비공백 내용·필드·그림·알 수 없는 컨트롤·기존 t를 제외합니다. text_sites.collect는 이 판정으로 run 시작 태그 직후의 빈 missing_text 사이트를 소유합니다. 입력·저장은 기존 공통 문자 트랜잭션과 XML writer를 사용하고 기존 메타데이터를 그대로 복사합니다. 메타데이터 종류 판정을 collector에 복제하지 않습니다.

## 검증과 현재 경계

후속 `'metadata only text collection'` 집중 검사는1/1 exit0입니다. max_sites=0의 LimitExceeded, collect와 변경 없는 writer의 모든 할당 실패 정리·원문 불변, 성공 시 빈 missing_text 사이트1개와 byte-exact 저장을 확인했습니다. 이 테스트는 앞서 기록한 후보의 코어와 같은 정책이며 전체 source gate와 합산하지 않습니다.

이전 장시간 실행의 핸들과 임시 로그가 사라져 최종 결과를 입증할 수 없었습니다. 해당 실행을 성공으로 세지 않고 현재 코어에서 정규 `zig build test -Doptimize=ReleaseSafe -j1 --summary all`을 재시작했습니다. 로그는 `zig-out/verification/metadata-text-sites/native-full.log`에 보관합니다. 이 실행 시작 뒤 위 할당 회귀가 추가됐으므로 그 집중 결과를 별도 기록하며 전체 검사에 자동 포함됐다고 가정하지 않습니다. 코어 정책은 실행 중 추가 변경하지 않았습니다.

`zig test src/field_scope_regression_test.zig -O ReleaseSafe --test-filter 'metadata only page number'`는 수정 전1/1 실패를 재현하고 수정 후1/1 통과했습니다. 입력·재열기/재저장과 입력 전체 삭제 후 원본 byte-exact 복원을 검사합니다. `'metadata only run text binding'` 필터는 필드·그림·unknown ctrl·쪽번호 뒤 opaque 텍스트에 사이트를 만들지 않는 네 반례를1/1 통과했습니다.

metadata-text-sites 후보 SHA256 `d3bbada08ceca03791f2b870ffef315b6206933f02de1b50f6676b1d05b78210`는 ReleaseSafe build6/6 exit0입니다. `HWPJS_TEST_WASM=/absolute/metadata-text-sites/bin/hwpjs.wasm node --test tests/hwpx/metadata-only-run-reference.test.mjs tests/hwpx/field-exterior-inline-reference.test.mjs`는2/2 exit0입니다. 실제 두 쪽번호 문단과 앞선 네 하이퍼링크 문단의 저장·재열기·undo 원문/redo 수정본 및 normal/-O 독립 전체 XML/비대상 ZIP·잘못된 기대값 거부·원본 파일 불변을 확인했습니다. 독립 검사기는 원문의 유일한 ctrl/pageNum 앞에 t 하나를 추가한 기대 트리와 전체 출력 트리를 비교합니다.

코어 수정과 회귀 파일은 아직 로컬입니다. 제품 WASM 승격·최신 전체 native/public 검증·모든 메타데이터 종류의 실제 파일·문단 구조 split/merge·Worker/Canvas는 별도 검증이 필요합니다. 진행 중인 field-inline-exterior 의존 회귀는 이 수정 이전 바이너리이므로 이 정책의 전체 검사로 사용하지 않습니다. 관련 잔여 필드 범위와 입력 거부 분류는 [끝 마커 없는 필드 범위](hwpx-unmatched-field-scope.md)가 소유합니다.
