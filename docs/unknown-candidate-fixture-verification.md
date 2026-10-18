# unknownObj 후보의 추적 문서 편집 재검증

## 범위

후보 SHA256은 eaaa0d2007a2e02fce27335e6218379284108e756e285d4859cad28167d0fe5f입니다. `/tmp/hwpjs-unknown-anchor-probe.1MV5w4`의 동결 JS/도구와 별도 Git index로 추적101경로(HWP55/HWPX46)를 제공했습니다. 실제 보고서의101경로·중복 부재와 현재 Git 목록을 비교했고 동결/현재 작업 트리 입력 바이트도 모두 같았습니다. 기본/외부 WASM은 교체하지 않았습니다.

## HWP5 입력·이력

`unknown-tracked-hwp5-history.json/.stderr`는 exit0·stderr0입니다. HWP5의53파일은 모든 문단 prefix 입력, chart1파일은48개 비숫자 입력을 거부하는 부분 지원, 암호1파일은 기본 읽기 거부입니다. 열린2,090문단 중2,042곳에 실제 입력·독립 CFB 텍스트/비대상 stream 대조·저장 재열기·undo/redo와 조판 상태 복원을 확인했습니다. 거부48개는 모두 InvalidFormulaNumber이며 입력/이력 성공에 합산하지 않습니다. 이 도구의 HWPX45개 분류와 암호1개 거부는 HWPX 편집 성공이 아닙니다.

## 숫자 의존 셀

같은 후보의 `unknown-numeric-corpora.log/.stderr`는 두 파일4/4·fail/skip/cancel0·exit0·stderr0(23558.56ms)입니다. HWP5 chart의 독립 레코드 의존 목록48곳에서500/1000000 두 규모의 실제 숫자 변경·13계산 결과·전체 비대상 stream·이력·재열기를 검사했습니다. 일반 숫자 표시의 경계 기대값도 독립 검사했습니다. HWPX chart의 독립 XML 목록48곳은 유효 숫자 변경·SUM/AVG 결과/캐시·전체 XML/ZIP·undo/redo·재열기/재저장과 normal/-O 변조 거부를 검사했습니다. 서로 다른 포맷·반복 규모를 한 개의 문단 성공 수로 합산하지 않습니다.

## HWPX Worker

`unknown-tracked-hwpx-worker.log/.stderr`는1/1·fail/skip/cancel0·exit0·stderr0(552749.16875ms)입니다.46경로 중 암호 기본 거부1개를 구분하고1,444문단의 plain1278/anchor146/field7/수동 계산 결과13 분류를 확인했습니다.146앵커·7필드·13수동 결과는 각각 실제 입력·저장·undo/redo·사본 Worker 재로드/전체 표시 projection 대조·무변경 재저장 바이트 일치를 검사합니다. 수동 결과13개는 별도 독립 XML/ZIP normal/-O 검증도 수행했습니다. 일반1278은 이 테스트에서는 조회이며 실제 입력 증거로 합산하지 않습니다.

## HWPX 일반 본문과 독립 재열기

`/tmp/hwpjs-plain-reopen-current.N3jeCT/plain-reopen-retry.jsonl/.stderr`는 exit0·stderr0이며46경로·암호 기본 거부1·조회1444·일반1278·실제 입력1230·독립 재열기1230·비숫자 입력 거부48입니다. 각 성공은 전체 XML/ZIP 독립 oracle의 normal/-O 대조 뒤 별도 편집기 인스턴스로 저장본을 열어 해당 문단 전체 텍스트와 무변경 재저장 바이트를 확인하고, 원래 편집기의 undo/redo/undo를 검사합니다. 재열기로 원래 편집기의 이력을 초기화하지 않습니다. 숫자 거부 뒤 기존 redo도 유지되는지 검사합니다.

성공1230과 거부48 좌표는 각각 중복 없이 서로 겹치지 않고, 성공 행은 모두 reopened=true입니다. Git의46개 입력을 동결 디렉터리와 현재 작업 트리에서 직접 비교했고, 행에 기록된 원본 해시도 다시 확인했습니다. 일반 입력 대상이 없는 파일에는 plain-edited 행이 없으므로 결과 행의 파일 수를 전체46개와 혼동하지 않습니다. 도구 SHA256은43f5f7e16e2d964448f015f1d3e832ebd089d5f17171e53d2200240fe2ef64ca, 독립 oracle은f947fab274ec6a83822c0dc37c9ca03cb29d5470401ba87b5f7f968c895fa7c0이며 후보는 위 eaaa0d20…입니다.

첫 `plain-reopen-audit.jsonl`은739개 성공 행 뒤 exit1·완료 행 없음으로 끝났습니다. 당시 디스크 여유144MiB였으나 stderr가 없어 그 사실만으로 종료 원인을 확정하지 않습니다. 이 부분 결과를 재실행에 합산하지 않았습니다. 재열기가 없던 기존 `unknown-tracked-hwpx-plain.jsonl`의1230개 성공도 별도 증거로 보관합니다. CLI 입력 거부2/2와 보조 oracle·입력 목록·빈 run 회귀14/14를 확인했습니다. 보조 검사의 첫 실행은 동결 디렉터리에 Git 환경을 누락해 목록1개가 실패했으며, 올바른 GIT_DIR/GIT_WORK_TREE/독립 GIT_INDEX_FILE로 전체 재실행한14/14만 성공으로 기록합니다.

