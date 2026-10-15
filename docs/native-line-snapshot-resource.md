# 실제 장식 선 스냅샷 테스트 자원 경계

## 재현과 변경

격리 수식 후보 전체 ReleaseSafe native 바이너리 `577efca9ed230f687f6669c0cdc977a89e3cb82d6449d506578b4aecfb8b231b`의3,923선언 순차 감사는655개 완료 후 index655 `line geometry snapshot reads all decorated lines without changing paint policy`에서 중단됐습니다. 물리 footprint 관측 peak1,109,902,488바이트가1024MiB 기준을 넘었으며 exit1·incomplete입니다. 앞선655개는 fail/log/leak0이지만 전체 성공으로 읽지 않습니다. 로그는 `/tmp/hwpjs-note-geometry-publication.Wkoeip/empty-formula-ssot-native-audit.jsonl`입니다.

실제 `2025 행정업무운영 편람(최종).hwpx`를 읽는 `src/hwpx/line_display_snapshot.zig` 테스트의 바깥 allocator만 `checked_allocator.run` 범위로 분리했습니다. 공통 wrapper는 safety와 명시적 해제 후 누수 검사를 유지하고 할당별 stack trace 저장을 제외합니다. 제품 nodes/read/readGeometry는 바꾸지 않았습니다. 실제 선18개, geometry node/paragraph, full/geometry 끝점 동치와 장식 거부17개 단언도 그대로입니다. 제품 메모리 누수 해결이나 제품 성능비로 주장하지 않습니다.

## 집중 실측

수식 격리 tree에 이 테스트 수리만 더한 집중 바이너리 `f8d3d8fa13b7768d464027df4d538a0d29a72222e3e9d7307732c2bc619b7d62`는 같은1024MiB 관측 한도에서 root 포함2/2·fail/skip/log/leak0·exit0, peak96,862,664바이트입니다. 로그는 `/tmp/hwpjs-note-geometry-publication.Wkoeip/line-snapshot-checked-native.jsonl`입니다. ReleaseSafe 제품 빌드도5/5·exit0입니다. 기본 제품 WASM은 유지했습니다.

현재 main에 이 파일만 적용한 독립 사본 검증은 별도 진행 중입니다. 이 집중 성공이 앞선 전체 native 중단을 통과로 바꾸지 않으며, 수정 뒤 전체 inventory 재컴파일·전수 실행 및 단일 장기 프로세스 gate는 남습니다.

후속 main `e71d8e98` 전용 사본 `/tmp/hwpjs-line-snapshot-publication.nw8dHT/tree`도 추적 src/build2,497파일 중 해당 테스트 파일만 다른 것을 blob hash로 확인했습니다. 그 사본의 집중 바이너리 `61ac3c685c13a371702206778f2971f6bdc81bccfb948c8e4602520c7e77993a`는 root 포함2/2·fail/skip/log/leak0·exit0, 같은 한도 peak96,862,664바이트이고 ReleaseSafe 제품 빌드5/5·exit0입니다. 로그는 위 전용 디렉터리의 `native-main-audit.jsonl`입니다. fmt/diff check도 통과했습니다. 게시 범위는 테스트5줄과 이 기록/상위 링크3파일뿐이며 전체 native 재검증·다른 수식 기능·기본 WASM 승격을 완료한 것으로 해석하지 않습니다.
