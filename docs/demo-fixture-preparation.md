# 데모 픽스쳐 준비

`web/preview/fixture-catalog.mjs`의 명시적 목록만 공개 자산으로 복사합니다. 현재 HWP/HWPX 열 개는 레거시 테스트 픽스쳐이며, 행정업무운영 편람 한 개는 별도로 준비한 `reference/rhwp/samples` 원본을 요구합니다. 원본이 없으면 준비는 실패합니다. 목록에 없는 저장소 파일은 공개하지 않습니다.

```sh
node tools/prepare-demo-fixtures.mjs
node --test tests/hwpx/fixture-plan.test.mjs
```

준비 명령은 출력 폴더를 만든 뒤 모든 원본과 출력 경로를 먼저 검사합니다. 원본 누락·경로 이탈·중복 ID·64 MiB 초과·출력 심볼릭 링크/하드 링크/디렉터리를 발견하면 기존 공개 파일 내용을 수정하지 않습니다. 검사가 완료되면 파일별 복사를 수행합니다. 쓰기 도중 디스크/권한 실패까지 전체 디렉터리 단위로 원자적 배포하는 기능은 아닙니다.

공개 자산 URL은 `/web/preview/demo-fixtures/<id>`입니다. 생성된 파일은 소스가 아니며 원본 문서 내용을 바꾸지 않습니다. 파일 준비 성공은 파서·편집·원본 조판 완료 증거와 구분합니다.
