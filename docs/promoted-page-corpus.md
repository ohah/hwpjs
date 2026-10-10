# 기본 WASM의 전체 HWP5 페이지 감사

2026-10-10 `node tools/hwp5-page-layout-corpus-audit.mjs --distribution`는 기본 SHA256 `7e70bbc74b7665553cd4f7e1b6a90aeb81a2e14c6c705e332d0ddac495e645e8`으로 exit0입니다. Git 추적101문서 중 실제 CFB55파일을 모두 선택했습니다. 경로나 hwp 확장자만으로 선택하지 않아 .hwpx 이름의 CFB도 검사하고 demo 사본을 놓치지 않습니다. 원본 입력은 메모리/디스크 양쪽에서 hash 불변을 확인합니다.

로그 `/tmp/hwpjs-promoted-page-all-tracked-20261010.jsonl`의 집계는55열기·배포 문서 명시적 enable2·43배치·0부분·12미지원·0읽기 실패·55원본 불변입니다. 고정 grapheme8px 측정이므로 실제 글꼴/한글 조판 동치 증거는 아닙니다. Exit0은12미지원이 없다는 뜻이 아닙니다.

미지원은 IncompleteTableSources10(데모/예제의 중복 noori 사본 포함), UnsupportedHwp5SectionExtension1, UnsupportedHwp5SectionNumbering1입니다. 표 입력에는 미해석 bit25 및 noori의 다른 unknown bits가 있어 geometry 경로에서 거부됩니다. table-bug의 번호 경로는 flags0만 지원하는 검사에 걸리며, 바탕쪽의 별도 관측 profile에서 같은 flags를 허용한 사실을 번호 의미 지원으로 소급하지 않습니다. 구역 확장의 비영 값도 의미를 모른 채 버리지 않습니다.

기존 폴더 한정48파일 감사는43배치/5미지원이었으나 데모 사본7경로를 빠뜨렸습니다. 해당 결과를55파일로 확대하지 않습니다. 파일 선택2/2·skip0·exit0은 suffix 교차/ZIP/HWP3 제외·중복·누락 입력 실패와 실제 Git 전체 CFB 목록의 일치를 검사합니다. 새 감사는 그림/번호/표 등 미지원 의미를 해석하거나 지원 제한을 무조건 해제하는 수정이 아닙니다.
