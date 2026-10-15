# 도형 텍스트 배치 실패 주입의 자원 경계

## 재현과 변경

선 테스트 수리 뒤 전체 native 바이너리 `5a369ed38dde0d2db751cb0a14b71a05f486a67685343909c23119a4f165d0c7`는3,923선언 중840개 완료 후 index840 `HWPX drawing snapshot batch allocation failures preserve source`에서 관측 physical footprint1,137,657,008바이트로1024MiB 한도를 넘어exit1·incomplete로 끝났습니다. 앞선840개 fail/log/leak0을 전체 통과로 계산하지 않습니다. 로그는 `/tmp/hwpjs-note-geometry-publication.Wkoeip/empty-formula-line-fixed-native-audit.jsonl`입니다.

`src/hwpx/drawing_text_snapshots.zig`의 제품 read는 변경하지 않고 해당 테스트의 `std.testing.checkAllAllocationFailures` 호출1곳만 기존 `testing/allocation_failures.check`로 연결했습니다. 공통 wrapper는 표준 실패 주입의 모든 인덱스를 그대로 순회하고 safety와 명시적 누수 검사를 유지하며 할당별 stack trace 저장을 제외합니다. 실제 shapecontainer-2의2개 스냅샷·각 단일 조회와 전체 구조 동치·실패 후 원본 저장 bytes 동일 단언과 바깥 fixture allocator는 유지합니다. 제품 성능이나 메모리 누수 해결 주장으로 바꾸지 않습니다.

## 집중 검증

수식 격리 tree의 집중 바이너리 `77393d69041b57d636173a35c0b78dace238f8ad141ae3a605b023c9c75b8855`는 같은1024MiB 관측 기준에서 root 포함2/2·fail/skip/log/leak0·exit0, peak29,966,696바이트입니다. 로그는 `/tmp/hwpjs-note-geometry-publication.Wkoeip/drawing-snapshot-batch-checked-native.jsonl`입니다. 현재 main에 이1줄만 적용한 전용 소스 검증은 별도 진행 중입니다. 이 집중 결과로 앞선 전체 감사 중단을 통과로 읽지 않습니다.

후속 main `a340a4a2` 전용 사본도 추적 src/build2,497파일 중 drawing_text_snapshots1파일만 다른 것을 blob hash로 확인했습니다. 집중 바이너리 `0802ae3ae66698cd05b3aa93cc2115fffc9038497af96bd9079240b036e9c6dd`는 같은한도에서 root 포함2/2·fail/skip/log/leak0·exit0·peak30,720,360바이트입니다. ReleaseSafe 제품 빌드5/5·exit0과 fmt/diff check도 확인했습니다. 로그는 `/tmp/hwpjs-line-snapshot-publication.nw8dHT/drawing-main-audit.jsonl`입니다. 게시 범위는 테스트 호출1줄과 기록/상위 링크3파일이며 수식 기능·기본 WASM 승격·전체 native gate는 포함하지 않습니다.
