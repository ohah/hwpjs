# 기본 WASM 픽스쳐 편집 재검증

2026-10-10 `node tools/hwp5-edit-corpus-audit.mjs --history`는 기본 WASM SHA256 `7e70bbc74b7665553cd4f7e1b6a90aeb81a2e14c6c705e332d0ddac495e645e8`으로 Git 추적101입력을 검사했고 exit0입니다. 로그는 `/tmp/hwpjs-promoted-hwp5-edit-20261010.json`입니다.

HWP5는53파일의 모든 문단 prefix 입력·저장 텍스트/비대상 stream·재열기·이력이 검증됐습니다. chart.hwp1파일은 숫자 셀48문단에 비숫자 prefix를 공급한 `InvalidFormulaNumber` 거부로 부분 지원 상태입니다. 전체2090시도 중2042편집/이력 성공이고 거부48입니다. 이 거부를 파서 오류나 모든 숫자 입력 미지원으로 해석하지 않습니다. 숫자 값/정확 수식 결과는 별도 집중 검사의 범위입니다.

비암호 HWPX45파일은 이 도구에서 텍스트 읽기만 검사하며 편집은 별도 조사 상태로 기록합니다. 암호 HWP5/HWPX각1파일은 일반 reader에서 명시적으로 거부됐습니다. 암호 API의 실제 복호화·편집 검사는 [현재 데모 산출물](current-preview-artifact.md)의 별도 근거를 따릅니다. 중복 경로 사본은 독립 기능 수로 합산하지 않습니다.

`node tools/hwpx-edit-corpus-audit.mjs --history`의 현재 기본 산출물 실행은 `/tmp/hwpjs-promoted-hwpx-edit-20261010.jsonl`에 기록 중이며 종료 전 최종 통과 수로 집계하지 않습니다. 원본 파괴 없이 메모리에서 편집하며 일반/필드 외부 적격성·저장 projection·이력/거부 이후 redo를 검사합니다. 독립 전체 XML와 실제 브라우저는 별도입니다.

감사 도구의 파일 선택·CLI와 prefix route 검사는4파일8/8·skip0·exit0입니다. Git의 NUL 경로 목록을 사용하고 demo 경로를 빠뜨리지 않으며, 실제 입력 위치를 다른 편집 가능한 위치로 옮기지 않습니다. 누락·중복 옵션을 실행 전 거부합니다. 구조적 거부와 field label 실패를 숨기지 않습니다.
