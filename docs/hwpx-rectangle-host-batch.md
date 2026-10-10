# 사각형 소유 위치의 요청 내 일괄 조회

도형 텍스트 바인딩과 snapshot의 view 공유는 [도형 텍스트 일괄 조회](hwpx-drawing-text-batch.md)가 소유합니다.

## 공개 조회와 Worker 연결

2026-10-11 기본9ff325bd 산출물 반영 뒤 실제 외부 Chromium에서 `shapecontainer-2.hwpx`를 업로드·편집 시작·`목` 찾기로 도형 텍스트를 선택했습니다. 입력 자동화의 fill은 원문 삭제와 `목😀` 입력을 두 변경으로 발생시켰습니다. 첫 undo에서 빈 문자열로 돌아와 한 번 undo로 원문을 기대한 대기는 시간 초과했습니다. 두 번째 undo로 `목`, 두 번 redo로 빈 문자열→`목😀` 복원을 각각 조건 대기로 확인했습니다. 한 transaction 입력 검증으로 계수하지 않습니다. 초기 파일 준비 대기도 한 번 시간 초과했지만 같은 세션의 준비 상태를 다시 확인해 진행했으며 브라우저 오류 출력은 없었습니다. 검증 브라우저는 종료했습니다. 픽셀/그룹 변환 조판·다운로드 재열기·OS IME·전수 GUI 검증은 아닙니다.

`rectangle_rendering_sources.read`는 구역의 모든 사각형을 노드 순서로 선택하고 같은 요청의 현재 소유 문단 view를 공유해 source/owner 배열을 만듭니다. 출력은 새 `hwpx_edit_rectangle_rendering_sources` ABI와 JS `rectangleRenderingSources(section)`으로 전달하며 기존 단일 응답 검증을 재사용합니다. 최대100000노드·구역 검사·출력 해제 책임을 유지합니다.

Worker의 사각형 부착 단계는 이 배열을 해당 호출 안에서만 사용합니다. 이전 WASM에서 export가 없거나 일괄 조회가 거부되면 기존 단일 경로로 돌아가 개별 도형 오류와 성공 결과를 유지합니다. 텍스트 snapshot 자체의 반복 조회는 아직 그대로입니다. 새 WASM의 제품 승격·깨끗한 전체 게이트·실제 브라우저 전수는 별도입니다.

실제 그룹 픽스쳐에서 일괄/단일 결과 전체 대조·원문 저장·앵커 이동·undo/잘못된 구역 조회/redo와 중복 출력 거부, JS 부착 대역에서 요청 간 fresh 값·배치 거부 후 개별 오류 보존을 검사합니다. 최종 후보로 대형 행정업무 편람 section11 두 노드를 비교한 값은 단일 합계83.71ms·배치40.19ms·전체 결과 동일입니다. 동시 부하가 있는 일회성 측정이며 전체 Worker 처리 속도나 전체 도형 corpus 개선으로 확대하지 않습니다.

## 검증 기록

깨끗한6d4dac5a 산출물의 정규 gate는 종료코드0으로 완료했습니다. HWP5 312/312·HWPX 34/34·fail/skip0이며 각각4316.373791/47400.491459ms입니다. 아래 실행 시작 기록의 대기 상태는 이 종료 결과로 대체합니다. 제품 기본 WASM 승격은 [현재 데모 산출물](current-preview-artifact.md)을 따릅니다. 교체 후 후보 환경 변수 없는 기본 경로의 새 공개2회귀도2/2·fail/skip0·exit0(102.920042ms)입니다.

게시6d4dac5a의 깨끗한 archive `/tmp/hwpjs-main-rectangle-batch.MNVvFr`를 같은 커밋 Git index로 구성해 diff 없는 상태에서 ReleaseSafe build exit0을 확인했습니다. 산출물 SHA256은 `9ff325bdc48514d346c5f928c6294e710a80a8a5f690831ccae10b2f0cc5646e`입니다. 이 소스의 공개3파일 선택은 실제2테스트·2/2·fail/skip0·exit0(468.387375ms)입니다. 앞선 dirty 트리의7개와 합산하지 않습니다.

같은 산출물로 Git 추적 HWPX46개 중45개·47구역·사각형30개를 일괄/단일 전체 결과 및 원문 저장 바이트로 대조해 일치했습니다. `password-12345.hwpx`의 EncryptedDocument1개는 성공으로 세지 않습니다. 최초 임시 검사 스크립트의 잘못된 sectionCount 호출 및 close 후 재사용은 검사 도구 오류·exit1이었으며 제품 거부나 통과로 계수하지 않았습니다. open 반환의 sectionCount와 파일별 새 editor로 수정한 재실행은 exit0입니다. 전체 필드 의미/편집/브라우저 완료가 아닌 조회·무변경 저장 범위입니다. 정규 두 gate는 별도 로그 `/tmp/hwpjs-main-rectangle-batch-regular-20261011.log`로 실행하며 아직 종료 결과를 확인하기 전입니다.

일괄 공개 경로의 최종 별도 ReleaseSafe 산출물은 `/tmp/hwpjs-rectangle-sources-batch-20261011/bin/hwpjs.wasm`, SHA256 `f66ce966f4338c90fbcd0163c727cfcb7973abd518f74610fbcf14a50f33a26b`입니다. 최종 build exit0 뒤 새 `rectangle-source-batch.test.mjs`와 기존 두 공개 파일을 다시 실행해7/7·fail/skip0·exit0(203.842833ms)을 확인했습니다. 이 후보도 기존 dirty 변경이 포함돼 있어 기본 제품으로 교체하지 않았습니다.

2026-10-11 root의 `rectangle host batch` 집중 ReleaseSafe 검사는 root 진입 검사와 새 테스트2/2·exit0입니다. 별도 prefix `/tmp/hwpjs-rectangle-host-batch-20261011`의 ReleaseSafe build·fmt·diff 검사도 exit0입니다. 해당 후보로 `drawing-text-bindings.test.mjs`와 `grouped-drawing-source.test.mjs`의 공개 회귀5/5·fail/skip0·exit0을 확인했습니다. 후보에는 다른 기존 작업 트리 변경이 있으므로 깨끗한 게시 소스 전체 gate·기본 제품 검증으로 합산하지 않습니다. 최신 전체 `zig build test`는 이 기록으로 증명하지 않습니다.

`rectangle_display_host.readMany`는 같은 구역의 요청 노드 순서대로 `Host` 배열을 반환합니다. 호출자가 배열을 해제합니다. 현재 문단 view는 한 번 구성하고 반환 전에 해제하며 세션·revision에 캐시하지 않습니다. 단일 조회와 일괄 조회는 같은 anchor 판정·소유 문단·보호 위치 해결 함수를 공유합니다.

중복 노드는 그대로 반환합니다. 빈 요청도 구역 인덱스를 검사합니다. 후반 노드 오류는 전체 결과 배열을 해제하고 오류를 반환하며 부분 결과를 공개하지 않습니다. 첫 노드의 anchor 검사는 현재 view 구성 전에 수행합니다. 배치의 전체 할당 시점은 단일 호출 반복과 다르므로 할당 실패 순서의 동일성은 주장하지 않습니다.

실제 `shapecontainer-2.hwpx` node94/122/94에서 단일 조회 대조·모든 할당 실패·`앞😀` 삽입 후 anchor_unit3·후반 잘못된 노드·빈 요청·잘못된 구역을 검사합니다. 초기 native 준비 단계에서는 기본 산출물을 변경하지 않았습니다.
