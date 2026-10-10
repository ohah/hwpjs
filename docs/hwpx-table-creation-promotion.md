# 표 생성 데모 산출물 승격

검증한 게시5610e494 source의 ReleaseSafe WASM `a87ee487658b6ad9086f865360c22f24d1b93a574c7706ed6271366392e40c18`을2026-10-11 기본 `zig-out/bin/hwpjs.wasm`으로 반영했습니다. 게시92434584까지 src/js/web/build 차이가 없는 것도 확인했습니다. 후속 변경은 테스트/oracle/문서입니다.

이전 기본 SHA256은67dc85ca4dfadda3e3f2515951f5f9ca92189d5f81b058a61323036ba8d49dda이며 `/tmp/hwpjs-table-ui-backup.QNwSlh/hwpjs.wasm`으로 복사하고 cmp로 확인한 후 교체했습니다. 기존 서버/다른 실험 서버를 종료하거나 재시작하지 않았습니다.

외부 `https://macstudio.tailed42f2.ts.net:10000/zig-out/bin/hwpjs.wasm`의 다운로드 해시는 새 기본과 일치합니다. actual Chromium 검증은 같은 source/artifact의 별도 loopback 서버에서 했으며 HTTP hash 확인을 외부 GUI 재검증으로 확대하지 않습니다. 반영 후 기본 경로 생성/Worker2파일8/8·exit0(2235.931167ms)도 통과했습니다.

HWPX 파일을 열고 편집 시작 후 원본 텍스트에 단일 커서를 두면 삽입→표 삽입 설정을 사용할 수 있습니다. 생성 후 첫 셀로 포커스를 옮기며 입력/저장/history를 지원합니다. 배치는 block prototype입니다. 정확한 inline/쪽 배치·host 재배치·생성 셀 서식/구조·HWP5 생성 및 전체 parser/editor 목표는 남아 있습니다.
