# 기본 WASM 픽스쳐 편집 재검증

2026-10-10 `node tools/hwp5-edit-corpus-audit.mjs --history`는 기본 WASM SHA256 `7e70bbc74b7665553cd4f7e1b6a90aeb81a2e14c6c705e332d0ddac495e645e8`으로 Git 추적101입력을 검사했고 exit0입니다. 로그는 `/tmp/hwpjs-promoted-hwp5-edit-20261010.json`입니다.

HWP5는53파일의 모든 문단 prefix 입력·저장 텍스트/비대상 stream·재열기·이력이 검증됐습니다. chart.hwp1파일은 숫자 셀48문단에 비숫자 prefix를 공급한 `InvalidFormulaNumber` 거부로 부분 지원 상태입니다. 전체2090시도 중2042편집/이력 성공이고 거부48입니다. 이 거부를 파서 오류나 모든 숫자 입력 미지원으로 해석하지 않습니다. 숫자 값/정확 수식 결과는 별도 집중 검사의 범위입니다.

비암호 HWPX45파일은 이 도구에서 텍스트 읽기만 검사하며 편집은 별도 조사 상태로 기록합니다. 암호 HWP5/HWPX각1파일은 일반 reader에서 명시적으로 거부됐습니다. 암호 API의 실제 복호화·편집 검사는 [현재 데모 산출물](current-preview-artifact.md)의 별도 근거를 따릅니다. 중복 경로 사본은 독립 기능 수로 합산하지 않습니다.

`node tools/hwpx-edit-corpus-audit.mjs --history`는 같은 기본 산출물로 exit0입니다. `/tmp/hwpjs-promoted-hwpx-edit-20261010.jsonl`의 최종 집계는46파일·암호1·1444문단·1231편집/이력 복원입니다. 거부는 UnsupportedParagraphControl146·InvalidFormulaNumber48·ProtectedFieldRange19이며 거부 이후 기존 redo 보존189회를 확인했습니다. 일반/필드 외부 적격성·저장 projection·이력 검사이며 독립 전체 XML와 실제 브라우저는 별도입니다.

`node tools/hwpx-specialized-input-audit.mjs --wasm=/Users/yoonhb/Documents/workspace/hwpjs/zig-out/bin/hwpjs.wasm`도 exit0입니다. 로그 `/tmp/hwpjs-promoted-hwpx-specialized-20261010.jsonl`은46파일·암호1·일반 입력 경로 밖165시도 중152편집/저장 재열기/undo/redo와152독립 XML/ZIP 대조(필드6)를 기록합니다. Python 일반/`-O`로 검사했습니다. 나머지13은 chart 계산 결과의 직접 입력 거부입니다. 두 경로를 합친1383문단의 비숫자 prefix 검증을 전체 명령/조판 완료로 승격하지 않습니다. 남은48숫자 셀은 별도 숫자 값 입력 검사의 범위입니다.

필드 독립 검사기의 self-test도 일반/`-O` 양쪽에서 exit0입니다. UTF16 삽입/치환/삭제·잘못된 위치/길이·원문 무변경·dirty/서식/텍스트/비대상 ZIP 변조 거부를 확인했습니다. 실패/시간 초과를 데이터 불일치로 가장해 성공 처리하지 않습니다. 현재 Worker의 전체 HWPX 경로 검사는 별도 프로세스로 실행 중이며 종료 전에 완료로 집계하지 않습니다.

감사 도구의 파일 선택·CLI와 prefix route 검사는4파일8/8·skip0·exit0입니다. Git의 NUL 경로 목록을 사용하고 demo 경로를 빠뜨리지 않으며, 실제 입력 위치를 다른 편집 가능한 위치로 옮기지 않습니다. 누락·중복 옵션을 실행 전 거부합니다. 구조적 거부와 field label 실패를 숨기지 않습니다.
