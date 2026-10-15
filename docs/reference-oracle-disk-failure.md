# 참조 편집 감사의 디스크 부족 재검증

## 원인과 범위

오래된 고정 후보 `77b60b8237f20d78873a743315565776b36f9efa92bae0acc8197450fc0d25fa`의 전수 로그 `/tmp/hwpjs-normalized-reference-edit.Dld3zF`에서 `3-11월_실전_통합_2024-구분선위0미주사이20구분선아래2.hwpx`의 specialized 감사가 중단됐습니다. 원인은 section0/문단870의 독립 XML 검사 입력을 임시 파일에 쓰던 `writeFileSync`의 ENOSPC입니다. 이 로그를 파서/저장 불일치로 분류하지 않으며, 반대로 해당 문서의 전수 통과로 바꾸지도 않습니다.

## 2026-10-15 집중 재검증

`tests/hwpx/interrupted-anchor-oracle.test.mjs`는 실제 원본1203문단 중 당시 문단870을 같은 prefix 경로로 편집합니다. 고정 후보 SHA256 `26f6e9f820fc6d1d24bf4659921d0b080140849db00d1e48f1fdff7c7d2d47b5`에서1/1·fail/skip0·exit0(2994.225ms)을 확인했습니다. Python 일반/-O의 전체 XML/비대상 ZIP 비교, 잘못된 prefix의 complete XML mismatch 거부, reader 텍스트, undo 원문 byte-exact·revision 복원, redo 저장본 byte-exact, 별도 editor 재열기와 원본 파일 불변을 검사합니다. 인프라 오류·시그널 종료를 부정 대조 통과로 인정하지 않습니다.

첫 실행은 검증 코드가 `close()`한 editor를 다시 열어 EditorClosed로 실패했습니다. 재열기를 별도 editor 인스턴스에서 수행하도록 고친 뒤 위 결과를 얻었습니다. 제품 파서 수정으로 기록하지 않습니다.

분리 게시 JS 디렉터리에서도 같은 고정 WASM으로1/1·fail/skip0·exit0(2880.764583ms)을 확인했습니다. 원본 reference 파일은 공유 읽기 경로로 제공하며 미게시 제품 JS에 의존한 통과로 기록하지 않습니다.

이는 중단된 한 지점의 후보 재검증이며 당시 전수 실행을 재개/대체하거나1203문단 전부·모든 편집 명령·브라우저/조판 완료를 입증하지 않습니다. 기본 WASM을 승격하지 않았고 새 브라우저/디바이스도 실행하지 않았습니다.
