# 기존 거부 좌표의 필드 경로와 실제 계산 결과 편집

후속 [unknownObj 보호 앵커](hwpx-unknown-object-anchors.md) 검증 후보는 같은67좌표에서 prefix4/계산 결과35/거부28입니다. 아래2589a92e의3/35/29는 해당 시점 기록이며 후속 결과와 합산하지 않습니다.

## 좌표 재조회

과거432 HWPX의213,765문단 조회에서 거부된67좌표만 대상으로 합니다. 원래 조사 범위는 [참조 조회 기록](reference-prefix-query-current.md)을 따릅니다. 새 전체 문단 조사나 모든 거부 해소를 주장하지 않습니다.

`tools/recheck-reference-refusals.mjs`는 완료된 원래 JSONL의 거부 목록을 읽고 파일 해시가 그대로인지 확인합니다. 일반/anchor/필드 prefix가 없으면 별도 수동 계산 결과 대상을 조회합니다. 조회 뒤 저장은 입력 전체와 같아야 하며 원본/WASM 해시도 유지돼야 합니다. 조회 성공은 실제 편집 성공과 분리합니다.

ReleaseSafe2589a92e5e53b0fa222d373f78cba64900a1ae623f19a9c4ea6195df1290634c에서12파일·67좌표는 prefix3/수동 계산 결과35/거부29입니다. `/tmp/hwpjs-formula-paragraphs.p5JzbK/refused-recheck-title-v4.jsonl/.stderr`가 summary까지 기록됐고 exit0·stderr0입니다. 제목 책갈피1곳의 실제 편집은 [별도 계약](hwpx-title-field-label.md)을 따릅니다. 거부29곳을29개의 파서 버그로 해석하지 않습니다.

남은 `issue5729/stacked_tac_band_om_top.hwpx`의 마지막 문단32는 CLICK_HERE id1854889790의 시작은 있지만 대응 끝이 없습니다. 독립 XML 순회에서 ZIP의 유일한 section0은 matching-begins1/matching-ends0입니다. 임의로 닫거나 필드 바깥으로 간주하지 않습니다. issue1891의 기존 미닫힘 보호27곳과 issue6035의 미지원 객체 혼합1곳도 여전히 별도 미해결입니다.

## 실제35좌표 편집

`tools/edit-refused-formula-results.mjs`는 같은 WASM 해시의 재조회 JSONL만 받습니다. 관측35좌표·각 대상1개를 단언하고 기존 formulaSources의 begin_element로 정확한 ordinal을 찾습니다. `setManualFormulaResult`로 결과 텍스트만 바꾸며 계산식 자체를 편집하거나 수식 엔진의 동치를 주장하지 않습니다.

게시 도구는 중복 좌표와 재조회 이후의 입력 해시 변경을 실제 편집 전에 거부합니다. 재조회도 마지막에 디스크의 WASM 해시를 다시 읽고, TypeError/RangeError/RuntimeError 등의 런타임 결함을 정상 거부 좌표로 삼키지 않습니다. 인자/중복 guard5개는 fail/skip/cancel0으로 통과했습니다.

동일 후보에서7파일·35개의 중복 없는 좌표 모두 실제 입력→독립 XML/ZIP 전체 비교(normal/-O)→틀린 예상값 거부→원본 undo→금지 XML 문자 거부→redo→재열기/재저장 동일성을 통과했습니다. `formula-reference-edits-v4.jsonl/.stderr`의 최종 edited35/expected35·exit0·stderr0을 확인했고 각 inputHash도 최초 완료 조사와 모두 일치했습니다. 저장한 사본 해시는 각 행에 기록하며 원본 파일을 덮어쓰지 않습니다.

해시/중복 guard를 포함한 최종 도구도 재실행했습니다. `refused-recheck-published-tool.jsonl/.stderr`는 같은3/35/29 summary·exit0·stderr0입니다. 51012899의 동결 JS 소스를 가진 `/tmp/hwpjs-title-group-native.6U4qUw`에서 최종 도구의 `formula-edits-guarded.jsonl/.stderr`는35/35·exit0·stderr0이며 초기 실행과 합산하지 않습니다.

관측 파일은143E433F503322BD33(3),aift(1),issue1891_external_bindata_link(5),issue3637/regulatory_impact_nested_table_escape(3),issue5543_carried_anchor_ladder(14),issue6298/copay_cap_tac_table_leading(5),tac-img-02(4)입니다. 괄호는 검사 좌표 수이며 파일 전체의 모든 필드 명령·Worker·Canvas·실제 브라우저 검사 수가 아닙니다.

재현은 먼저 `HWPJS_TEST_WASM=/absolute/candidate.wasm node tools/recheck-reference-refusals.mjs /absolute/completed-prefix-audit.jsonl > recheck.jsonl`, 이어 `HWPJS_TEST_WASM=/absolute/candidate.wasm node tools/edit-refused-formula-results.mjs recheck.jsonl`입니다. 원래 완료 조사와 reference 파일이 필요하며, 대체 경로·다른 좌표 집합을 자동으로 같은35개로 인정하지 않습니다. 인자 guard는 `node --test tests/hwpx/reference-field-audit-arguments.test.mjs`입니다.

## Reader 회귀 경계

같은 후보와 직전c10f3382b7a8872c0305f4b8e7537ff1359e3f2e1e93875681668f3b782757fd의 독립 reader 대조는975개 고유 파일에 대해 응답 전체 동일944/동일 거부5/HWP3 제외26·exit0·stderr0입니다(`title-reader-parity.jsonl`,977행). 동일 거부는 지원 성공이 아니며 필드 편집35개와 합산하지 않습니다. 기본 WASM/데모 교체·전체 native gate·한글 조판 동치의 완료도 아닙니다.
