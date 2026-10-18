# unknownObj 후보의 추적 문서 편집 재검증

## 범위

후보 SHA256은 eaaa0d2007a2e02fce27335e6218379284108e756e285d4859cad28167d0fe5f입니다. `/tmp/hwpjs-unknown-anchor-probe.1MV5w4`의 동결 JS/도구와 별도 Git index로 추적101경로(HWP55/HWPX46)를 제공했습니다. 실제 보고서의101경로·중복 부재와 현재 Git 목록을 비교했고 동결/현재 작업 트리 입력 바이트도 모두 같았습니다. 기본/외부 WASM은 교체하지 않았습니다.

## HWP5 입력·이력

`unknown-tracked-hwp5-history.json/.stderr`는 exit0·stderr0입니다. HWP5의53파일은 모든 문단 prefix 입력, chart1파일은48개 비숫자 입력을 거부하는 부분 지원, 암호1파일은 기본 읽기 거부입니다. 열린2,090문단 중2,042곳에 실제 입력·독립 CFB 텍스트/비대상 stream 대조·저장 재열기·undo/redo와 조판 상태 복원을 확인했습니다. 거부48개는 모두 InvalidFormulaNumber이며 입력/이력 성공에 합산하지 않습니다. 이 도구의 HWPX45개 분류와 암호1개 거부는 HWPX 편집 성공이 아닙니다.

## 숫자 의존 셀

같은 후보의 `unknown-numeric-corpora.log/.stderr`는 두 파일4/4·fail/skip/cancel0·exit0·stderr0(23558.56ms)입니다. HWP5 chart의 독립 레코드 의존 목록48곳에서500/1000000 두 규모의 실제 숫자 변경·13계산 결과·전체 비대상 stream·이력·재열기를 검사했습니다. 일반 숫자 표시의 경계 기대값도 독립 검사했습니다. HWPX chart의 독립 XML 목록48곳은 유효 숫자 변경·SUM/AVG 결과/캐시·전체 XML/ZIP·undo/redo·재열기/재저장과 normal/-O 변조 거부를 검사했습니다. 서로 다른 포맷·반복 규모를 한 개의 문단 성공 수로 합산하지 않습니다.

## 기본 거부의 명시적 경로

참조 전체 reader의 같은5거부는 [응답 대조](unknown-reader-parity-current.md)를 따릅니다. 암호 제공과 저장 구역 읽기/명시적 사본 편집, 추적 암호 두 포맷의 편집 경로 네 파일은 동결 소스의 `unknown-refused-reader-paths-frozen.log`에서14/14·fail/skip/cancel0·exit0(8953.749791ms)입니다. 비밀번호 틀림·원본/복호화 buffer 불변·암호 복호화 후 HWPX418/HWP54282문단·구역 불일치3원본의 엄격 읽기 거부 유지·저장 구역 수/전체 문단·명시적 사본의 이력/재열기를 검사했습니다. 먼저 현재 작업 트리에서 실행한 별도14/14는 `unknown-refused-reader-paths-worktree.log`로 보관하며 동결 결과와 합산하지 않습니다.

구역이 없는 원본을 자동 복구하거나 빠진 내용을 생성한 검사가 아닙니다. 사본은 missingContentRecovered=false와 별도 이력 기준을 유지하며, 비밀번호 변환은 원본 보호 유지/재암호화 저장 지원이 아닙니다. 기본 읽기 거부를 소급 성공으로 바꾸지 않습니다.

HWPX Worker 전수는 별도 실행/판정이며 이 문서의 HWP5 성공 수를 HWPX·전체 GUI·원본 조판·모든 편집 명령 완료로 확대하지 않습니다. 실제 unknownObj 한 문단의 Chromium 증거는 [브라우저 검증](hwpx-unknown-object-browser.md)이 소유합니다.
