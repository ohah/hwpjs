# 사각형 소유 위치의 요청 내 일괄 조회

## 공개 조회와 Worker 연결

`rectangle_rendering_sources.read`는 구역의 모든 사각형을 노드 순서로 선택하고 같은 요청의 현재 소유 문단 view를 공유해 source/owner 배열을 만듭니다. 출력은 새 `hwpx_edit_rectangle_rendering_sources` ABI와 JS `rectangleRenderingSources(section)`으로 전달하며 기존 단일 응답 검증을 재사용합니다. 최대100000노드·구역 검사·출력 해제 책임을 유지합니다.

Worker의 사각형 부착 단계는 이 배열을 해당 호출 안에서만 사용합니다. 이전 WASM에서 export가 없거나 일괄 조회가 거부되면 기존 단일 경로로 돌아가 개별 도형 오류와 성공 결과를 유지합니다. 텍스트 snapshot 자체의 반복 조회는 아직 그대로입니다. 새 WASM의 제품 승격·깨끗한 전체 게이트·실제 브라우저 전수는 별도입니다.

실제 그룹 픽스쳐에서 일괄/단일 결과 전체 대조·원문 저장·앵커 이동·undo/잘못된 구역 조회/redo와 중복 출력 거부, JS 부착 대역에서 요청 간 fresh 값·배치 거부 후 개별 오류 보존을 검사합니다. 최종 후보로 대형 행정업무 편람 section11 두 노드를 비교한 값은 단일 합계83.71ms·배치40.19ms·전체 결과 동일입니다. 동시 부하가 있는 일회성 측정이며 전체 Worker 처리 속도나 전체 도형 corpus 개선으로 확대하지 않습니다.

## 검증 기록

일괄 공개 경로의 최종 별도 ReleaseSafe 산출물은 `/tmp/hwpjs-rectangle-sources-batch-20261011/bin/hwpjs.wasm`, SHA256 `f66ce966f4338c90fbcd0163c727cfcb7973abd518f74610fbcf14a50f33a26b`입니다. 최종 build exit0 뒤 새 `rectangle-source-batch.test.mjs`와 기존 두 공개 파일을 다시 실행해7/7·fail/skip0·exit0(203.842833ms)을 확인했습니다. 이 후보도 기존 dirty 변경이 포함돼 있어 기본 제품으로 교체하지 않았습니다.

2026-10-11 root의 `rectangle host batch` 집중 ReleaseSafe 검사는 root 진입 검사와 새 테스트2/2·exit0입니다. 별도 prefix `/tmp/hwpjs-rectangle-host-batch-20261011`의 ReleaseSafe build·fmt·diff 검사도 exit0입니다. 해당 후보로 `drawing-text-bindings.test.mjs`와 `grouped-drawing-source.test.mjs`의 공개 회귀5/5·fail/skip0·exit0을 확인했습니다. 후보에는 다른 기존 작업 트리 변경이 있으므로 깨끗한 게시 소스 전체 gate·기본 제품 검증으로 합산하지 않습니다. 최신 전체 `zig build test`는 이 기록으로 증명하지 않습니다.

`rectangle_display_host.readMany`는 같은 구역의 요청 노드 순서대로 `Host` 배열을 반환합니다. 호출자가 배열을 해제합니다. 현재 문단 view는 한 번 구성하고 반환 전에 해제하며 세션·revision에 캐시하지 않습니다. 단일 조회와 일괄 조회는 같은 anchor 판정·소유 문단·보호 위치 해결 함수를 공유합니다.

중복 노드는 그대로 반환합니다. 빈 요청도 구역 인덱스를 검사합니다. 후반 노드 오류는 전체 결과 배열을 해제하고 오류를 반환하며 부분 결과를 공개하지 않습니다. 첫 노드의 anchor 검사는 현재 view 구성 전에 수행합니다. 배치의 전체 할당 시점은 단일 호출 반복과 다르므로 할당 실패 순서의 동일성은 주장하지 않습니다.

실제 `shapecontainer-2.hwpx` node94/122/94에서 단일 조회 대조·모든 할당 실패·`앞😀` 삽입 후 anchor_unit3·후반 잘못된 노드·빈 요청·잘못된 구역을 검사합니다. 기존 기본 산출물은 변경하지 않습니다.
