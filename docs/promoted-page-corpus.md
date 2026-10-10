# 기본 WASM의 전체 HWP5 페이지 감사

## 2026-10-11 최신 기본 산출물과 조회 실패 보호

기본 b8e5409af336c039c78b19e94b93eba880a2bd19996813feb321105e3b550899에서 전체 CFB55파일 감사가 exit0으로 끝났습니다. `/tmp/hwpjs-structural-formula-page-audit-20261011.jsonl`의 결과는55열기·배포 enable2·43배치·0부분·12미지원·0읽기 실패·55원본 불변이며 미지원 사유는 이전과 같습니다. 고정8px 측정이지 한글 조판 동치가 아닙니다.

번호 source의 성공 제어 목록이 비어 있으면 `pageControlSourceErrors`를 무시하던 조건을 합성 반례로 재현했습니다(예외 누락으로 신규 검사 실패). 이제 성공 제어 개수와 무관하게 조회 오류가 있으면 IncompleteHwp5PageNumberControls를 반환합니다. 오류 없는 빈 목록과 명시적 시작 번호·객체 앵커는 기존대로 유지합니다. 번호/구역 확장2파일6/6·skip0·exit0이며 이는 실파일12미지원 해결이나 번호 의미 확대가 아닙니다.

호출 경로 검증에서는 페이지 배치 진입점이 header/footer와 성공한 제어 목록이 없으면 번호 함수를 호출하지 않는 별도 조건을 확인했습니다. `layoutHwp5PageContent`도 조회 오류를 먼저 거부하게 연결했고, 기본 옵션/수동 pageNumbers 양쪽에서 원인을 IncompleteHwp5PageNumberControls로 보존하는 반례를 추가했습니다. 수정 전에는 해당 합성 입력에서 MissingHwp5PageSources로 원인이 덮였으며 정상 배치 성공을 재현한 사례는 아닙니다. 번호/실제 제어 API/renderer3파일8/8·skip0·exit0, 수정 후55파일 페이지 감사도 exit0·43배치/12미지원/입력55불변입니다(`/tmp/hwpjs-page-control-entry-fix-20261011.jsonl`).

## TABLE 미해석 비트의 재현

현재 기본 산출물에서 `table-flags-pair.test.mjs`와 `table-policy-root-cause.test.mjs`가6/6·skip0·exit0입니다. 게시 예정 helper6파일을 선택한 tree `e21d6a86d1a4d3c9da229ee3cab716db7644d71b`의 별도 export에서도 동일6/6을 확인했습니다. 로컬 미게시 helper에만 의존하는 결과로 남기지 않습니다.

공식 명세의 표75/76은 low0..1 쪽 나눔·bit2 반복 제목을 설명합니다. RHWP의 `src/parser/control.rs::parse_table_record`는 low2/bit2 의미와 raw attr를 보존하고, HWPX serializer는 bit3의 noAdjust를 연결합니다. 조사한 이 TABLE 경로에서는 bit25의 의미를 확인하지 못했습니다. 다른 CHAR_SHAPE의 bit25/use_font_space를 TABLE에 적용하지 않습니다.

짝 table-bug의17표에서 bit25 표4개가 NONE/CELL 모두에 분포하고 noAdjust 표2개에는 bit25가 없습니다. 이 두 가설을 반증했습니다. 실제 TABLE453의 원값/꼬리0은 독립 CFB 레코드와 같고 셀 효과 편집·전체 DocInfo/구역/비대상 stream·undo/redo를 대조했습니다. distribution의 다섯 표 대표 셀에서도 독립 복호화 구역·저장/재열기·원값 보존과 이력이 통과했습니다. unknown-bit 표시 gate만 반례의 private 복사에서 제거했으며 원본/제품 정책은 변경하지 않았습니다. 이것은 CFB/셀 편집 오류가 아니라 미해석 배치 정책임을 확인하는 검사이지 미지원 표의 한글 조판 의미 구현이 아닙니다.

2026-10-10 `node tools/hwp5-page-layout-corpus-audit.mjs --distribution`는 기본 SHA256 `7e70bbc74b7665553cd4f7e1b6a90aeb81a2e14c6c705e332d0ddac495e645e8`으로 exit0입니다. Git 추적101문서 중 실제 CFB55파일을 모두 선택했습니다. 경로나 hwp 확장자만으로 선택하지 않아 .hwpx 이름의 CFB도 검사하고 demo 사본을 놓치지 않습니다. 원본 입력은 메모리/디스크 양쪽에서 hash 불변을 확인합니다.

로그 `/tmp/hwpjs-promoted-page-all-tracked-20261010.jsonl`의 집계는55열기·배포 문서 명시적 enable2·43배치·0부분·12미지원·0읽기 실패·55원본 불변입니다. 고정 grapheme8px 측정이므로 실제 글꼴/한글 조판 동치 증거는 아닙니다. Exit0은12미지원이 없다는 뜻이 아닙니다.

미지원은 IncompleteTableSources10(데모/예제의 중복 noori 사본 포함), UnsupportedHwp5SectionExtension1, UnsupportedHwp5SectionNumbering1입니다. 표 입력에는 미해석 bit25 및 noori의 다른 unknown bits가 있어 geometry 경로에서 거부됩니다. table-bug의 번호 경로는 flags0만 지원하는 검사에 걸리며, 바탕쪽의 별도 관측 profile에서 같은 flags를 허용한 사실을 번호 의미 지원으로 소급하지 않습니다. 구역 확장의 비영 값도 의미를 모른 채 버리지 않습니다.

기존 폴더 한정48파일 감사는43배치/5미지원이었으나 데모 사본7경로를 빠뜨렸습니다. 해당 결과를55파일로 확대하지 않습니다. 파일 선택2/2·skip0·exit0은 suffix 교차/ZIP/HWP3 제외·중복·누락 입력 실패와 실제 Git 전체 CFB 목록의 일치를 검사합니다. 새 감사는 그림/번호/표 등 미지원 의미를 해석하거나 지원 제한을 무조건 해제하는 수정이 아닙니다.
