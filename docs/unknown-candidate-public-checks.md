# unknownObj 후보의 공개 API 회귀

## 소스와 산출물

`/tmp/hwpjs-hwpx-public-current.pbeDpJ`는 e9d24ba4의 build.zig/js/web/tools/tests 사본과 원본 fixture 연결을 사용합니다. WASM 후보는eaaa0d2007a2e02fce27335e6218379284108e756e285d4859cad28167d0fe5f입니다. 명시적 HWPJS_TEST_WASM을 제공하며 고정 설치 경로를 읽는 검사도 이 사본의 zig-out/bin/hwpjs.wasm 연결을 통해 같은 후보를 사용합니다. 실제 제품 기본/외부 데모를 바꾼 것이 아닙니다.

## 수동 계산 결과

`manual-formula-family.log/.stderr`는 등록 목록에서 manual-formula-/manual-result- 아홉 파일을 선택해36/36·fail/skip/cancel0·exit0·stderr0(61810.010125ms)입니다. 결과/부분 문자열 편집·독립 전체 XML/ZIP normal/-O·정의와 다른 표시 보존·재열기·이력·실제 Worker·선택 export 부재/잘못된 좌표 거부·section2 oracle 반례가 포함됩니다. 별도 두 파일의 초기 재현도 `manual-formula-focused.log`에서3/3·exit0입니다. 반복 결과는 합산하지 않습니다.

첫 등록95파일 실행 중 디스크 여유가 고갈됐고 일부 수동 결과 검사에서 실패가 기록됐습니다. `registered-hwpx-95.log/.stderr`는 child exit1로 끝났으나 전체 테스트 합계/상세 오류가 없어 완료 근거가 부족합니다. 이후 공간 확보 뒤의36/36은 첫 실행의 실패를 소급 통과로 바꾸지 않습니다. 첫 실행의 모든 실패 원인을 디스크로 단정하지 않습니다.

## 명시적 차트 기준 대조

`chart-baseline-explicit.log/.stderr`는1/1·fail/skip/cancel0·exit0·stderr0(4192.266042ms)입니다. 기준은2589a92e5e53b0fa222d373f78cba64900a1ae623f19a9c4ea6195df1290634c이며28개 참조 차트의 원래 전체 node/site/point 응답, 호스트 입력28개, 숫자/문자 변경56개와 undo/redo를 두 후보에서 비교했습니다. 기준과 같은 오류 가능성까지 배제하는 독립 조판 oracle은 아닙니다. 첫 등록95파일 실행의 기준 환경변수 부재 skip1건과 이 명시적 실행을 한 번의 무건너뜀 gate로 합산하지 않습니다.

## 상세 TAP 재실행과 환경 실패

같은 e9d24ba4 소스·후보·95파일을 명시적 기준 WASM과 TAP reporter로 재실행한 `registered-hwpx-95-tap.log/.stderr`는288개·pass283/fail5/cancel0/skip0·exit1·stderr0(887305.410666ms)입니다. 다섯 실패는 모두 MEMO의 독립 oracle 입력을 임시 파일에 쓰는 `tools/oracle-process.mjs:15`의 ENOSPC입니다. 파서/저장 XML의 단언 실패로 바꾸지 않습니다. 전체 gate 통과도 아닙니다.

공간 확보 뒤 같은 소스와 WASM에서 해당 두 파일을 재실행한 `memo-resource-retry.log/.stderr`는5/5·fail/cancel/skip0·exit0·stderr0(151578.225584ms)입니다. 실제 Worker MEMO label·주석과 표시의 동시 편집·잘못된 metadata의 거부/redo·두 실제 원본의 전체 XML/ZIP을 검사합니다. 이5개 통과를 앞선283개와 합쳐 한 번의288개 전체 gate 성공으로 주장하지 않습니다.

## 추가 참조 원본의 필드 위치 불일치

등록 gate 밖의 `reference/rhwp/samples/task1789/exclusion_probe_line_spacing.hwpx`를 같은082cf938 사본·eaaa0d20 후보로 검사한 `task1789-current-specialized.log/.stderr`는 exit1입니다. 실행에는120초 상한을 두었으며 시간 초과가 아니라 `Unexpected XML change outside the chosen field prefix`로 종료했습니다. 옛77b60b82 후보의 장기 감사 로그에도 같은 원본의 같은 오류가 있었으나 새 재현과 합산하지 않습니다.

별도 공개 API 재현에서 구역0·문단17의 `anchorText`는 UnsupportedStructuralFieldEdit, `fieldRangeTarget(0,17,0,0)`은 beginElement211/start0/end68입니다. 독립 XML inventory의 해당 필드는 id1878228493입니다. 원본 문단 첫 run에는 tbl 다음에 `2. ` 텍스트가 있고, 저장 diff는 이 run의 tbl 앞에 prefix 텍스트를 새로 넣습니다. fieldBegin.dirty는 원래1입니다. 반면 현재 필드 oracle은 해당 문단의 첫 텍스트인 표 뒤 `2. `에 prefix를 넣은 기대 트리를 만듭니다. 따라서 이 원본은 현재 oracle과 저장 위치가 일치하지 않습니다. 이 관측만으로 제품 오류 또는 oracle 오류를 확정하거나 검증을 완화하지 않습니다. 필드의 표시 위치/앞선 개체와 원문 위치 계약을 대조한 뒤 회귀를 추가해야 하며, 이 원본의 필드 prefix 검증은 미해결입니다.

## 등록 gate 상태

도구 탭을 더한082cf938의 build/js/web/tools/tests2,046개 Git blob과 정확히 같은 `/tmp/hwpjs-ribbon-preview.yjDs24`에서 등록97파일·concurrency1·명시적 후보/기준·TAP의 `registered-hwpx-97-tap.log/.stderr`를 새로 시작했습니다. 고정 설치 경로를 읽는 검사에도 이 사본의 zig-out/bin 연결로 같은 후보를 제공합니다. 실행 중이며 완료로 세지 않습니다. [도구 탭 집중 검증](document-ribbon.md)이나 앞선95파일 결과를 새 전체 gate로 합산하지 않습니다.

위 집중 통과가 최신 전체 native gate·전체 HWPX 공개 gate·브라우저/조판·임의 명령/위치 완료를 뜻하지 않습니다. 실제 픽스쳐 입력/저장 전수는 [후보 추적 감사](unknown-candidate-fixture-verification.md), 실제 HWP5 화면 검증은 [로드맵 브라우저](hwp5-roadmap-browser-roundtrip.md)가 소유합니다.
