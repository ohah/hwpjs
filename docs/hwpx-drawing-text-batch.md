# 도형 텍스트의 요청 내 일괄 조회

## 후보 검증

최종 native root의 `drawing snapshot batch` 집중 ReleaseSafe 실행은2/2·exit0입니다. 단일 결과 대조를 기준 배열로 먼저 확정하고 배치 함수 자체의 모든 할당 실패를 검사해, 다른 단일 조회 함수의 실패점까지 중복 순회하지 않습니다. 검사 후 원문 저장 바이트 동일을 확인했습니다. 첫 공유 view 수정 이전의2/2 실행은 별도 이전 구현이며 최종 실행과 합산하지 않습니다. fmt/diff와 JS 구문 검사도 exit0입니다. 전체 native gate 완료는 아닙니다.

2026-10-11 별도 ReleaseSafe build exit0의 후보는 `/tmp/hwpjs-drawing-text-batch-20261011/bin/hwpjs.wasm`, SHA256 `f12bbbcc08662f1c6fa5cd33249a6064ad3e27c99081d886039a76e4b4f6dda3`입니다. 새 도형 배치와 사각형 배치 공개2파일4/4·fail/skip0·exit0(177.863375ms)입니다. Git 추적 HWPX46개 중45개·47구역·도형 텍스트26개에서 일괄/단일 전체 결과 및 원문 저장 바이트가 같았고 암호1파일은 EncryptedDocument로 별도 기록했습니다.

같은 후보의 행정업무 편람 section11 도형2개 getter 비교는 단일 합계78.25ms·배치39.85ms·결과 전체 동일입니다. 별도의 drawingTextBindings 호출 시간은 단일 합계에 포함하지 않았으며 배치 안의 바인딩 해결은 포함합니다. 동시 부하 일회성으로 전체 Worker/전수 성능으로 확대하지 않습니다. 후보는 기존 dirty 변경을 포함하며 기본 제품/깨끗한 게시 전체 검증으로 합산하지 않습니다.

`drawing_text_snapshots.read`는 한 구역의 현재 문단 view를 한 번 구성하고 바인딩과 사각형 소유 위치 해결에 공유합니다. 바인딩의 고유 drawing node를 정렬해 기존 단일 snapshot의 필드 판정으로 전체 배열을 생성합니다. 중복 바인딩은 snapshot 중복을 만들지 않습니다. 최대100000노드를 허용하며 부분 실패 시 임시 배열·색인·view를 해제합니다. 세션이나 revision 사이의 캐시는 없습니다.

`drawing_text_bindings.readCurrent`와 `rectangle_display_host.readCurrent`는 같은 section에서 얻은 view만 받는 내부 조합 함수입니다. 단일 조회도 같은 바인딩/소유 해결 규칙을 재사용합니다. `drawing_text_snapshot.readWithHost`는 같은 요청에서 해결된 host로 기존 도형 source와 text/caption을 조립합니다.

공개 `hwpx_edit_drawing_text_snapshots`와 JS `drawingTextSnapshots(section)`은 기존 단일 응답 검증기로 각 행을 검사하고 순서·중복을 거부합니다. Worker의 부착은 호출 안에서만 배열을 사용합니다. 이전 WASM 또는 배치 오류는 단일 조회로 돌아가 원래 도형별 진단을 유지합니다. 제한된 window도 전체 구역 배치를 조회하므로 항상 최적이라고 주장하지 않습니다.

실제 그룹·textbox의 분리 caption·다단 원본에서 단일/배치 전체 대조·무변경 저장·`앞😀` 앵커 이동·undo/잘못된 구역 조회/redo, JS 대역의 fresh 값 및 배치 거부 진단을 검사합니다. 새 native 할당 실패 검사도 root에 직접 등록했습니다. 깨끗한 게시 소스 전체 gate·제품 승격·GUI 전수·원본 조판은 아직 별도입니다.
