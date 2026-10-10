# 사각형 소유 위치의 요청 내 일괄 조회

## 검증 기록

2026-10-11 root의 `rectangle host batch` 집중 ReleaseSafe 검사는 root 진입 검사와 새 테스트2/2·exit0입니다. 별도 prefix `/tmp/hwpjs-rectangle-host-batch-20261011`의 ReleaseSafe build·fmt·diff 검사도 exit0입니다. 해당 후보로 `drawing-text-bindings.test.mjs`와 `grouped-drawing-source.test.mjs`의 공개 회귀5/5·fail/skip0·exit0을 확인했습니다. 후보에는 다른 기존 작업 트리 변경이 있으므로 깨끗한 게시 소스 전체 gate·기본 제품 검증으로 합산하지 않습니다. 최신 전체 `zig build test`는 이 기록으로 증명하지 않습니다.

`rectangle_display_host.readMany`는 같은 구역의 요청 노드 순서대로 `Host` 배열을 반환합니다. 호출자가 배열을 해제합니다. 현재 문단 view는 한 번 구성하고 반환 전에 해제하며 세션·revision에 캐시하지 않습니다. 단일 조회와 일괄 조회는 같은 anchor 판정·소유 문단·보호 위치 해결 함수를 공유합니다.

중복 노드는 그대로 반환합니다. 빈 요청도 구역 인덱스를 검사합니다. 후반 노드 오류는 전체 결과 배열을 해제하고 오류를 반환하며 부분 결과를 공개하지 않습니다. 첫 노드의 anchor 검사는 현재 view 구성 전에 수행합니다. 배치의 전체 할당 시점은 단일 호출 반복과 다르므로 할당 실패 순서의 동일성은 주장하지 않습니다.

실제 `shapecontainer-2.hwpx` node94/122/94에서 단일 조회 대조·모든 할당 실패·`앞😀` 삽입 후 anchor_unit3·후반 잘못된 노드·빈 요청·잘못된 구역을 검사합니다. 이 단계는 native 준비 경로이며 WASM ABI/Worker 일괄 연결·속도 개선 실측·제품 승격은 아직 없습니다. 기존 기본 산출물은 변경하지 않습니다.
