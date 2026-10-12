# 그림 소유 위치의 임시 일괄 조회

## 병목과 계약

[자동 번호 화면 snapshot 조사](hwpx-automatic-number-display-snapshot.md)의 실제 load에서 picture_owner82회/21,424ms를 관측했습니다. 기존 `picture_owner.read`는 매 그림마다 display_current_paragraphs를 생성·해제합니다. 이는 전체 화면 시간이 아닌 호출 추적의 부분 비용입니다.

로컬 `picture_owner.readMany`는 요청한 그림들에 현재 문단 view 하나만 생성합니다. 기존 단일 read와 새 batch는 같은 readCurrent·picture_display_host 함수를 공유하여 문단·소유 그룹 앵커·UTF-16 위치 계산을 복제하지 않습니다. batch 결과는 입력 순서이며 그림별 정책 오류를 failure로 유지하고, OutOfMemory는 전체 batch 오류로 반환합니다. 구역 오류는 시작 전에 거부합니다. 결과 배열은 caller 소유이며 임시 view는 반환 전에 해제합니다. 다음 편집 이후 재사용하는 영구 캐시를 만들지 않습니다.

## 현재 검증과 미연결 경계

`zig test src/picture_owner_batch_regression_test.zig -O ReleaseSafe --test-filter 'picture owner batch'`는2/2 exit0입니다. 실제 sample-5017-pics의 모든 그림에서 기존 단일 조회와 batch의 owner/오류가 같고 원문 저장 byte-exact를 확인했습니다. 작은 합성 그림의 전체 할당 실패 sweep·범위 밖 요청과 정상/중복 요청의 분리·원문 불변도 검사했습니다. 정규 root에 두 회귀를 등록했고 build.zig/src 전체 fmt 검사도 exit0입니다.

`src/picture_owner_batch_benchmark.zig`는 대형 형광펜 원본의 모든 그림을 기존 단일/일괄로 조회해 결과·저장 바이트를 비교하고 시간을 출력합니다. 현재 실행 중이며 최종 통과나 속도 개선을 확정하지 않습니다. 이 검사는 native std.testing allocator를 사용하므로 Worker/WASM 시간과 직접 비교하지 않습니다.

일괄 WASM ABI·JS 응답 검증·UI 부착은 아직 연결하지 않았습니다. 현재 제품과 Worker는 기존 그림별 조회를 사용하며 UI 성능 개선 완료를 주장하지 않습니다. 코드 커밋과 제품 승격은 이 연결·실측 및 최신 전체 gate가 남아 있습니다.