이 검사는 일반 문단 앞의 문자 삽입 범위이며 모든 편집 명령·실제 브라우저 입력·원본 조판 동치를 보장하지 않습니다. 숫자48곳의 유효 숫자 편집은 위 별도 숫자 corpus가 소유합니다.

## 기본 거부의 명시적 경로

참조 전체 reader의 같은5거부는 [응답 대조](unknown-reader-parity-current.md)를 따릅니다. 암호 제공과 저장 구역 읽기/명시적 사본 편집, 추적 암호 두 포맷의 편집 경로 네 파일은 동결 소스의 `unknown-refused-reader-paths-frozen.log`에서14/14·fail/skip/cancel0·exit0(8953.749791ms)입니다. 비밀번호 틀림·원본/복호화 buffer 불변·암호 복호화 후 HWPX418/HWP54282문단·구역 불일치3원본의 엄격 읽기 거부 유지·저장 구역 수/전체 문단·명시적 사본의 이력/재열기를 검사했습니다. 먼저 현재 작업 트리에서 실행한 별도14/14는 `unknown-refused-reader-paths-worktree.log`로 보관하며 동결 결과와 합산하지 않습니다.

구역이 없는 원본을 자동 복구하거나 빠진 내용을 생성한 검사가 아닙니다. 사본은 missingContentRecovered=false와 별도 이력 기준을 유지하며, 비밀번호 변환은 원본 보호 유지/재암호화 저장 지원이 아닙니다. 기본 읽기 거부를 소급 성공으로 바꾸지 않습니다.

각 감사는 별도 실행/판정이며 HWP5 성공 수를 HWPX·전체 GUI·원본 조판·모든 편집 명령 완료로 확대하지 않습니다. 실제 unknownObj 한 문단의 Chromium 증거는 [브라우저 검증](hwpx-unknown-object-browser.md)이 소유합니다.

## Zig 0.17 원본 작업 트리 후보 재검증

후보 `f4e0f396a3fea6e6354b364ff176e31d72ed00ec643fa566c4abbd8bc2f58d77`은 0.17 이관 후 원본 작업 트리의 미커밋 기능을 포함합니다. 공개 main만의 후보와 구분하며 데모 기본 WASM은 교체하지 않았습니다. JS/감사 도구를 `/tmp/hwpjs-zig017-current-fixtures.xouwd1`에 복사해 실행했고 입력은 기존 추적 파일을 읽었습니다.

- `hwp5-history.json/.stderr`: exit0·stderr0. 추적101경로를 현재 Git 목록과 대조했습니다. HWP5 53파일의 전체 문단 prefix 검증, chart 1파일 부분 지원, 암호 1파일 기본 거부입니다. 2,090시도 중2,042입력/이력/독립 CFB 텍스트·비대상 stream 검증이며 나머지48은 InvalidFormulaNumber입니다. HWPX의45개 별도 감사 분류와 암호1개 거부를 HWP5 편집 성공에 합산하지 않습니다.
- `hwpx-history.jsonl/.stderr`: exit0·stderr0. 46경로·암호1·1,444문단 중1,231입력/저장 재열기 projection/undo·redo·원본 복원을 확인했습니다. UnsupportedParagraphControl146·InvalidFormulaNumber48·ProtectedFieldRange19는 거부입니다. 거부 후 기존 redo 보존189회도 검사했습니다. 열린45개 입력의 해시를 실행 후 원본과 다시 대조했습니다.
- `hwpx-specialized.jsonl/.stderr`: exit0·stderr0. 같은46경로에서 전용 경로165시도 중152입력/독립 XML·ZIP/별도 편집기 재열기/이력 검증입니다. 이 중 필드 oracle6회이며 남은13거부는 chart의 UnsupportedFieldLabelRange입니다. 전용 경로 성공을 일반 입력 성공으로 바꾸거나 두 감사만으로 모든 명령/위치 지원을 주장하지 않습니다.

`numeric-manual.log/.stderr`는 HWP5 chart 숫자 입력, HWPX 숫자 입력, 수동 계산 결과 splice의 세 파일6/6·fail/cancel/skip0·exit0·stderr0입니다. HWP5 비숫자 거부48곳의 유효 숫자 대체/이력/저장 텍스트를 검사했으며 독립 수식 산술 증명은 아닙니다. HWPX 숫자48곳은 normal/-O 독립 XML·산술 oracle로13계산 결과를 상대허용오차1e-5로 대조하고 저장 재열기/이력을 확인했습니다. 수동 결과13곳도 별도 명시적 API의 독립 XML·ZIP/이력/재열기를 검사했습니다. ABI 일부 부재와 잘못된 좌표·문자·크기 거부가 이력을 보존하는 음성 대조도 포함합니다.

전체 native runtime·실제 브라우저·RHWP UI 동치·원본 페이지 조판 완료의 증거는 아닙니다. 암호와 수동 계산 결과의 명시적 경로도 기본 prefix 감사와 구분합니다.
