# 표 생성 데모 산출물 승격

## 현재 기본 — 원본 필드 라벨 동시 편집

2026-10-11 게시7d454b83의 깨끗한 ReleaseSafe 후보6a25125e797c7f2501476ba5ddb3a1e45700be6707bf6b6a14daec0849f31faa를 기본/외부 WASM으로 반영했습니다. 직전fbe9fc14는 `/tmp/hwpjs-field-label-backup.9q2rHe/hwpjs.wasm`으로 백업·cmp 확인 후 교체했습니다. 서버/Tailscale 설정과 다른 세션은 변경하지 않았습니다.

외부 WASM 다운로드 해시가 새 기본과 일치하고, created-table-content.mjs도 검증 소스와 동일한7cd6ba95d3c92b941aa38811221001a156723ceb45c43890f6136152c6b4a73b입니다. 반영 후 기본 공개 field-label/field-exterior/plain4/4·exit0(1473.286ms)을 확인했습니다. 깨끗한 후보 native4/4·집중18/18·HWP5-editor312/312·HWPX-text34/34·문서당 한 host44/44, 실제 Chromium 라벨 입력/다운로드/재열기와 실제 다운로드의 독립 전체 XML/ZIP 대조는 [라벨 거래](hwpx-created-table-field-label.md)가 소유합니다.

새로고침 후 문서를 다시 열면 생성 표와 원본 flat 필드 라벨을 함께 편집합니다. 구조 편집된 필드/수식·생성 셀 서식/구조·정확한 inline/쪽 배치·실제 IME·HWP5 표 생성·전체 parser/editor 목표는 남아 있습니다. 외부 해시 확인을 전수 외부 GUI 검증으로 해석하지 않습니다.

## 이전 fbe9fc14 — 본문·개체·필드 외부·수식 거래

2026-10-11 깨끗한 코어4cf585b2와 게시된 검사기 의존성c92440b2의 ReleaseSafe 후보를 기본 `zig-out/bin/hwpjs.wasm`으로 반영했습니다. SHA256은 `fbe9fc14c3eaa373379e1512d83ba36ab4cbbdc2d21f560744fef5e61628d242`입니다. 기존a87ee487은 `/tmp/hwpjs-field-host-backup.6qVeSy/hwpjs.wasm`으로 백업·cmp 확인한 뒤 교체했습니다. 서버/Tailscale 설정이나 다른 세션은 변경하지 않았습니다.

외부 WASM 다운로드 해시가 새 기본과 일치하고, 외부 reader-worker.mjs도 검증 소스와 같은 `18bbd041eecc42b7442e9f6fe0d5a298921bdd9c1b878f24316189d50595d79b`입니다. 반영 후 기본 경로의 host/field exterior/formula 공개 회귀3/3·exit0(2091.865084ms)을 확인했습니다. 깨끗한 후보의 native6/6·집중20/20·HWP5-editor312/312·HWPX-text34/34·문서당 한 host44/44와 실제 Chromium 생성/입력/다운로드/재열기 근거는 [host 거래](hwpx-created-table-host-splice.md)가 소유합니다. 외부 GUI 전수 확인이나 실제 IME·한글 조판 동치를 뜻하지 않습니다.

새로고침 후 문서를 다시 열면 생성 표와 일반/원본 개체 포함 본문 및 필드 외부의 범위 입력을 함께 사용합니다. 수식 참조 셀에 표를 넣어 재계산할 수 없는 경우는 저장 전에 원자적으로 거부합니다. 구조 편집된 수식/anchored 경로·필드 라벨과 생성 표의 동시 변경·정확한 inline/쪽 배치·생성 셀 서식/구조·HWP5 표 생성·전체 parser/editor 목표는 남아 있습니다.

## 이전 a87ee487 반영 이력

검증한 게시5610e494 source의 ReleaseSafe WASM `a87ee487658b6ad9086f865360c22f24d1b93a574c7706ed6271366392e40c18`을2026-10-11 기본 `zig-out/bin/hwpjs.wasm`으로 반영했습니다. 게시92434584까지 src/js/web/build 차이가 없는 것도 확인했습니다. 후속 변경은 테스트/oracle/문서입니다.

이전 기본 SHA256은67dc85ca4dfadda3e3f2515951f5f9ca92189d5f81b058a61323036ba8d49dda이며 `/tmp/hwpjs-table-ui-backup.QNwSlh/hwpjs.wasm`으로 복사하고 cmp로 확인한 후 교체했습니다. 기존 서버/다른 실험 서버를 종료하거나 재시작하지 않았습니다.

외부 `https://macstudio.tailed42f2.ts.net:10000/zig-out/bin/hwpjs.wasm`의 다운로드 해시는 새 기본과 일치합니다. actual Chromium 검증은 같은 source/artifact의 별도 loopback 서버에서 했으며 HTTP hash 확인을 외부 GUI 재검증으로 확대하지 않습니다. 반영 후 기본 경로 생성/Worker2파일8/8·exit0(2235.931167ms)도 통과했습니다.

HWPX 파일을 열고 편집 시작 후 원본 텍스트에 단일 커서를 두면 삽입→표 삽입 설정을 사용할 수 있습니다. 생성 후 첫 셀로 포커스를 옮기며 입력/저장/history를 지원합니다. 배치는 block prototype입니다. 정확한 inline/쪽 배치·host 재배치·생성 셀 서식/구조·HWP5 생성 및 전체 parser/editor 목표는 남아 있습니다.
